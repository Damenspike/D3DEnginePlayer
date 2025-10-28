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
			if(_editor.mode != '3D')
				_editor.mode = '3D';
			
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
			if(_editor.mode != '3D')
				_editor.mode = '3D';
			
			const d3d = await spawnModelFromZip(path, zip, null);
			_editor.moveObjectToCameraView(d3d);
			_editor.setSelection([d3d]);
			break;
		}
		
		case 'png':
		case 'jpg':
		case 'jpeg':
		case 'webp':
		case 'gif':
		case 'bmp':
		case 'svg': {
			if(_editor.mode != '2D')
				_editor.mode = '2D';
			
			const d3d = await spawnBitmapFromZip(path, zip, screenPos);
			_editor.setSelection([d3d]);
			break;
		}
	}
}


/* -----------------------------
   Spawn a 2D Bitmap from ZIP
------------------------------ */
async function spawnBitmapFromZip(assetPath, zip, screenPos) {
	const file = zip.file(assetPath);
	const blob = await file.async('blob');
	const url = URL.createObjectURL(blob);
	
	const img = await loadImage(url);
	const w = img.naturalWidth || img.width;
	const h = img.naturalHeight || img.height;

	const name = fileNameNoExt(assetPath);
	const source = _root.resolveAssetId(assetPath);
	const depth = _editor.focus.getNextHighestDepth();

	const d3dobject = await _editor.focus.createObject({
		name: 'Bitmap',
		position: { x: screenPos.x, y: screenPos.y, z: depth },
		rotation: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		components: [
			{ type: 'Bitmap2D', properties: {
				source,
				fit: 'contain',     // 'contain' | 'cover' | 'stretch' | 'none'
				alignX: 'center',   // 'left' | 'center' | 'right'
				alignY: 'center',   // 'top' | 'center' | 'bottom'
				imageSmoothing: true
			}},
			{ type: 'Graphic2D', properties: { 
				line: true,
				lineWidth: 1,
				lineColor: '#000000',
				fill: false,
				fillColor: '#00000000',
				_paths: [
					[
						{ x: 0, y: 0 },
						{ x: w, y: 0 },
						{ x: w, y: h },
						{ x: 0, y: h },
						{ x: 0, y: 0 } // closed
					]
				]
			}}
		]
	});

	// Optional: nudge so drop point hits the center of the image
	d3dobject.position.x -= w * 0.5;
	d3dobject.position.y -= h * 0.5;

	URL.revokeObjectURL(url);
	return d3dobject;
}

function loadImage(url) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = url;
	});
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