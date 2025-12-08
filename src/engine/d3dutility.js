import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import JSZip from 'jszip';
import D3DConsole from './d3dconsole.js';

export const MIME_D3D_ROW = "application/x-d3d-objectrow";

export function arraysEqual(a, b) {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

export async function cloneZip(zip) {
	if(!zip) return;
	const raw = await zip.generateAsync({ type: 'arraybuffer' });
	return await JSZip.loadAsync(raw);
}
export async function moveZipEntry(zip, srcPath, destDir, { updateIndex }) {
	const nd = p => (p.endsWith('/') ? p : p + '/');
	const nf = p => p.replace(/\/+$/, '');
	const base = p => nf(p).split('/').pop();
	
	const entry = zip.files[srcPath] ?? zip.files[srcPath + '/'];
	
	if(!entry)
		throw new Error(`${srcPath} not found for move`);
	
	if(entry.dir) {
		const name = base(srcPath);
		const trueDestDir = nd(destDir + name);

		if(!srcPath.endsWith('/'))
			srcPath += '/'; // dir must always end with /

		const srcDir   = nd(srcPath);
		const destDirN = nd(destDir);

		// guard: cannot move into itself or descendant
		if (destDirN == srcDir || destDirN.startsWith(srcDir)) {
			throw new Error('Cannot move a folder into itself or its descendant');
		}

		// guard: already in destination (same parent)
		const srcParent = srcDir.slice(0, srcDir.slice(0, -1).lastIndexOf('/') + 1);
		if (srcParent == destDirN) {
			return {
				dir: destDir,
				path: srcPath
			}
		}

		const paths = Object.keys(zip.files).filter(
			path => path == srcPath || path.startsWith(srcPath)
		);

		await Promise.all(paths.map(async path => {
			const file = zip.files[path];
			const destPath = (path == srcPath) ? trueDestDir : (trueDestDir + path.slice(srcPath.length));

			if (file.dir) {
				zip.folder(destPath);
				updateIndex?.(path, destPath);
			} else {
				const data = await file.async('arraybuffer');
				zip.file(destPath, data, { date: file.date, comment: file.comment });
				updateIndex?.(path, destPath);
			}
		}));

		paths.forEach(path => zip.remove(path));

		return {
			dir: destDir,
			path: trueDestDir
		}
	}else{
		const data = await entry.async('arraybuffer');
		const fname = fileName(srcPath);
		const destPath = `${destDir}${fname}`;

		// guard: already in destination (same parent)
		const srcParent = nf(srcPath).slice(0, nf(srcPath).lastIndexOf('/') + 1);
		const destDirN = nd(destDir);
		
		if (srcParent == destDirN) {
			return {
				dir: destDir,
				path: srcPath
			}
		}

		const newFile = zip.file(destPath, data, { date: entry.date, comment: entry.comment });
		updateIndex?.(srcPath, destPath);
		
		const symbol = Object.values(_root.__symbols).find(s => s.file.name == srcPath);
		if(symbol)
			symbol.file = newFile;

		zip.remove(srcPath);

		return {
			dir: destDir,
			path: destPath
		}
	}
}
export async function renameZipFile(zip, oldPath, newBaseName, updateIndex) {
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
	
	updateIndex(oldPath, targetPath);
	
	_root.updateSymbolStore();

	return targetPath;
}
export async function renameZipDirectory(zip, oldDirPath, newBaseName, updateIndex) {
	if (typeof updateIndex !== 'function')
		throw new Error('renameZipDirectory requires updateIndex callback');

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
	const newDirPath = uniqueDirPath(zip, parentPath, safe); // ends with '/'

	// no-op if unchanged
	if (newDirPath === oldDirPath) return oldDirPath;

	// collect all entries under the old dir
	const toRemove = [];
	const copyPromises = [];
	const remaps = [];

	zip.forEach((rel, file) => {
		if (!rel.startsWith(oldDirPath)) return;

		const suffix = rel.slice(oldDirPath.length);
		const target = newDirPath + suffix;

		if (file.dir) {
			if (!pathExists(zip, target)) zip.folder(target);
		} else {
			copyPromises.push(file.async('arraybuffer').then(buf => zip.file(target, buf)));
		}

		toRemove.push(rel);
		remaps.push({ oldRel: rel, newRel: target });
	});

	await Promise.all(copyPromises);

	toRemove.forEach(p => zip.remove(p));
	zip.remove(oldDirPath);

	// remap the directory stub itself
	remaps.push({ oldRel: oldDirPath, newRel: newDirPath });

	// apply remaps
	for (const { oldRel, newRel } of remaps) {
		updateIndex(oldRel, newRel);
	}

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
export function dropToGroundIfPossible(d3dobject) {
	const hit = _physics.raycast(d3dobject.position, new THREE.Vector3(0, -1, 0), {
		filter: o => o.rootParent != d3dobject.rootParent
	});
	
	if(hit) {
		d3dobject.setPosition(hit.point);
	}
}
export function fileName(filePath) {
	const a = filePath.split(/[\\/]/);
	let n = a.pop();
	
	if(!n) n = a.pop();
		
	return n || '';
}
export function fileNameNoExt(filePath) {
	const a = filePath.split(/[\\/]/);
	let n = a.pop();

	if (!n) n = a.pop();
	if (!n) return '';

	// strip extension if present
	const i = n.lastIndexOf('.');
	if (i > 0) {
		return n.substring(0, i);
	}
	return n;
}
export function isDirectory(zip, p) {
	if(!p) return false;
	const dir = p.endsWith('/') ? p : (p + '/');
	let hasChild = false;
	zip.forEach((rel, f) => { if (rel.startsWith(dir) && !f.dir) hasChild = true; });
	// If it has children, treat it as a folder even if a file entry also exists.
	return hasChild || (zip.files[dir]?.dir == true);
}
export function approx(v1, v2, epsilon) {
	if (!epsilon)
		epsilon = 0.001;
	
	return Math.abs(v1 - v2) < epsilon;
};
export function getAnimTargets(clip) {
	const targets = new Set();

	if (!clip || !Array.isArray(clip.tracks))
		return [];

	for (let i = 0; i < clip.tracks.length; i++) {
		const tr = clip.tracks[i];
		if (!tr || !tr.name)
			continue;

		// format is "NodeName.property"
		const dot = tr.name.indexOf('.');
		const nodeName = dot >= 0 ? tr.name.slice(0, dot) : tr.name;

		if (nodeName)
			targets.add(nodeName);
	}

	return Array.from(targets);
}
export function isUUID(str) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}
export function upperFirst(str) {
	if (typeof str !== 'string' || str.length === 0)
		return str;
	
	return str.charAt(0).toUpperCase() + str.slice(1);
}
// Convert numeric 0xRRGGBBAA (or 0xRRGGBB) → picker input ('0xRRGGBBAA')
export function numToHex(n) {
	// Clamp into 32-bit unsigned int
	const v = Number(n) >>> 0;

	// Split into channels
	const r = (v >> 24) & 0xFF;
	const g = (v >> 16) & 0xFF;
	const b = (v >> 8)  & 0xFF;
	const a = v & 0xFF;

	// If alpha channel is zero (no alpha info), default to FF (opaque)
	const alpha = (n > 0xFFFFFF) ? a : 0xFF;

	// Repack with alpha
	const rgba = (r << 24) | (g << 16) | (b << 8) | alpha;

	return '0x' + rgba.toString(16).toUpperCase().padStart(8, '0');
}

// Convert picker output ('0xRRGGBBAA') → numeric 0xRRGGBBAA
export function hexToNum(s) {
	if (!s) return 0xFFFFFFFF;
	if (s.startsWith('#')) s = '0x' + s.slice(1);

	let v = Number(s);
	if (!Number.isFinite(v)) v = 0xFFFFFFFF;

	// If no alpha (0xRRGGBB), shift left and add 0xFF
	if (String(s).length <= 8) v = (v << 8) | 0xFF;

	return v >>> 0;
}
export function hexToRgba(str, fallback = 'rgba(255,255,255,1)') {
	if (!str) return fallback;
	let s = String(str).trim();
	if (s.startsWith('0x')) s = '#' + s.slice(2);
	if (!s.startsWith('#')) return s;
	if (s.length === 7) {
		const r = parseInt(s.slice(1, 3), 16);
		const g = parseInt(s.slice(3, 5), 16);
		const b = parseInt(s.slice(5, 7), 16);
		return `rgba(${r},${g},${b},1)`;
	}
	if (s.length === 9) {
		const r = parseInt(s.slice(1, 3), 16);
		const g = parseInt(s.slice(3, 5), 16);
		const b = parseInt(s.slice(5, 7), 16);
		const a = parseInt(s.slice(7, 9), 16) / 255;
		return `rgba(${r},${g},${b},${a})`;
	}
	return fallback;
}
export function getSelectionCenter(selectedObjects) {
	if (!selectedObjects || selectedObjects.length === 0) 
		return new THREE.Vector3(0, 0, 0);

	const center = new THREE.Vector3();
	let count = 0;

	for (const obj of selectedObjects) {
		const pos = obj?.object3d?.position;
		if (pos && pos.isVector3) {
			center.add(pos);
			count++;
		}
	}

	if (count > 0)
		center.divideScalar(count);

	return center;
}
export function randUnitVec3() {
	const u = Math.random()*2 - 1;
	const t = Math.random()*Math.PI*2;
	const s = Math.sqrt(1 - u*u);
	return new THREE.Vector3(Math.cos(t)*s, u, Math.sin(t)*s);
}
export function parseColor(v) {
	if (!v) return { r:1, g:1, b:1, a:1 };

	// String inputs
	if (typeof v === 'string') {
		const s = v.trim().toLowerCase();

		// --- hex formats: #rrggbb, #rrggbbaa, 0xrrggbb, 0xrrggbbaa ---
		if (s[0] === '#' || s.startsWith('0x')) {
			let hex = s.startsWith('0x') ? s.slice(2) : s.slice(1);

			// expand shorthand (#f80 → #ff8800)
			if (hex.length === 3 || hex.length === 4) {
				hex = hex.split('').map(ch => ch + ch).join('');
			}

			let r=255,g=255,b=255,a=255;
			if (hex.length === 8) {
				r = parseInt(hex.slice(0,2),16);
				g = parseInt(hex.slice(2,4),16);
				b = parseInt(hex.slice(4,6),16);
				a = parseInt(hex.slice(6,8),16);
			} else if (hex.length === 6) {
				r = parseInt(hex.slice(0,2),16);
				g = parseInt(hex.slice(2,4),16);
				b = parseInt(hex.slice(4,6),16);
			} else if (hex.length === 4) {
				// rgba short 0xf80c
				r = parseInt(hex.slice(0,1).repeat(2),16);
				g = parseInt(hex.slice(1,2).repeat(2),16);
				b = parseInt(hex.slice(2,3).repeat(2),16);
				a = parseInt(hex.slice(3,4).repeat(2),16);
			} else if (hex.length === 3) {
				r = parseInt(hex.slice(0,1).repeat(2),16);
				g = parseInt(hex.slice(1,2).repeat(2),16);
				b = parseInt(hex.slice(2,3).repeat(2),16);
			}

			return { r:r/255, g:g/255, b:b/255, a:a/255 };
		}

		// --- rgb()/rgba() ---
		if (s.startsWith('rgb')) {
			const m = s.match(/rgba?\s*\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)(?:\s*[,/]\s*([0-9.]+))?\s*\)/i);
			if (m) {
				let r = parseFloat(m[1]);
				let g = parseFloat(m[2]);
				let b = parseFloat(m[3]);
				let a = (m[4] !== undefined) ? parseFloat(m[4]) : 1;

				if (r > 1 || g > 1 || b > 1) { r/=255; g/=255; b/=255; }
				if (a > 1) a/=255;
				return { r, g, b, a };
			}
		}

		// fallback → white
		return { r:1, g:1, b:1, a:1 };
	}

	// --- Object inputs ---
	if (typeof v === 'object') {
		let r = v.r ?? v.red ?? 1;
		let g = v.g ?? v.green ?? 1;
		let b = v.b ?? v.blue ?? 1;
		let a = v.a ?? v.alpha ?? 1;
		if (r > 1 || g > 1 || b > 1) { r/=255; g/=255; b/=255; }
		if (a > 1) a/=255;
		return { r:+r||0, g:+g||0, b:+b||0, a:+a||0 };
	}

	// fallback
	return { r:1, g:1, b:1, a:1 };
}
/*export function applyOpacity(o, opacity) {
	if (o.material) {
		if (Array.isArray(o.material)) {
			o.material.forEach(m => {
				m.transparent = opacity < 1;
				m.opacity = opacity;
				m.needsUpdate = true;
			});
		} else {
			o.material.transparent = opacity < 1;
			o.material.opacity = opacity;
			o.material.needsUpdate = true;
		}
	}
}*/
export function applyOpacity(o, opacity) {
	if (o.material) {
		const applyMat = (m) => {
			if (!m) return;

			const ud = m.userData || (m.userData = {});

			// Base (authoring) opacity coming from the material itself
			if (ud._baseOpacity == null) {
				ud._baseOpacity = (typeof m.opacity === 'number' ? m.opacity : 1);
			}

			const eff = ud._baseOpacity * opacity;

			m.transparent = eff < 1;
			m.opacity = eff;
			m.needsUpdate = true;
		};

		if (Array.isArray(o.material)) {
			o.material.forEach(applyMat);
		} else {
			applyMat(o.material);
		}
	}

	if (o.children && o.children.length) {
		for (const c of o.children) applyOpacity(c, opacity);
	}
}

