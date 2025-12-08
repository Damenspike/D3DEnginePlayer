// importer.js
import JSZip from 'jszip';
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
				const hex  = (c) => `#${((c?.getHex?.() ?? 0) >>> 0).toString(16).padStart(6,'0')}`;
			
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
				const bySig   = new Map(); // signature -> outRel (path to .mat)
				const byName  = new Map(); // matName -> outRel
				const materialFiles = [];  // list of outRel strings
			
				// Write texture file, then update asset index + return UUID
				const writeTexture = async (tex, baseHint) => {
					if (!tex || !tex.image) return null;
			
					try {
						const img = tex.image; // HTMLImageElement | ImageBitmap | Canvas
						const w = img.width || img.videoWidth || 0;
						const h = img.height || img.videoHeight || 0;
						if (!w || !h) return null;
			
						const canvas = document.createElement('canvas');
						canvas.width = w;
						canvas.height = h;
						const ctx = canvas.getContext('2d');
						ctx.drawImage(img, 0, 0, w, h);
			
						const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
						if (!blob) return null;
			
						const base = safe(tex.name || baseHint || 'texture', 'texture');
						const outRel = norm(uniqueFilePath(zip, texDir, `${base}.png`));
			
						const ab = await blob.arrayBuffer();
						zip.file(outRel, ab, { binary: true });
						wrote.push(outRel);
			
						// Update asset index to find the uuid
						_root.updateAssetIndex();
			
						const uuid = _root.resolveAssetId(outRel);
						return uuid || null;
					} catch {
						return null;
					}
				};
			
				const matSignature = (m) => JSON.stringify({
					type:        m.type,
					name:        m.name || '',
					color:       m.color ? m.color.getHex() : undefined,
					emissive:    m.emissive ? m.emissive.getHex() : undefined,
					roughness:   m.roughness,
					metalness:   m.metalness,
					opacity:     m.opacity,
					transparent: !!m.transparent,
					side:        m.side,
					alphaTest:   m.alphaTest
				});
			
				for (const mat of materialSet) {
					const sig = matSignature(mat);
					let outRel = bySig.get(sig);
					if (outRel) {
						// Already wrote identical material, just map its name → same .mat file
						if (mat.name && !byName.has(mat.name)) byName.set(mat.name, outRel);
						continue;
					}
			
					// Export textures → UUIDs
					const mapUUID      = await writeTexture(mat.map,          'basecolor');
					const normalUUID   = await writeTexture(mat.normalMap,    'normal');
					const roughUUID    = await writeTexture(mat.roughnessMap, 'roughness');
					const metalUUID    = await writeTexture(mat.metalnessMap, 'metallic');
					const emissiveUUID = await writeTexture(mat.emissiveMap,  'emissive');
					const aoUUID       = await writeTexture(mat.aoMap,        'ao');
					const alphaUUID    = await writeTexture(mat.alphaMap,     'alpha');
			
					// Build .mat JSON
					const baseName = safe(mat.name || mat.type || 'Material', 'Material');
					outRel = norm(uniqueFilePath(zip, matsDir, `${baseName}.mat`));
			
					const matJson = {
						type:        mat.type || 'MeshStandardMaterial',
						name:        mat.name || baseName,
						color:       mat.color ? hex(mat.color) : '#ffffff',
						emissive:    mat.emissive ? hex(mat.emissive) : '#000000',
						opacity:     (mat.opacity ?? 1),
						transparent: !!mat.transparent,
						doubleSided: mat.side === THREE.DoubleSide,
						roughness:   mat.roughness,
						metalness:   mat.metalness,
						alphaTest:   mat.alphaTest,
			
						// IMPORTANT: maps store texture UUIDs (your asset IDs)
						maps: {
							map:          mapUUID,
							normalMap:    normalUUID,
							roughnessMap: roughUUID,
							metalnessMap: metalUUID,
							emissiveMap:  emissiveUUID,
							aoMap:        aoUUID,
							alphaMap:     alphaUUID
						}
					};
			
					zip.file(outRel, JSON.stringify(matJson));
					wrote.push(outRel);
			
					bySig.set(sig, outRel);
					if (mat.name) byName.set(mat.name, outRel);
					materialFiles.push(outRel);
				}
			
				// ---------- Build materials.index.json with UUIDs ----------
				if (materialFiles.length) {
					// Make sure asset index knows about the new .mat files
					_root.updateAssetIndex();
			
					// Build files: [{ name, rel, uuid }]
					const files = materialFiles.map(rel => {
						const uuid = _root.resolveAssetId(rel) || null;
			
						// Find a name for this rel (if any)
						let name = null;
						for (const [n, r] of byName.entries()) {
							if (r === rel) {
								name = n;
								break;
							}
						}
			
						return { name, uuid };
					});
			
					// byName map: name -> uuid (your asset ID)
					const byNameUUID = {};
					for (const f of files) {
						if (f.name && f.uuid) byNameUUID[f.name] = f.uuid;
					}
			
					const manifestRel = `${matsDir.replace(/\/+$/,'/') }materials.index.json`;
					const manifest = {
						count: files.length,
						files,
						byName: byNameUUID
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
		
		case 'd3d': {
			// ============================
			// Import assets from .d3d file
			// ============================
			
			// Load the dropped .d3d as its own JSZip
			const srcZip = await new JSZip().loadAsync(buf);
			
			// Read the source asset-index.json
			const assetIndexFile = srcZip.file('asset-index.json');
			if (!assetIndexFile) {
				console.warn('[D3D Import] asset-index.json not found in .d3d');
				return { wrote: [] };
			}
		
			let srcIndexRaw;
			try {
				srcIndexRaw = JSON.parse(await assetIndexFile.async('string'));
			} catch (err) {
				console.warn('[D3D Import] Failed to parse asset-index.json', err);
				return { wrote: [] };
			}
			
			if(!Array.isArray(srcIndexRaw)) {
				console.warn('Source index array is invalid');
				return;
			}
		
			// Make an isolated folder under destDir:  <destDir>/<base>.d3dcontainer/
			const dot = name.lastIndexOf('.');
			const base = dot >= 0 ? name.slice(0, dot) : name;
			const folderLabel = `${base}.d3dcontainer`;
			const folderNoSlash = uniqueFilePath(zip, destDir, folderLabel);
			const virtualDir = folderNoSlash.endsWith('/') ? folderNoSlash : (folderNoSlash + '/');
			zip.folder(virtualDir);
		
			const wrote = [virtualDir];
		
			const stripAssetsRoot = rel => rel.replace(/^assets\//, '');
		
			// Ensure target asset index exists
			const importedAssetIndex = {};
		
			for (const { rel, uuid } of srcIndexRaw) {
				if (!rel || typeof rel !== 'string') continue;
				
				// -------------------------------------------------
				// Special case: shared Standard library assets
				// -------------------------------------------------
				if (rel.startsWith('assets/Standard/')) {
					// Ignore directory rels entirely
					if (rel.endsWith('/')) {
						continue;
					}
					
					const existing = _root.assetIndex.find(a => a.rel == rel);
					
					if (existing) {
						importedAssetIndex[uuid] = existing;
						continue;
					} else {
						console.warn('[D3D Import] Standard asset not found in host project for rel:', rel, 'uuid:', uuid);
						// ignore if it doesn’t exist
						continue;
					}
				}
		
				// -------------------------------------------------
				// Non-standard assets: import into isolated folder
				// -------------------------------------------------
		
				// Directory entries (end with /)
				if (rel.endsWith('/')) {
					const dirRel = `${virtualDir}${stripAssetsRoot(rel)}`;
					const dirClean = dirRel.endsWith('/') ? dirRel : (dirRel + '/');
					zip.folder(dirClean);
					wrote.push(dirClean);
		
					const newEntry = { uuid, rel: dirClean };
					_root.assetIndex.push(newEntry);
					importedAssetIndex[uuid] = newEntry;
					continue;
				}
		
				// File entries
				const srcFile = srcZip.file(rel);
				if (!srcFile) {
					console.warn('[D3D Import] Missing asset file in .d3d zip for rel:', rel);
					continue;
				}
		
				const data = await srcFile.async('arraybuffer');
		
				// New rel inside this project, under our isolated folder
				const newRel = `${virtualDir}${stripAssetsRoot(rel)}`;
		
				zip.file(newRel, data, { binary: true });
				wrote.push(newRel);
				
				const newEntry = { uuid, rel: newRel };
				_root.assetIndex.push(newEntry);
				importedAssetIndex[uuid] = newEntry;
			}
		
			// ------------------------------------
			// Copy scenes.json + manifest.json in
			// ------------------------------------
			const scenesFile = srcZip.file('scenes.json');
			if (scenesFile) {
				const scenesStr = await scenesFile.async('string');
				const outRel = `${virtualDir}scenes.json`;
				zip.file(outRel, scenesStr);
				wrote.push(outRel);
			}
		
			const manifestFile2 = srcZip.file('manifest.json');
			if (manifestFile2) {
				const manifestStr = await manifestFile2.async('string');
				const outRel = `${virtualDir}manifest.json`;
				zip.file(outRel, manifestStr);
				wrote.push(outRel);
			}
			
			return { wrote };
		}

		default: {
			zip.file(target, buf);
			return { wrote: [target] };
		}
	}
}