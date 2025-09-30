import { readLocalTRSFromZip } from './glb-instancer.js';
import { 
	getExtension, 
	fileNameNoExt,
	getAnimTargets
} from './d3dutility.js';

export async function onAssetDroppedIntoGameView(path, screenPos) {
	const zip = _root.zip;
	const ext = getExtension(path);

	switch (ext) {
		case 'd3dsymbol': {
			const symbol = Object.values(_root.__symbols).find(s => s.file.name === path);
			if (!symbol) {
				console.warn('Could not find symbol by path', path);
				break;
			}
			const d3dobject = await _editor.focus.createObject({ symbolId: symbol.symbolId });
			_editor.moveObjectToCameraView(d3dobject);
			_editor.setSelection([d3dobject]);
			break;
		}

		case 'glbcontainer':
		case 'gltfcontainer': {
			/*
				Extract animations
			*/
			const dir = path.endsWith('/') ? path : path + '/';
			const childFiles = [];
			const animFiles = [];
		
			zip.forEach((rel, f) => {
				if (f.dir)
					return;
		
				if (!rel.startsWith(dir))
					return;
		
				if (/\.(glb|gltf)$/i.test(rel)) {
					childFiles.push(rel);
				}
		
				if (/\.anim$/i.test(rel)) {
					animFiles.push(rel);
				}
			});
			childFiles.sort();
			animFiles.sort();
			
			let d3dparent;
		
			for (const childPath of childFiles) {
				const d3dobject = await spawnModelFromZip(childPath, zip, _root);
				if(!d3dparent)
					d3dparent = d3dobject;
			}
			
			/*
				Assign animation component if any
			*/
			if(animFiles.length > 0) {
				for(let path of animFiles) {
					const json = await _editor.readFile(path);
					try {
						const clip = JSON.parse(json);
						const targets = getAnimTargets(clip);
						
						d3dparent.addComponent('Animation', {
							clips: animFiles.map(path => _root.resolveAssetId(path))
						});
					}catch(e) {
						console.warn('Invalid animation clip', path);
						console.error(e);
					}
				}
			}
			_editor.moveObjectToCameraView(d3dparent);
			_editor.setSelection([d3dparent]);
			break;
		}

		case 'glb':
		case 'gltf': {
			const d3d = await spawnModelFromZip(path, zip, null);
			_editor.moveObjectToCameraView(d3d);
			_editor.setSelection([d3d]);
			break;
		}
	}
}

/* -----------------------------
   Shared model drop logic
------------------------------ */

async function spawnModelFromZip(assetPath, zip, parent) {
	const trs = await readLocalTRSFromZip(zip, assetPath);

	const d3dobject = await (parent || _editor.focus).createObject({
		name: fileNameNoExt(assetPath),
		position: trs?.position || { x:0, y:0, z:0 },
		rotation: trs?.rotation || { x:0, y:0, z:0 },
		// IMPORTANT: do NOT apply file scale here; the glTF scene already has it
		scale: { x:1, y:1, z:1 },
		components: [
			{ type: 'Mesh', properties: { mesh: _root.resolveAssetId(assetPath), materials: [] } }
		]
	});

	return d3dobject;
}