export function toggleAllLights(scene, enabled) {
	if (!(scene instanceof THREE.Scene)) {
		console.warn('toggleAllLights: provided object is not a THREE.Scene');
		return;
	}
	scene.traverse((obj) => {
		// Skip editor light (or any light you mark to ignore)
		if (obj.isLight && obj.userData?.ignoreGlobalLightToggle) return;
		toggleLight(obj, enabled);
	});
}

export function toggleLight(obj, enabled) {
	if (!obj.isLight) return;

	ensureIntensityProxy(obj);
	obj.userData._toggleDisabled = !enabled; // proxy shows 0 when disabled
	obj.visible = enabled;
}

// same ensureIntensityProxy from before
function ensureIntensityProxy(light) {
	if (light.userData._hasIntensityProxy) return;
	if (light.userData._rawIntensity === undefined) {
		light.userData._rawIntensity = light.intensity;
	}
	Object.defineProperty(light, 'intensity', {
		get() { return this.userData._toggleDisabled ? 0 : this.userData._rawIntensity; },
		set(v) { this.userData._rawIntensity = v; },
		configurable: true,
		enumerable: true
	});
	light.userData._hasIntensityProxy = true;
}

export function buildConvexWireGeometry(verts, puff = 1.005) {
	if (!(verts instanceof Float32Array) || (verts.length % 3) !== 0) {
		throw new Error('[buildConvexWireGeometry] verts must be Float32Array with length % 3 === 0');
	}
	if (!(Number.isFinite(puff)) || puff <= 0) {
		throw new Error('[buildConvexWireGeometry] puff must be a positive finite number');
	}

	// Compute centroid for gentle outward "puff"
	let cx = 0, cy = 0, cz = 0;
	for (let i = 0; i < verts.length; i += 3) {
		cx += verts[i + 0];
		cy += verts[i + 1];
		cz += verts[i + 2];
	}
	const count = verts.length / 3;
	cx /= count; cy /= count; cz /= count;

	// Build point objects (identity-preserved for indexing later)
	const pts = new Array(count);
	const pointToIndex = new Map();
	for (let i = 0, j = 0; i < count; i++, j += 3) {
		const x = verts[j + 0], y = verts[j + 1], z = verts[j + 2];
		if (puff !== 1) {
			const dx = x - cx, dy = y - cy, dz = z - cz;
			pts[i] = new THREE.Vector3(cx + dx * puff, cy + dy * puff, cz + dz * puff);
		} else {
			pts[i] = new THREE.Vector3(x, y, z);
		}
		pointToIndex.set(pts[i], i);
	}

	// Convex hull
	const hull = new ConvexHull().setFromPoints(pts);

	// Collect unique edges from faces
	const edgeSet = new Set(); // "i-j" with i < j
	hull.faces.forEach((face) => {
		let e = face.edge;
		do {
			const ia = pointToIndex.get(e.head().point);
			const ib = pointToIndex.get(e.tail().point);
			if (ia == null || ib == null) {
				throw new Error('[buildConvexWireGeometry] failed to map hull edge vertices to indices');
			}
			const a = Math.min(ia, ib);
			const b = Math.max(ia, ib);
			edgeSet.add(`${a}-${b}`);
			e = e.next;
		} while (e !== face.edge);
	});

	// Positions for line segments
	const positions = new Float32Array(edgeSet.size * 2 * 3);
	let k = 0;
	for (const key of edgeSet) {
		const [a, b] = key.split('-').map(Number);
		const A = pts[a], B = pts[b];
		positions[k++] = A.x; positions[k++] = A.y; positions[k++] = A.z;
		positions[k++] = B.x; positions[k++] = B.y; positions[k++] = B.z;
	}

	const geom = new THREE.BufferGeometry();
	geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	return geom;
}
export function updateObject(methods, d3dobj) {
	if (!d3dobj) return;
	
	if (d3dobj.enabled) {
		for (let i = 0, n = methods.length; i < n; i++) {
			const name = methods[i];
			const fn   = d3dobj[name];
			
			if (typeof fn !== 'function') 
				continue;
			
			try {
				fn.call(d3dobj);
			} catch (e) {
				D3DConsole.error(`[${d3dobj.name}][${name}]`, e.name, e.message);
				console.error(`[${d3dobj.name}][${name}]`, e);
			}
		}
	}
	
	const children = d3dobj.children;
	if (!children || children.length === 0) 
		return;
	
	for (let i = 0, n = children.length; i < n; i++) {
		updateObject(methods, children[i]);
	}
}
export function getHitNormalRotation(face, d3dobject) {
	const object3d = d3dobject?.object3d;
	
	if(!object3d)
		return;
	
	// Convert local-space face normal to world-space
	const worldNormal = face.normal.clone()
		.transformDirection(object3d.matrixWorld)
		.normalize();

	// Create a rotation that makes object's +Y axis align with worldNormal
	const quat = new THREE.Quaternion();
	const up = new THREE.Vector3(0, 1, 0);

	// Handle edge case where normal is nearly opposite to up
	if (Math.abs(up.dot(worldNormal)) > 0.9999) {
		// Flip 180° around X if pointing straight down
		quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
	} else {
		const axis = new THREE.Vector3().crossVectors(up, worldNormal).normalize();
		const angle = Math.acos(THREE.MathUtils.clamp(up.dot(worldNormal), -1, 1));
		quat.setFromAxisAngle(axis, angle);
	}

	return quat;
}
export function isLiveObject(d3dobject) {
	return !!d3dobject && d3dobject?.enabled === true;
}
export async function applyTextureToSceneBackground(root, zip, scene, assetId) {
	if(!zip || !assetId) 
		return;
	
	const path = root.resolvePath(assetId);
	
	if(!path) {
		console.warn(assetId, 'not found asset for bg texture');
		return;
	}
	
	const file = zip.file(path);
	if (!file) {
		console.warn('Background texture not found in zip:', path);
		return;
	}
	
	// Load as base64 -> data URL (no need for Blob/ObjectURL bookkeeping)
	const base64 = await file.async('base64');
	const src = `data:image/png;base64,${base64}`;
	
	const loader = new THREE.TextureLoader();
	
	await new Promise((resolve, reject) => {
		loader.load(
			src,
			(tex) => {
				// assume sRGB image
				if ('colorSpace' in tex) {
					tex.colorSpace = THREE.SRGBColorSpace;
				} else {
					tex.encoding = THREE.sRGBEncoding; // older three
				}
				
				// If user uses equirectangular panoramas, this gives proper mapping
				tex.mapping = THREE.EquirectangularReflectionMapping;
				
				scene.background = tex;
				resolve();
			},
			undefined,
			(err) => {
				console.error('Failed to load background texture:', err);
				resolve(); // don’t blow up the UI
			}
		);
	});
}
export function formatUtc(seconds, format) {
	const d = new Date(seconds * 1000);

	const day = d.getUTCDate();
	const month = d.getUTCMonth();     // 0–11
	const year = d.getUTCFullYear();
	let hour = d.getUTCHours();
	const minute = d.getUTCMinutes();

	const monthsLong = [
		"January","February","March","April","May","June",
		"July","August","September","October","November","December"
	];

	const monthsShort = [
		"Jan","Feb","Mar","Apr","May","Jun",
		"Jul","Aug","Sep","Oct","Nov","Dec"
	];

	// Suffixes: 1st, 2nd, 3rd, 4th…
	const suffix = (n) => {
		if (n % 10 === 1 && n % 100 !== 11) return n + "st";
		if (n % 10 === 2 && n % 100 !== 12) return n + "nd";
		if (n % 10 === 3 && n % 100 !== 13) return n + "rd";
		return n + "th";
	};

	// 12-hour format
	const ampm = hour >= 12 ? "PM" : "AM";
	let hour12 = hour % 12;
	if (hour12 === 0) hour12 = 12;

	const two = (n) => (n < 10 ? "0" + n : n);

	// Replace tokens
	return format
		.replace("jS", suffix(day))
		.replace("j", day)
		.replace("F", monthsLong[month])
		.replace("M", monthsShort[month])
		.replace("Y", year)
		.replace("h", two(hour12))
		.replace("i", two(minute))
		.replace("A", ampm);
}
export function justTime(time, hours = false, giveFuture = false) {
	if (!time) {
		return "Never";
	}

	// Convert to seconds if someone passed milliseconds
	if (time > 1e12) {
		time = Math.floor(time / 1000);
	}

	const now = Math.floor(Date.now() / 1000);
	let diff = now - time;

	// If we should show full date (future or forced)
	if (giveFuture || diff < 0) {
		return formatUtc(time, hours ? "jS F Y, h:i A" : "jS F Y");
	}

	if (diff < 60) {
		return "Just now";
	}
	if (diff < 3600) {
		return Math.floor(diff / 60) + "m";
	}
	if (diff < 86400) {
		return Math.floor(diff / 3600) + "h";
	}
	if (diff < 604800) {
		return Math.floor(diff / 86400) + "d";
	}
	if (diff < 2592000) {
		return Math.floor(diff / 604800) + "w";
	}

	// less than a year
	if (diff < 31536000) {
		return formatUtc(time, hours ? "j M, h:i A" : "j M");
	}

	// Over a year
	return formatUtc(time, "j M Y");
}
export function timestr(totalSeconds) {
	totalSeconds = Math.floor(totalSeconds);
	
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	
	const parts = [];
	
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (s > 0 || parts.length === 0) parts.push(`${s}s`);
	
	return parts.join(' ');
}
export function clockStr(totalSeconds) {
	totalSeconds = Math.floor(totalSeconds);

	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;

	const pad = n => String(n).padStart(2, '0');

	return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
export function versionToNumber(version) {
	// Split by '-' (prerelease)
	version = String(version);
	const parts = version.split('-');
	const main = parts[0];
	const pre  = parts[1] ?? null;

	// Parse major.minor.patch
	const [major, minor, patch] = main.split('.').map(n => parseInt(n, 10));

	// Base number: e.g. 1.2.3 → 1002003
	let number = major * 1_000_000 + minor * 1_000 + patch;

	// No prerelease → highest rank of this version
	if (!pre) {
		return number + 0.999;
	}

	// Parse prerelease: alpha.5, beta.12, rc.1, etc.
	let tag;
	let tagNum;

	const match = /^([a-zA-Z]+)\.(\d+)$/.exec(pre);
	if (match) {
		tag = match[1].toLowerCase();
		tagNum = parseInt(match[2], 10);
	} else {
		tag = pre.toLowerCase();
		tagNum = 0;
	}

	// Ordering for prerelease tags
	const tagOrder = {
		alpha: 1, a: 1,
		beta:  2, b: 2,
		rc:    3, pre: 3
	};

	const order = tagOrder[tag] ?? 0; // unknown → lowest

	// Add prerelease as fractional component
	return number + order * 0.001 + tagNum * 0.000001;
}
export function relNoAssets(rel) {
	let outName = rel.startsWith('assets/') ? rel.slice(7) : rel;
	outName = outName.replace(/^assets[\\/]/, '');
	
	return outName;
}
export function relNoExt(rel) {
	return rel.replace(/\.[^.]+$/, '');
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function forSeconds(s) {
	if (s == null || isNaN(s) || s < 0 || !Number.isFinite(s))
		throw new Error('Invalid seconds');
	return sleep(s * 1000);
}
export function forFrames(frames) {
	if (!Number.isFinite(frames) || isNaN(frames) || frames < 0)
		throw new Error('Invalid frames');

	const target = Math.floor(frames);
	if (target === 0)
		return Promise.resolve();

	return new Promise(resolve => {
		let remaining = target;

		function step() {
			remaining--;
			if (remaining <= 0)
				return resolve();

			requestAnimationFrame(step);
		}

		requestAnimationFrame(step);
	});
}