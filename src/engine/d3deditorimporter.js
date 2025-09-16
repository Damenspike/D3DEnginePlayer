// importer.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { fileName, getExtension } from './d3dutility.js';

export async function handleImportFile(file, destDir) {
	const zip = _root.zip;
	const buf = await file.arrayBuffer();
	const name = file.name;
	const ext = getExtension(name);
	const target = `${destDir}/${name}`;

	switch (ext) {
		case 'glb':
		case 'gltf': {
			// 1) Save the original source model as-is
			zip.file(target, buf);
		
			// 2) Create a folder with the same name as the source file (including extension)
			const virtualDir = `${destDir}/${name}/`;
			zip.folder(virtualDir);
		
			// 3) Parse the uploaded File directly
			const loader = new GLTFLoader();
			const arrayBuffer = await file.arrayBuffer();
			const gltf = await loader.parseAsync(arrayBuffer, '');
		
			// 4) Export each mesh as its own GLB inside the folder
			const exporter = new GLTFExporter();
			const promises = [];
			const nameCounts = new Map();
		
			gltf.scene.traverse(obj => {
				if (!obj.isMesh) return;
		
				// sanitize + dedupe filename
				let base = obj.name ? obj.name.replace(/[^\w\-\.]+/g, '_') : 'mesh';
				let n = nameCounts.get(base) || 0;
				let outRel = `${virtualDir}${base}${n ? `_${n}` : ''}.glb`;
				nameCounts.set(base, n + 1);
		
				// export mesh → blob → zip
				const p = new Promise((resolve, reject) => {
					exporter.parse(
						obj,
						async (result) => {
							try {
								let data;
					
								if (result instanceof ArrayBuffer) {
									// already good
									data = result;
								} else if (ArrayBuffer.isView(result)) {
									// TypedArray -> slice into ArrayBuffer
									data = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
								} else if (result instanceof Blob) {
									// convert Blob -> ArrayBuffer
									data = await result.arrayBuffer();
								} else {
									// fallback, stringify JSON to ArrayBuffer
									const str = typeof result === 'string' ? result : JSON.stringify(result);
									data = new TextEncoder().encode(str).buffer;
								}
					
								// Write raw ArrayBuffer into the zip entry
								zip.file(outRel, data, { binary: true });
								resolve();
							} catch (e) {
								reject(e);
							}
						},
						{ binary: true }
					);
				});
				promises.push(p);
			});
		
			await Promise.all(promises);
			return { wrote: [target] };
		}

		default: {
			zip.file(target, buf);
			return { wrote: [target] };
		}
	}
}