// gltf-instancer.js
// Robust GLB/GLTF importer for Three.js + JSZip
// - Extension-first type detect; magic-byte fallback
// - GLB: normal parse -> repair skins -> parse; if still failing, THROW (no null scene)
// - GLTF JSON: resolves external deps from zip; repairs skins on retry; throws on failure (strict)
// - TRS helpers for thumbnails/placement

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/* ==========================
	Detect type
========================== */
function _extOf(path) {
	const m = /(?:\.([^.\/\\]+))$/i.exec(path || '');
	return m ? m[1].toLowerCase() : '';
}
function _looksLikeGLB(ab) {
	if (!ab || ab.byteLength < 12) return false;
	const dv = new DataView(ab);
	return dv.getUint32(0, true) === 0x46546C67 && dv.getUint32(4, true) === 2; // 'glTF', v2
}
function _detectType(ab, relPath) {
	const ext = _extOf(relPath);
	if (ext === 'glb') return 'glb';
	if (ext === 'gltf') return 'gltf';
	return _looksLikeGLB(ab) ? 'glb' : 'gltf';
}

/* ==========================
	GLB utils + skin repair
========================== */
function _readGLBJSONAndBIN(ab) {
	const dv = new DataView(ab);
	if (dv.getUint32(0, true) !== 0x46546C67 || dv.getUint32(4, true) !== 2)
		throw new Error('Not a glTF 2.0 GLB');

	const total = dv.getUint32(8, true);
	let ofs = 12, json = null, bin = new ArrayBuffer(0);

	while (ofs + 8 <= total) {
		const len = dv.getUint32(ofs, true); ofs += 4;
		const typ = dv.getUint32(ofs, true); ofs += 4;
		if (typ === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, ofs, len)));
		else if (typ === 0x004E4942) bin = ab.slice(ofs, ofs + len);
		ofs += len;
	}
	if (!json) throw new Error('GLB missing JSON chunk');
	return { json, bin };
}
function _appendToBIN(bin, float32Array) {
	const old = new Uint8Array(bin);
	const add = new Uint8Array(float32Array.buffer, float32Array.byteOffset, float32Array.byteLength);
	const pad = (4 - (old.byteLength % 4)) % 4;
	const out = new Uint8Array(old.byteLength + pad + add.byteLength);
	out.set(old, 0);
	if (pad) out.set(new Uint8Array(pad), old.byteLength);
	out.set(add, old.byteLength + pad);
	return out.buffer;
}
function _identityMat4Array() {
	return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function _ensureIBMAccessor(doc, bin, needed) {
	const compType = 5126, type = 'MAT4';
	if (doc.accessors) {
		for (let i = 0; i < doc.accessors.length; i++) {
			const a = doc.accessors[i];
			if (a && a.type === type && a.componentType === compType && a.count >= needed)
				return { accIndex: i, bin };
		}
	}
	const data = new Float32Array(needed * 16);
	for (let i = 0; i < needed; i++) data.set(_identityMat4Array(), i * 16);
	const newBIN = _appendToBIN(bin, data);

	doc.buffers = doc.buffers || [];
	if (!doc.buffers.length) doc.buffers.push({ byteLength: newBIN.byteLength });
	doc.buffers[0].byteLength = newBIN.byteLength;

	const oldLen = (new Uint8Array(bin)).byteLength;
	const pad = (4 - (oldLen % 4)) % 4;

	doc.bufferViews = doc.bufferViews || [];
	const bvIndex = doc.bufferViews.length;
	doc.bufferViews.push({ buffer: 0, byteOffset: oldLen + pad, byteLength: data.byteLength });

	doc.accessors = doc.accessors || [];
	const accIndex = doc.accessors.length;
	doc.accessors.push({ bufferView: bvIndex, componentType: compType, count: needed, type });

	return { accIndex, bin: newBIN };
}
function _sanitizeSkinsInPlace(doc, bin) {
	const nodesLen = (doc.nodes && doc.nodes.length) || 0;
	if (!doc.skins || !doc.skins.length) return { doc, bin };

	let outBIN = bin;
	for (let si = 0; si < doc.skins.length; si++) {
		const skin = doc.skins[si];
		if (!skin) continue;
		const safeJoints = (skin.joints || []).filter(j => j != null && j >= 0 && j < nodesLen);
		if (!safeJoints.length) {
			if (doc.nodes) for (const n of doc.nodes) if (n && n.skin === si) delete n.skin;
			doc.skins[si] = null;
			continue;
		}
		skin.joints = safeJoints;

		let ok = false;
		if (skin.inverseBindMatrices != null && doc.accessors && doc.accessors[skin.inverseBindMatrices]) {
			const acc = doc.accessors[skin.inverseBindMatrices];
			if (acc && acc.type === 'MAT4' && acc.componentType === 5126 && acc.count >= safeJoints.length) ok = true;
		}
		if (!ok) {
			const res = _ensureIBMAccessor(doc, outBIN, safeJoints.length);
			outBIN = res.bin;
			skin.inverseBindMatrices = res.accIndex;
		}
	}
	// compact + remap node.skin
	const map = new Map(), compact = [];
	for (let i = 0; i < doc.skins.length; i++) if (doc.skins[i]) { map.set(i, compact.length); compact.push(doc.skins[i]); }
	if (doc.nodes) for (const n of doc.nodes) if (n && typeof n.skin === 'number' && map.has(n.skin)) n.skin = map.get(n.skin);
	doc.skins = compact;
	return { doc, bin: outBIN };
}

/* ==========================
	GLTFLoader adapters
========================== */
function _createLoader() {
	const manager = new THREE.LoadingManager();
	const loader = new GLTFLoader(manager);
	return { loader, manager };
}
async function _parseGLBArrayBuffer(ab) {
	const { loader } = _createLoader();
	return loader.parseAsync(ab, '');
}
async function _parseFromJSONAndBIN(doc, bin) {
	const { loader } = _createLoader();
	// Use buffer[0] as blob URL
	doc.buffers = doc.buffers || [{ byteLength: bin.byteLength }];
	const blob = new Blob([bin], { type: 'application/octet-stream' });
	const binURL = URL.createObjectURL(blob);
	doc.buffers[0].uri = binURL;
	try {
		return await new Promise((resolve, reject) => {
			loader.parse(JSON.stringify(doc), '', resolve, reject);
		});
	} finally {
		URL.revokeObjectURL(binURL);
	}
}

/* ==========================
	Zip resolver for .gltf
========================== */
function _createZipURLResolver(zip, baseDir = '') {
	const cache = new Map();
	const norm = p => (p || '').replace(/\\/g, '/');
	const join = (a,b) => (a ? norm(a).replace(/\/+$/,'')+'/' : '') + norm(b).replace(/^\/+/,'');

	async function toURL(rel) {
		const key = join(baseDir, rel);
		if (cache.has(key)) return cache.get(key);
		const zf = zip.file(key);
		if (!zf) throw new Error(`.gltf external dep missing in zip: ${key}`);
		const ab = await zf.async('arraybuffer');
		const ext = _extOf(key);
		let mime = 'application/octet-stream';
		if (ext === 'png') mime = 'image/png';
		else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
		else if (ext === 'ktx2') mime = 'image/ktx2';
		const url = URL.createObjectURL(new Blob([ab], { type: mime }));
		cache.set(key, url);
		return url;
	}
	function revokeAll() { for (const u of cache.values()) URL.revokeObjectURL(u); cache.clear(); }
	return { toURL, revokeAll, join, norm };
}
async function _parseGLTFJSONFromZip(jsonText, zip, baseDir, opts) {
	const { loader } = _createLoader(opts);

	const originalCreateParser = loader.createParser.bind(loader);
	loader.createParser = function (data, path) {
		const parser = originalCreateParser(data, path);
		const originalLoadURI = parser._loadURI.bind(parser);

		parser._loadURI = async function (uri) {
			// NEW: bypass resolver for data URIs
			if (typeof uri === 'string' && uri.startsWith('data:')) {
				return originalLoadURI(uri);
			}
			const mapped = await resolver.toURL(uri);	
			return originalLoadURI(mapped);
		};

		return parser;
	};

	const resolver = _createZipURLResolver(zip, baseDir);
	try {
		const gltf = await new Promise((resolve, reject) => {
			loader.parse(jsonText, '', resolve, reject);
		});
		resolver.revokeAll();
		return gltf;
	} catch (e) {
		resolver.revokeAll();
		throw e;
	}
}

/* ==========================
	TRS helpers
========================== */
function _extractTRS(scene) {
	let node = null;
	scene.traverse(o => { if (!node && (o.isSkinnedMesh || o.isMesh)) node = o; });
	if (!node) node = scene;
	if (!node.matrix || !node.matrix.isMatrix4) node.updateMatrix();
	const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
	node.matrix.decompose(pos, quat, scl);
	const eul = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
	return {
		position: { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 },
		rotation: { x: eul.x || 0, y: eul.y || 0, z: eul.z || 0 },
		scale: { x: scl.x || 1, y: scl.y || 1, z: scl.z || 1 }
	};
}
function _extractTRSFromGLTFJSON(doc) {
	const def = { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:1,y:1,z:1} };
	const nodes = doc.nodes || [];
	if (!nodes.length) return def;
	let ni = nodes.findIndex(n => n && (typeof n.mesh === 'number' || (n.children && n.children.length)));
	if (ni < 0) ni = 0;
	const n = nodes[ni];
	if (Array.isArray(n.matrix) && n.matrix.length === 16) {
		const m = new THREE.Matrix4().fromArray(n.matrix);
		const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
		m.decompose(pos, quat, scl);
		const eul = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
		return { position:{x:pos.x,y:pos.y,z:pos.z}, rotation:{x:eul.x,y:eul.y,z:eul.z}, scale:{x:scl.x,y:scl.y,z:scl.z} };
	}
	const t = n.translation || [0,0,0], r = n.rotation || [0,0,0,1], s = n.scale || [1,1,1];
	const pos = new THREE.Vector3(t[0],t[1],t[2]);
	const quat = new THREE.Quaternion(r[0],r[1],r[2],r[3]);
	const scl = new THREE.Vector3(s[0],s[1],s[2]);
	const eul = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
	return { position:{x:pos.x,y:pos.y,z:pos.z}, rotation:{x:eul.x,y:eul.y,z:eul.z}, scale:{x:scl.x,y:scl.y,z:scl.z} };
}

