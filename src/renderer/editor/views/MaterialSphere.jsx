// MaterialSphere.jsx
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

function clamp01(v) {
	v = Number(v);
	if (!Number.isFinite(v)) return 0;
	if (v < 0) return 0;
	if (v > 1) return 1;
	return v;
}

function fixColor(val) {
	if (val == null) return val;
	if (typeof val === 'number') return val;
	const s = String(val).trim();
	if (!s) return val;
	if (s.startsWith('#')) return s;
	if (/^0x/i.test(s)) return parseInt(s.slice(2), 16);
	if (/^[0-9a-fA-F]{6}$/.test(s)) return parseInt(s, 16);
	if (/^\d+$/.test(s)) return Number(s);
	return s;
}

function mimeFromExt(p) {
	const ext = (p.split('.').pop() || '').toLowerCase();
	if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
	if (ext === 'png') return 'image/png';
	if (ext === 'webp') return 'image/webp';
	if (ext === 'ktx2') return 'image/ktx2';
	return 'application/octet-stream';
}

function norm(p) {
	return p ? p.replace(/\/+/g, '/').replace(/^\.\//, '') : p;
}

function normalizeMaterialParams(paramsIn) {
	const p = { ...(paramsIn || {}) };
	const type = p.type || 'MeshStandardMaterial';

	if ('color' in p) p.color = fixColor(p.color);
	if ('emissive' in p) p.emissive = fixColor(p.emissive);

	if (p.opacity !== undefined && p.opacity < 1 && p.transparent !== true)
		p.transparent = true;

	if (typeof p.side === 'string' && THREE[p.side] !== undefined)
		p.side = THREE[p.side];

	const renderMode = p.renderMode || null;
	const doubleSided = p.doubleSided === true;

	const uv = {
		map: { offset: p.mapOffset, repeat: p.mapRepeat },
		normalMap: { offset: p.normalMapOffset, repeat: p.normalMapRepeat },
		emissiveMap: { offset: p.emissiveMapOffset, repeat: p.emissiveMapRepeat }
	};

	const maps = {
		...(p.maps || {}),
		...(p.map ? { map: p.map } : null),
		...(p.normalMap ? { normalMap: p.normalMap } : null),
		...(p.roughnessMap ? { roughnessMap: p.roughnessMap } : null),
		...(p.metalnessMap ? { metalnessMap: p.metalnessMap } : null),
		...(p.emissiveMap ? { emissiveMap: p.emissiveMap } : null),
		...(p.aoMap ? { aoMap: p.aoMap } : null),
		...(p.alphaMap ? { alphaMap: p.alphaMap } : null),
	};

	delete p.renderMode;
	delete p.doubleSided;
	delete p.maps;

	delete p.mapOffset; delete p.mapRepeat;
	delete p.normalMapOffset; delete p.normalMapRepeat;
	delete p.emissiveMapOffset; delete p.emissiveMapRepeat;

	delete p.map;
	delete p.normalMap;
	delete p.roughnessMap;
	delete p.metalnessMap;
	delete p.emissiveMap;
	delete p.aoMap;
	delete p.alphaMap;

	if (doubleSided)
		p.side = THREE.DoubleSide;

	if (type === 'MeshBasicMaterial') {
		delete p.metalness;
		delete p.roughness;
		delete p.emissive;
		delete p.emissiveIntensity;
		delete p.envMapIntensity;
	}

	return { type, ctorParams: p, maps, uv, renderMode };
}

function applyRenderMode(m, params) {
	if (!m || !params) return;

	const mode = params.renderMode || null;

	if (params.depthWrite !== undefined)
		m.depthWrite = !!params.depthWrite;

	if (params.alphaTest !== undefined)
		m.alphaTest = clamp01(params.alphaTest);

	if (mode === 'opaque') {
		m.transparent = false;
		m.opacity = 1;
		m.alphaTest = 0;
		if (params.depthWrite === undefined) m.depthWrite = true;
	} else if (mode === 'cutout') {
		m.transparent = false;
		m.opacity = 1;
		m.alphaTest = params.alphaTest !== undefined ? clamp01(params.alphaTest) : 0.5;
		if (params.depthWrite === undefined) m.depthWrite = true;
	} else if (mode === 'fade') {
		m.transparent = true;
		if (typeof params.opacity === 'number')
			m.opacity = clamp01(params.opacity);
		m.alphaTest = 0;
		if (params.depthWrite === undefined) m.depthWrite = false;
	}

	m.needsUpdate = true;
}

async function loadTextureSharedPreview(zip, uuid, isColor, texCache) {
	if (!uuid) return null;

	let entry = texCache.get(uuid);
	if (entry) return entry;

	const rel = window._root?.resolvePathNoAssets?.(uuid) || null;
	if (!rel) return null;

	const zf = zip?.file?.(norm('assets/' + rel));
	if (!zf) return null;

	const buf = await zf.async('arraybuffer');
	const blob = new Blob([buf], { type: mimeFromExt(rel) });
	const bmp = await createImageBitmap(blob);

	const base = new THREE.Texture(bmp);
	base.flipY = false;

	if (isColor) {
		if ('colorSpace' in base) base.colorSpace = THREE.SRGBColorSpace;
		else base.encoding = THREE.sRGBEncoding;
	}

	base.wrapS = THREE.RepeatWrapping;
	base.wrapT = THREE.RepeatWrapping;
	base.matrixAutoUpdate = true;
	base.needsUpdate = true;

	entry = { uuid, bmp, base, variants: new Map() };
	texCache.set(uuid, entry);
	return entry;
}

function getTexVariant(entry, uv) {
	const off = uv?.offset;
	const rep = uv?.repeat;

	const ox = Array.isArray(off) ? (Number(off[0]) || 0) : 0;
	const oy = Array.isArray(off) ? (Number(off[1]) || 0) : 0;

	const rx = Array.isArray(rep) ? (Number(rep[0]) || 1) : 1;
	const ry = Array.isArray(rep) ? (Number(rep[1]) || 1) : 1;

	if (ox === 0 && oy === 0 && rx === 1 && ry === 1)
		return entry.base;

	const key = `${ox},${oy}|${rx},${ry}`;
	let tex = entry.variants.get(key);
	if (tex) return tex;

	tex = entry.base.clone();
	tex.image = entry.base.image;
	tex.flipY = entry.base.flipY;
	tex.wrapS = entry.base.wrapS;
	tex.wrapT = entry.base.wrapT;
	tex.matrixAutoUpdate = true;

	tex.offset.set(ox, oy);
	tex.repeat.set(rx, ry);
	tex.updateMatrix();

	tex.needsUpdate = true;
	entry.variants.set(key, tex);
	return tex;
}

async function setMapRel(zip, mat, key, uuid, isColor, uv, texCache) {
	if (
		key !== 'map' &&
		key !== 'normalMap' &&
		key !== 'roughnessMap' &&
		key !== 'metalnessMap' &&
		key !== 'emissiveMap' &&
		key !== 'aoMap' &&
		key !== 'alphaMap'
	) return;

	if (!uuid) {
		if (mat[key]) {
			mat[key] = null;
			mat.needsUpdate = true;
		}
		return;
	}

	const entry = await loadTextureSharedPreview(zip, uuid, isColor, texCache);
	if (!entry) return;

	const tex = getTexVariant(entry, uv);

	if (mat[key] === tex)
		return;

	mat[key] = tex;
	mat.needsUpdate = true;
}

async function applyTexturesToMaterial(zip, m, maps, uv, texCache) {
	await setMapRel(zip, m, 'map', maps.map, true, uv.map, texCache);
	await setMapRel(zip, m, 'normalMap', maps.normalMap, false, uv.normalMap, texCache);
	await setMapRel(zip, m, 'roughnessMap', maps.roughnessMap, false, null, texCache);
	await setMapRel(zip, m, 'metalnessMap', maps.metalnessMap, false, null, texCache);
	await setMapRel(zip, m, 'emissiveMap', maps.emissiveMap, true, uv.emissiveMap, texCache);
	await setMapRel(zip, m, 'aoMap', maps.aoMap, false, null, texCache);
	await setMapRel(zip, m, 'alphaMap', maps.alphaMap, false, null, texCache);
}

async function buildMaterialFromParams(zip, paramsIn, texCache) {
	const n = normalizeMaterialParams(paramsIn);
	const Ctor = THREE[n.type];
	if (!Ctor) return null;

	const m = new Ctor(n.ctorParams);

	m.userData ||= {};
	if (m.userData._baseOpacity == null)
		m.userData._baseOpacity = typeof n.ctorParams.opacity === 'number' ? n.ctorParams.opacity : 1;

	if ('toneMapped' in m) m.toneMapped = false;

	await applyTexturesToMaterial(zip, m, n.maps, n.uv, texCache);
	applyRenderMode(m, paramsIn);

	m.needsUpdate = true;
	return m;
}

// Fit camera so the whole sphere is visible with padding.
// Uses conservative math that works on wide panes.
function fitCameraToRadius(camera, radius, aspect, pad = 1.18) {
	const vFov = THREE.MathUtils.degToRad(camera.fov);
	const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

	const distV = (radius * pad) / Math.tan(vFov / 2);
	const distH = (radius * pad) / Math.tan(hFov / 2);

	const dist = Math.max(distV, distH);

	camera.near = Math.max(0.01, dist - radius * 4);
	camera.far = dist + radius * 6;
	camera.position.set(0, 0, dist);
	camera.updateProjectionMatrix();
}

export default function MaterialSphere({ mat, zip }) {
	const hostRef = useRef(null);
	const texCache = useMemo(() => new Map(), []);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		let alive = true;
		let raf = 0;

		const scene = new THREE.Scene();

		const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(window.devicePixelRatio || 1);
		
		const canvas = renderer.domElement;
		
		// host must be a positioning context
		host.style.position = 'relative';
		host.style.overflow = 'hidden';
		
		// canvas must be pinned to top-left and fill
		canvas.style.position = 'absolute';
		canvas.style.left = '0';
		canvas.style.top = '0';
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.display = 'block';

		// keep background transparent so your pane style shows through
		renderer.setClearAlpha(0);

		host.innerHTML = '';
		host.appendChild(renderer.domElement);

		scene.add(new THREE.AmbientLight(0xffffff, 0.65));
		const dir = new THREE.DirectionalLight(0xffffff, 0.9);
		dir.position.set(2, 2, 2);
		scene.add(dir);

		// smaller sphere by default
		const R = 0.2;
		const geo = new THREE.SphereGeometry(R, 48, 32);

		const mesh = new THREE.Mesh(
			geo,
			new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.45, metalness: 0.05 })
		);
		scene.add(mesh);

		const resize = () => {
			if (!alive) return;
			const w = host.clientWidth || 256;
			const h = host.clientHeight || 256;

			renderer.setSize(w, h, false);

			const aspect = w / h;
			camera.aspect = aspect;

			// auto-fit with padding so you ALWAYS see it fully
			fitCameraToRadius(camera, R, aspect, 1.18);
		};

		const tick = () => {
			if (!alive) return;
			mesh.rotation.y += 0.01 * 0.25;
			mesh.rotation.x += 0.004 * 0.25;
			renderer.render(scene, camera);
			raf = requestAnimationFrame(tick);
		};

		const onResize = () => resize();
		window.addEventListener('resize', onResize);

		resize();
		tick();

		(async () => {
			if (!alive) return;
			if (!zip || !mat || typeof mat !== 'object') return;

			const built = await buildMaterialFromParams(zip, mat, texCache);
			if (!alive || !built) return;

			if (mesh.material?.dispose) mesh.material.dispose();
			mesh.material = built;
			mesh.material.needsUpdate = true;
		})();

		return () => {
			alive = false;

			cancelAnimationFrame(raf);
			window.removeEventListener('resize', onResize);

			try { geo.dispose(); } catch { }

			try {
				if (mesh.material?.dispose) mesh.material.dispose();
			} catch { }

			for (const entry of texCache.values()) {
				for (const t of entry.variants.values()) {
					try { t.dispose?.(); } catch { }
				}
				try { entry.base?.dispose?.(); } catch { }
				try { entry.bmp?.close?.(); } catch { }
			}
			texCache.clear();

			try { renderer.dispose(); } catch { }
			host.innerHTML = '';
		};
	}, [mat, zip, texCache]);

	return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}