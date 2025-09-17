// importer.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { getExtension, uniqueFilePath } from './d3dutility.js';

export async function handleImportFile(file, destDir) {
	const zip = _root.zip;
	const buf = await file.arrayBuffer();
	const name = file.name;
	const ext = getExtension(name);
	const target = `${destDir}/${name}`;

	switch (ext) {
		case 'glb':
		case 'gltf': {
			// --- source name parts
			const srcFileName = file.name || name || 'model.glb';
			const dot = srcFileName.lastIndexOf('.');
			const base = dot >= 0 ? srcFileName.slice(0, dot) : srcFileName;
			const srcExt = dot >= 0 ? srcFileName.slice(dot + 1).toLowerCase() : 'glb';

			// --- create <base>.<ext>model/ folder
			const folderLabel = `${base}.${srcExt}model`;
			const folderNoSlash = uniqueFilePath(zip, destDir, folderLabel);
			const virtualDir = folderNoSlash.endsWith('/') ? folderNoSlash : (folderNoSlash + '/');
			zip.folder(virtualDir);

			// --- load once
			const loader = new GLTFLoader();
			const gltf = await loader.parseAsync(await file.arrayBuffer(), '');
			gltf.scene.updateMatrixWorld(true);

			// --- detect skeletons
			let hasSkin = false;
			gltf.scene.traverse(o => { if (o.isSkinnedMesh && o.skeleton) hasSkin = true; });

			const exporter = new GLTFExporter();
			const exportAsGLB = (srcExt === 'glb');
			const exporterOptions = exportAsGLB
				? { binary: true }                          // -> .glb child
				: { binary: false, embedImages: true };     // -> .gltf child (embedded)

			const wrote = [virtualDir];

			if (hasSkin) {
				// ===========================
				// ONE FILE: meshes + skeleton
				// ===========================
				const childExt = exportAsGLB ? 'glb' : 'gltf';
				const outRel = `${virtualDir}${base}.${childExt}`;

				await new Promise((resolve, reject) => {
					exporter.parse(
						gltf.scene,
						async (result) => {
							try {
								if (exportAsGLB) {
									let data;
									if (result instanceof ArrayBuffer) data = result;
									else if (ArrayBuffer.isView(result)) data = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
									else if (result instanceof Blob) data = await result.arrayBuffer();
									else {
										const str = (typeof result === 'string') ? result : JSON.stringify(result);
										data = new TextEncoder().encode(str).buffer;
									}
									zip.file(outRel, data, { binary: true });
								} else {
									const jsonText = (typeof result === 'string') ? result : JSON.stringify(result);
									zip.file(outRel, jsonText);
								}
								wrote.push(outRel);
								resolve();
							} catch (e) { reject(e); }
						},
						exporterOptions
					);
				});

				return { wrote };
			}

			// ==========================================
			// NO skeletons → split into per-mesh children
			// ==========================================
			const nameCounts = new Map();
			const tasks = [];

			gltf.scene.traverse(obj => {
				if (!obj.isMesh) return;

				const baseName = (obj.name ? obj.name.replace(/[^\w\-\.]+/g, '_') : 'mesh');
				const idx = nameCounts.get(baseName) || 0;
				nameCounts.set(baseName, idx + 1);

				const childExt = exportAsGLB ? 'glb' : 'gltf';
				const outRel = `${virtualDir}${baseName}${idx ? `_${idx}` : ''}.${childExt}`;

				tasks.push(new Promise((resolve, reject) => {
					exporter.parse(
						obj,
						async (result) => {
							try {
								if (exportAsGLB) {
									let data;
									if (result instanceof ArrayBuffer) data = result;
									else if (ArrayBuffer.isView(result)) data = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
									else if (result instanceof Blob) data = await result.arrayBuffer();
									else {
										const str = (typeof result === 'string') ? result : JSON.stringify(result);
										data = new TextEncoder().encode(str).buffer;
									}
									zip.file(outRel, data, { binary: true });
								} else {
									const jsonText = (typeof result === 'string') ? result : JSON.stringify(result);
									zip.file(outRel, jsonText);
								}
								wrote.push(outRel);
								resolve();
							} catch (e) { reject(e); }
						},
						exporterOptions
					);
				}));
			});

			await Promise.all(tasks);
			return { wrote };
		}

		default: {
			zip.file(target, buf);
			return { wrote: [target] };
		}
	}
}