/* ==========================
	Public API
========================== */

/**
 * Import a model from a JSZip (strict by default).
 * Throws on failure (no silent {scene:null} for GLB).
 */
export async function importModelFromZip(zip, relPath, opts = { strict: true }) {
	const zf = zip.file(relPath);
	if (!zf) throw new Error(`Zip entry not found: ${relPath}`);

	const ab = await zf.async('arraybuffer');
	const kind = _detectType(ab, relPath);

	if (kind === 'glb') {
		// GLB: never return null scene; throw if we can't build it
		try {
			const gltf = await _parseGLBArrayBuffer(ab);
			return { gltf, scene: gltf.scene, trs: _extractTRS(gltf.scene) };
		} catch (e1) {
			const { json, bin } = _readGLBJSONAndBIN(ab);
			const fixed = _sanitizeSkinsInPlace(json, bin);
			try {
				const gltf = await _parseFromJSONAndBIN(fixed.doc, fixed.bin);
				return { gltf, scene: gltf.scene, trs: _extractTRS(gltf.scene) };
			} catch (e2) {
				throw new Error(`GLB import failed (normal + repaired). First error: ${e1?.message || e1}. Second: ${e2?.message || e2}`);
			}
		}
	}

	// GLTF JSON
	const text = new TextDecoder().decode(new Uint8Array(ab));
	let doc;
	try { doc = JSON.parse(text); }
	catch (e) { throw new Error(`.gltf JSON parse failed: ${e?.message || e}`); }
	
	const usesExternalURIs = (() => {
		const hasExternal = (uri) => uri && typeof uri === 'string' && !uri.startsWith('data:');
		// buffers
		if (Array.isArray(doc.buffers)) {
			for (const b of doc.buffers) if (hasExternal(b.uri)) return true;
		}
		// images
		if (Array.isArray(doc.images)) {
			for (const im of doc.images) if (hasExternal(im.uri)) return true;
		}
		// (optional) shaders, extras, etc., if you support them
		return false;
	})();
	
	if (!usesExternalURIs) {
		// everything is embedded → no resolver needed
		const { loader } = _createLoader(opts);
		const gltf = await new Promise((resolve, reject) => {
			loader.parse(JSON.stringify(doc), '', resolve, reject);
		});
		return { gltf, scene: gltf.scene, trs: _extractTRS(gltf.scene) };
	}

	const baseDir = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
	try {
		const gltf = await _parseGLTFJSONFromZip(text, zip, baseDir);
		return { gltf, scene: gltf.scene, trs: _extractTRS(gltf.scene) };
	} catch (e1) {
		// repair + retry
		const fixed = _sanitizeSkinsInPlace(doc, new ArrayBuffer(0));
		try {
			const gltf = await _parseGLTFJSONFromZip(JSON.stringify(fixed.doc), zip, baseDir);
			return { gltf, scene: gltf.scene, trs: _extractTRS(gltf.scene) };
		} catch (e2) {
			if (opts?.strict !== false)
				throw new Error(`.gltf import failed (normal + repaired). First: ${e1?.message || e1}. Second: ${e2?.message || e2}`);
			// non-strict: return TRS only
			return { gltf: null, scene: null, trs: _extractTRSFromGLTFJSON(doc) };
		}
	}
}

/**
 * Read local TRS without keeping the model. Never throws; returns defaults.
 */
export async function readLocalTRSFromZip(zip, relPath) {
	const def = { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:1,y:1,z:1} };
	try {
		const { scene, trs } = await importModelFromZip(zip, relPath, { strict: false });
		return scene ? _extractTRS(scene) : (trs || def);
	} catch {
		return def;
	}
}