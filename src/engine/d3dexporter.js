// d3dexporter.js
import JSZip from 'jszip';
import { getExtension } from './d3dutility.js';

export async function createD3DBinary(d3dobjects, opts = {}) {
	if(!Array.isArray(d3dobjects))
		throw new Error('Invalid objects array');

	if(d3dobjects.length < 1)
		return null;

	const srcZip = _root.zip;
	if(!srcZip)
		throw new Error('No project zip loaded');

	const zip = new JSZip();

	// ---------------- Manifest ----------------
	{
		const manifestFile = srcZip.file('manifest.json');
		if(manifestFile) {
			const m = _editor.project;
			const name =
				opts.name ||
				opts.fileName ||
				(d3dobjects.length === 1 ? d3dobjects[0]?.name : 'Export');

			const manifest = {
				author: m.author,
				editorConfig: {...m.editorConfig},
				editorVersion: m.editorVersion,
				width: m.width,
				height: m.height,
				name,
				startScene: 0
			};

			if(!opts.d3dproj)
				delete manifest.editorConfig;

			zip.file('manifest.json', JSON.stringify(manifest));
		}
	}

	// ---------------- Scene graph ----------------
	const scene = { name: 'Exported Scene', objects: [], background: {} };
	scene.objects = d3dobjects.map(
		o => o.getSerializableObject({
			includeWorld: !!opts.includeWorld
		})
	);
	
	console.log(scene.objects);

	const sceneGraphStr = JSON.stringify([scene]);
	zip.file('scenes.json', sceneGraphStr);

	// ---------------- Asset index + files ----------------
	{
		const newAssetIndex = [];

		const addAsset = (a) => {
			const { uuid, rel } = a ?? {};
			if(!uuid || !rel) return;
			if(!newAssetIndex.find(x => x.uuid === uuid))
				newAssetIndex.push(a);
		};

		// UUID deps referenced in scene json
		for(let i in _root.assetIndex) {
			const a = _root.assetIndex[i];
			
			if(!sceneGraphStr.includes(a.uuid))
				continue;
			
			const ext = getExtension(a.rel);
			
			// If its a material, ensure textures are included too
			if(ext == 'mat') {
				const srcFile = srcZip.file(a.rel);
				const data = await srcFile.async('string');
				if(data) {
					for(let i in _root.assetIndex) {
						const a2 = _root.assetIndex[i];
						
						if(a2 == a) 
							continue;
						
						if(!data.includes(a2.uuid))
							continue;
						
						// Add texture or whatever it is
						addAsset(a2);
					}
				}
			}
			
			addAsset(a);
		}
		
		// Ensure all nested symbols included
		for(let symbolId in _root.__symbols) {
			const s = _root.__symbols[symbolId];
			
			if(!sceneGraphStr.includes(symbolId))
				continue;
				
			const uuid =  _root.resolveAssetId(s.file.name);
			const rel = s.file.name;
			
			addAsset({ uuid, rel });
		}

		// Symbol deps
		scene.objects.forEach(obj => {
			if(!obj.symbolId) return;

			const symbol = _root.__symbols?.[obj.symbolId];
			if(!symbol) return;

			const symbolRel = symbol.file?.name;
			if(!symbolRel) return;

			const symbolFileUUID = _root.resolveAssetId(symbolRel);

			if(!newAssetIndex.find(a => a.uuid == symbolFileUUID))
				newAssetIndex.push({ uuid: symbolFileUUID, rel: symbolRel });
		});

		zip.file('asset-index.json', JSON.stringify(newAssetIndex));

		for(const { rel } of newAssetIndex) {
			const srcFile = srcZip.file(rel);
			if(!srcFile) continue;
			const data = await srcFile.async('uint8array');
			zip.file(rel, data);
		}
	}

	// ---------------- Zip to binary ----------------
	return await zip.generateAsync({
		type: 'uint8array',
		compression: 'DEFLATE',
		compressionOptions: {
			level: opts.compressionLevel ?? 6
		}
	});
}

export async function exportAsD3D(d3dobjects, opts = {}) {
	if(!Array.isArray(d3dobjects))
		throw new Error('Invalid objects array');

	if(d3dobjects.length < 1)
		return;

	const zipData = await createD3DBinary(d3dobjects, opts);
	if(!zipData)
		return;

	const baseName =
		opts.fileName ||
		(d3dobjects.length === 1 ? d3dobjects[0]?.name : 'export');

	const fileName = `${baseName}.${opts.d3dproj ? 'd3dproj' : 'd3d'}`;

	await D3D.exportMultipleFiles([{
		name: fileName,
		data: zipData
	}]);
}