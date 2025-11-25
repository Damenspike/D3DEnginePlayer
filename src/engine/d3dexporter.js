import JSZip from 'jszip';

export async function exportAsD3D(d3dobjects, opts = {}) {
	if(!Array.isArray(d3dobjects)) {
		throw new Error('Invalid objects array');
	}
	
	if(d3dobjects.length < 1)
		return;
	
	const srcZip = _root.zip;
	if(!srcZip)
		throw new Error('No project zip loaded');
		
	const files = [];
	
	for(const d3dobject of d3dobjects) {
		const zip = new JSZip();
		
		// Build manifest
		const manifestFile = srcZip.file('manifest.json');
		if(manifestFile) {
			const m = _editor.project;
			const manifest = {
				author: m.author,
				editorConfig: {...m.editorConfig},
				editorVersion: m.editorVersion,
				width: m.width,
				height: m.height,
				name: d3dobject.name,
				startScene: 0
			};
			
			if(!opts.d3dproj) {
				delete manifest.editorConfig;
			}
			
			zip.file('manifest.json', JSON.stringify(manifest));
		}
		
		// Build minimal scene graph
		const scene = {..._root.scene};
		scene.objects = [d3dobject.getSerializableObject()];
		
		const sceneGraphStr = JSON.stringify([scene]);
		zip.file('scenes.json', sceneGraphStr);
		
		// Build asset index based on dependencies
		{
			const newAssetIndex = [];
			const symbolsArr = Object.values(_root.__symbols);
			
			_root.assetIndex.forEach(a => {
				const { uuid, rel } = a ?? {};
				
				if(!uuid || !rel) return;
				
				if(sceneGraphStr.includes(uuid) || symbolsArr.find(s => s.file.name == rel))
					newAssetIndex.push(a);
			});
			
			if(newAssetIndex.length > 0) {
				zip.file(
					'asset-index.json', 
					JSON.stringify(newAssetIndex)
				);
				
				for(const { rel, uuid } of newAssetIndex) {
					const srcFile = srcZip.file(rel);
					if(!srcFile) continue;
					const data = await srcFile.async('uint8array');
					zip.file(rel, data);
				}
			}else{
				zip.file('asset-index.json', JSON.stringify([]));
			}
		}
		
		// Generate d3d binary
		const zipData = await zip.generateAsync({
			type: 'uint8array',
			compression: 'DEFLATE',
			compressionOptions: {
				level: opts.compressionLevel ?? 6
			}
		});
		
		const baseName = opts.fileName || d3dobject.name || 'export';
		const fileName = `${baseName}.${opts.d3dproj ? 'd3dproj' : 'd3d'}`;
		
		files.push({
			name: fileName,
			data: zipData
		});
	}
	
	await D3D.exportMultipleFiles(files);
}