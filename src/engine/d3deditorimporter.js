// importer.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { fileName, getExtension, uniqueFilePath } from './d3dutility.js';

export async function handleImportFile(file, destDir) {
	const zip = _root.zip;
	const buf = await file.arrayBuffer();
	const name = file.name;
	const ext = getExtension(name);
	const target = `${destDir}/${name}`;

	switch (ext) {
		case 'glb':
		case 'gltf': {
			// Source filename + parts
			const srcFileName = file.name || name || 'model.glb';
			const dot = srcFileName.lastIndexOf('.');
			const base = dot >= 0 ? srcFileName.slice(0, dot) : srcFileName;
			const ext  = dot >= 0 ? srcFileName.slice(dot + 1).toLowerCase() : 'glb';
		
			// --- 1) Make a folder with .<ext>model
			// e.g. "Plane.glbmodel/"
			const folderLabel = `${base}.${ext}model`;
			const uniqueFolderPathNoSlash = uniqueFilePath(zip, destDir, folderLabel);
			const virtualDir = uniqueFolderPathNoSlash.endsWith('/')
				? uniqueFolderPathNoSlash
				: (uniqueFolderPathNoSlash + '/');
			zip.folder(virtualDir); // create the dir marker
		
			// --- 2) Parse GLB and export each mesh as its own GLB into the folder
			const loader = new GLTFLoader();
			const arrayBuffer = await file.arrayBuffer();
			const gltf = await loader.parseAsync(arrayBuffer, '');
		
			const exporter = new GLTFExporter();
			const promises = [];
			const nameCounts = new Map();
			const wrote = [virtualDir];
		
			gltf.scene.traverse(obj => {
				if (!obj.isMesh) return;
		
				// sanitize + dedupe filename
				let baseName = obj.name ? obj.name.replace(/[^\w\-\.]+/g, '_') : 'mesh';
				let n = nameCounts.get(baseName) || 0;
				let outRel = `${virtualDir}${baseName}${n ? `_${n}` : ''}.glb`;
				nameCounts.set(baseName, n + 1);
		
				const p = new Promise((resolve, reject) => {
					exporter.parse(
						obj,
						async (result) => {
							try {
								let data;
								if (result instanceof ArrayBuffer) {
									data = result;
								} else if (ArrayBuffer.isView(result)) {
									data = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
								} else if (result instanceof Blob) {
									data = await result.arrayBuffer();
								} else {
									const str = typeof result === 'string' ? result : JSON.stringify(result);
									data = new TextEncoder().encode(str).buffer;
								}
								zip.file(outRel, data, { binary: true });
								wrote.push(outRel);
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
			return { wrote };
		}

		default: {
			zip.file(target, buf);
			return { wrote: [target] };
		}
	}
}