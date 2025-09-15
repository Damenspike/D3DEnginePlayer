export const MIME_D3D_ROW = "application/x-d3d-objectrow";

export function arraysEqual(a, b) {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}
export async function moveZipFile(zip, oldPath, newDir, opts = {}) {
	const updateIndex = opts.updateIndex || null;

	function ensureDirSlash(p) {
		return p.endsWith('/') ? p : p + '/';
	}
	function parentDir(p) {
		const i = p.lastIndexOf('/');
		return i >= 0 ? p.slice(0, i + 1) : 'assets/';
	}

	if (!newDir.endsWith('/')) newDir += '/';

	const oldFile = zip.file(oldPath);
	const isFile = !!oldFile;
	const isDir = !isFile && Object.keys(zip.files).some(p =>
		p.startsWith(oldPath.endsWith('/') ? oldPath : oldPath + '/')
	);

	if (!isFile && !isDir)
		throw new Error(`Path not found: ${oldPath}`);

	const baseName = (oldPath.split('/').pop() || '').replace(/\/$/, '');
	const targetBase = newDir + baseName;

	// prevent same-folder move
	const oldParent = parentDir(oldPath);
	if (newDir === oldParent)
		return oldPath;

	// Collect all rel changes to update the asset index after the move
	const renames = [];

	if (isFile) {
		if (targetBase === oldPath)
			return oldPath;

		const buf = await oldFile.async('arraybuffer');
		zip.file(targetBase, buf);
		zip.remove(oldPath);

		renames.push([oldPath, targetBase]);

		// apply index updates at the end
		if (updateIndex) {
			for (const [from, to] of renames) updateIndex(from, to);
		}
		return targetBase;
	}

	// Directory move
	const oldDirPath = ensureDirSlash(oldPath);
	let newDirPath = ensureDirSlash(targetBase);

	// prevent moving folder into itself/descendant
	if (newDirPath.startsWith(oldDirPath))
		throw new Error('Cannot move a folder into itself or its descendant.');

	if (newDirPath === oldDirPath)
		return oldDirPath;

	const toRemove = [];
	const copyJobs = [];

	zip.forEach((rel, file) => {
		if (!rel.startsWith(oldDirPath)) return;

		const suffix = rel.slice(oldDirPath.length);
		const target = newDirPath + suffix;

		if (file.dir) {
			zip.folder(target);
		} else {
			copyJobs.push(file.async('arraybuffer').then(buf => zip.file(target, buf)));
		}

		// Record every file/dir path change so the asset index can be updated
		renames.push([rel, target]);
		toRemove.push(rel);
	});

	await Promise.all(copyJobs);
	toRemove.forEach(p => zip.remove(p));
	zip.remove(oldDirPath);

	// Index updates
	if (updateIndex) {
		for (const [from, to] of renames) updateIndex(from, to);
	}

	return newDirPath;
}
export async function renameZipFile(zip, oldPath, newBaseName) {
	// validate source
	const src = zip.file(oldPath);
	if (!src || src.dir) throw new Error('File not found (or is a directory)');

	// keep original extension unless user typed one
	const lastSlash = oldPath.lastIndexOf('/') + 1;
	const dir = oldPath.slice(0, lastSlash).replace(/\/$/, ''); // e.g. "assets/img"
	const oldName = oldPath.slice(lastSlash);
	const dot = oldName.lastIndexOf('.');
	const ext = dot > 0 ? oldName.slice(dot) : '';

	const safe = makeSafeFilename(newBaseName);
	if (!safe) throw new Error('Empty name');

	const hasDot = safe.includes('.');
	const desiredName = hasDot ? safe : (safe + ext);

	// compute a unique sibling file path in same folder
	const targetPath = uniqueFilePath(zip, dir, desiredName);

	// no-op if unchanged
	if (targetPath === oldPath) return oldPath;

	// read → write → remove
	const data = await src.async('arraybuffer');
	zip.file(targetPath, data);
	zip.remove(oldPath);

	return targetPath;
}
export async function renameZipDirectory(zip, oldDirPath, newBaseName) {
	// normalize to have trailing slash
	if (!oldDirPath.endsWith('/')) oldDirPath += '/';

	// must exist (at least one entry with this prefix)
	let found = false;
	zip.forEach((rel) => { if (rel.startsWith(oldDirPath)) found = true; });
	if (!found) throw new Error('Folder not found');

	const parentSlash = oldDirPath.lastIndexOf('/', oldDirPath.length - 2) + 1;
	const parentPath = oldDirPath.slice(0, parentSlash).replace(/\/$/, ''); // e.g. "assets"
	const safe = makeSafeFilename(newBaseName);
	if (!safe) throw new Error('Empty name');

	// compute a unique sibling directory path
	const newDirPath = uniqueDirPath(zip, parentPath, safe);

	// no-op if unchanged
	if (newDirPath === oldDirPath) return oldDirPath;

	// collect all entries under the old dir
	const toRemove = [];
	const copyPromises = [];

	zip.forEach((rel, file) => {
		if (!rel.startsWith(oldDirPath)) return;

		const suffix = rel.slice(oldDirPath.length);
		const target = newDirPath + suffix;

		if (file.dir) {
			// ensure subfolder entry exists
			if (!pathExists(zip, target)) zip.folder(target);
		} else {
			copyPromises.push(file.async('arraybuffer').then(buf => zip.file(target, buf)));
		}
		toRemove.push(rel);
	});

	await Promise.all(copyPromises);

	// remove old entries (files + folders + the stub itself)
	toRemove.forEach(p => zip.remove(p));
	zip.remove(oldDirPath);

	return newDirPath;
}
export function clearDir(zip, dirPath) {
	// make sure dir ends with slash
	if (!dirPath.endsWith('/')) dirPath += '/';

	for (const path of Object.keys(zip.files)) {
		// match only files *inside* the dir
		if (path.startsWith(dirPath) && path !== dirPath) {
			zip.remove(path);
		}
	}
}
export function pathExists(zip, path) {
	// file?
	if (zip.file(path)) return true;
	// dir? (must end with '/'; check by prefix)
	const dir = path.endsWith('/') ? path : path + '/';
	let found = false;
	zip.forEach((rel) => { if (rel.startsWith(dir)) found = true; });
	return found;
}
export function makeSafeFilename(name){
	return (name || '').replace(/[\\:*?"<>|]/g, '_').trim();
}
export function uniqueFilePath(zip, baseDir, desiredName) {
	const base = baseDir || 'assets';
	const name = makeSafeFilename(desiredName || 'New asset');
	let path = `${base}/${name}`;
	if (!pathExists(zip, path)) return path;

	// split "foo.bar" → "foo" + ".bar" (keep extension stable while uniquing)
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : '';

	let i = 2;
	for (;;) {
		const candidate = `${base}/${stem}_${i++}${ext}`;
		if (!pathExists(zip, candidate)) return candidate;
	}
}
export function uniqueDirPath(zip, baseDir, desiredFolderName) {
	const base = baseDir || 'assets';
	const name = makeSafeFilename(desiredFolderName || 'New folder');
	let candidate = `${base}/${name}/`;
	if (!pathExists(zip, candidate)) return candidate;

	let i = 2;
	for (;;) {
		candidate = `${base}/${name} (${i++})/`;
		if (!pathExists(zip, candidate)) return candidate;
	}
}
export function getExtension(path) {
	const lastDot = path.lastIndexOf('.');
	if (lastDot === -1) 
		return '';
	
	return path.slice(lastDot + 1).toLowerCase();
}
// check if a path in the zip is a directory
export function isDirPath(zip, path) {
	if(!path)
		return false;

	// normalize
	const dir = path.endsWith("/") ? path : path + "/";

	// if it exists directly as a dir entry
	if(zip.files[dir]?.dir)
		return true;

	// or if any file starts with it
	let found = false;
	zip.forEach((rel) => {
		if(rel.startsWith(dir))
			found = true;
	});
	return found;
}

// get parent directory path (without trailing slash, except root "assets")
export function parentDir(path) {
	if(!path || path === "assets")
		return "assets";

	const norm = path.endsWith("/") ? path.slice(0, -1) : path;
	const idx = norm.lastIndexOf("/");
	if(idx === -1)
		return "assets";
	return norm.slice(0, idx) || "assets";
}
export function pickWorldPointAtScreen(sx, sy, camera, scene) {
	const rect = _container3d.getBoundingClientRect();
	const ndc = new THREE.Vector2(
		(sx / rect.width) * 2 - 1,
		-(sy / rect.height) * 2 + 1
	);

	const raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(ndc, camera);

	// A) try real scene meshes (skip editor-only helpers/gizmo/camera)
	const pickables = [];
	scene.traverse(o => {
		if (!o.isMesh) return;
		if (o.userData?.editorOnly) return;
		if (o === _editor.gizmo?._group) return;
		pickables.push(o);
	});

	const hits = raycaster.intersectObjects(pickables, true);
	if (hits.length) {
		return hits[0].point.clone();
	}

	// B) fallback: intersect ground plane Y=0
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0
	const line = new THREE.Line3(
		raycaster.ray.origin,
		raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(10_000))
	);
	const out = new THREE.Vector3();
	if (plane.intersectLine(line, out)) {
		return out;
	}

	// C) last resort: some distance in front of the camera
	return camera.getWorldPosition(new THREE.Vector3())
		.add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(5));
}
export function dropToGroundIfPossible(obj3d) {
	const box = new THREE.Box3().setFromObject(obj3d);
	if (box.isEmpty()) {
		return;
	}
	const height = box.max.y - box.min.y;
	// move so its bottom touches y=0
	const worldPos = new THREE.Vector3();
	obj3d.getWorldPosition(worldPos);
	const deltaY = -box.min.y; // how much to lift/lower to bring bottom to 0
	// convert delta to local (parent space)
	const parent = obj3d.parent;
	if (parent) {
		const worldTarget = worldPos.clone().add(new THREE.Vector3(0, deltaY, 0));
		parent.worldToLocal(worldTarget);
		obj3d.position.copy(worldTarget);
	} else {
		obj3d.position.y += deltaY;
	}
	obj3d.updateMatrixWorld(true);
}
export function fileName(filePath) {
	const a = filePath.split(/[\\/]/);
	let n = a.pop();
	
	if(!n) n = a.pop();
		
	return n || '';
}