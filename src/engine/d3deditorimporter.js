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
			const srcFileName = name;
			const dot = srcFileName.lastIndexOf('.');
			const base = dot >= 0 ? srcFileName.slice(0, dot) : srcFileName;
			const srcExt = dot >= 0 ? srcFileName.slice(dot + 1).toLowerCase() : 'glb';
			
			// --- create <base>.<ext>model/ folder
			const folderLabel = `${base}.${srcExt}container`;
			const folderNoSlash = uniqueFilePath(zip, destDir, folderLabel);
			const virtualDir = folderNoSlash.endsWith('/') ? folderNoSlash : (folderNoSlash + '/');
			zip.folder(virtualDir);

			// --- load once
			const loader = new GLTFLoader();
			const gltf = await loader.parseAsync(await file.arrayBuffer(), '');
			gltf.scene.updateMatrixWorld(true);
			
			const wrote = [virtualDir];
			
			// ======================================
			// 1. extract animations (if any)
			// ======================================
			if (gltf.animations?.length) {
				let animCounts = new Map();
				for (let i = 0; i < gltf.animations.length; i++) {
					const clip = gltf.animations[i];
					const safeName = (clip.name || `anim_${i}`).replace(/[^\w\-\.]+/g, '_');
					const idx = animCounts.get(safeName) || 0;
					animCounts.set(safeName, idx + 1);

					const animFile = `${virtualDir}${safeName}${idx ? `_${idx}` : ''}.anim`;
					const json = JSON.stringify(clip.toJSON());
					zip.file(animFile, json);
					wrote.push(animFile);
				}
			}
			
			// ======================================
			// 2. extract materials (+ textures)
			// ======================================
			{
				const norm = p => p.replace(/\/+/g, '/');
				const safe = (s, fb='Material') => (s && typeof s === 'string' ? s : fb).replace(/[^\w\-\.]+/g, '_') || fb;
				const hex = (c) => `#${((c?.getHex?.() ?? 0) >>> 0).toString(16).padStart(6,'0')}`;
			
				// Make subfolders once
				const matsDir = norm(uniqueFilePath(zip, virtualDir, 'materials/'));
				const texDir  = norm(uniqueFilePath(zip, virtualDir, 'textures/'));
				zip.folder(matsDir);
				zip.folder(texDir);
			
				// Collect unique material instances
				const materialSet = new Set();
				gltf.scene.traverse(o => {
					if (!o.isMesh) return;
					const m = o.material;
					if (Array.isArray(m)) m.forEach(mm => mm && materialSet.add(mm));
					else if (m) materialSet.add(m);
				});
			
				// Dedupe by "signature" so identical materials only export once
				const bySig = new Map(); // signature -> .mat rel
				const byName = new Map(); // name -> .mat rel (best-effort)
				const materialFiles = [];
			
				const writeTexture = async (tex, baseHint) => {
					if (!tex || !tex.image) return null;
			
					try {
						// draw into a canvas and save PNG
						const img = tex.image; // HTMLImageElement | ImageBitmap | Canvas
						const w = img.width || img.videoWidth || 0;
						const h = img.height || img.videoHeight || 0;
						if (!w || !h) return null;
			
						const canvas = document.createElement('canvas');
						canvas.width = w; canvas.height = h;
						const ctx = canvas.getContext('2d');
						ctx.drawImage(img, 0, 0, w, h);
			
						const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
						if (!blob) return null;
			
						const base = safe(tex.name || baseHint || 'texture', 'texture');
						const outRel = norm(uniqueFilePath(zip, texDir, `${base}.png`));
						const ab = await blob.arrayBuffer();
						zip.file(outRel, ab, { binary: true });
						wrote.push(outRel);
						return outRel;
					} catch (_) {
						return null;
					}
				};
			
				const matSignature = (m) => JSON.stringify({
					type: m.type,
					name: m.name || '',
					color: m.color ? m.color.getHex() : undefined,
					emissive: m.emissive ? m.emissive.getHex() : undefined,
					roughness: m.roughness,
					metalness: m.metalness,
					opacity: m.opacity,
					transparent: !!m.transparent,
					side: m.side,
					alphaTest: m.alphaTest
				});
			
				for (const mat of materialSet) {
					const sig = matSignature(mat);
					let outRel = bySig.get(sig);
					if (outRel) {
						if (mat.name && !byName.has(mat.name)) byName.set(mat.name, outRel);
						continue; // already written identical material
					}
			
					// Export textures (best-effort)
					const mapRel       = await writeTexture(mat.map,          'basecolor');
					const normalRel    = await writeTexture(mat.normalMap,    'normal');
					const roughRel     = await writeTexture(mat.roughnessMap, 'roughness');
					const metalRel     = await writeTexture(mat.metalnessMap, 'metallic');
					const emissiveRel  = await writeTexture(mat.emissiveMap,  'emissive');
					const aoRel        = await writeTexture(mat.aoMap,        'ao');
					const alphaRel     = await writeTexture(mat.alphaMap,     'alpha');
			
					// Build .mat JSON (keep params minimal + stable)
					const baseName = safe(mat.name || mat.type || 'Material', 'Material');
					outRel = norm(uniqueFilePath(zip, matsDir, `${baseName}.mat`));
			
					const matJson = {
						type: mat.type || 'MeshStandardMaterial',
						name: mat.name || baseName,
						color: mat.color ? hex(mat.color) : '#ffffff',
						emissive: mat.emissive ? hex(mat.emissive) : '#000000',
						opacity: (typeof mat.opacity === 'number') ? mat.opacity : 1,
						transparent: !!mat.transparent,
						doubleSided: mat.side === THREE.DoubleSide,
						roughness: (typeof mat.roughness === 'number') ? mat.roughness : undefined,
						metalness: (typeof mat.metalness === 'number') ? mat.metalness : undefined,
						alphaTest: (typeof mat.alphaTest === 'number') ? mat.alphaTest : undefined,
						maps: {
							map: mapRel,
							normalMap: normalRel,
							roughnessMap: roughRel,
							metalnessMap: metalRel,
							emissiveMap: emissiveRel,
							aoMap: aoRel,
							alphaMap: alphaRel
						}
					};
			
					zip.file(outRel, JSON.stringify(matJson));
					wrote.push(outRel);
			
					bySig.set(sig, outRel);
					if (mat.name) byName.set(mat.name, outRel);
					materialFiles.push(outRel);
				}
				if (materialFiles.length) {
					const manifestRel = norm(`${matsDir}materials.index.json`);
					const manifest = {
						count: materialFiles.length,
						files: materialFiles,
						byName: Object.fromEntries(byName)
					};
					zip.file(manifestRel, JSON.stringify(manifest, null, 2));
					wrote.push(manifestRel);
				}
			}
			
			const mainGlbTarget = `${virtualDir}${name}`;
			
			zip.file(mainGlbTarget, buf);
			wrote.push(mainGlbTarget);
			
			return { wrote };
		}

		default: {
			zip.file(target, buf);
			return { wrote: [target] };
		}
	}
}