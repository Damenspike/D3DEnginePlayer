// MaterialSphere.jsx
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

export default function MaterialSphere({ url }) {
	const hostRef = useRef(null);
	const rRef = useRef(null);		// renderer
	const camRef = useRef(null);	// camera
	const sceneRef = useRef(null);	// scene
	const meshRef = useRef(null);	// sphere mesh
	const roRef = useRef(null);		// ResizeObserver
	const rafRef = useRef(0);
	const urlsRef = useRef([]);		// blob URLs to revoke on unmount

	// --- helpers ---
	function frameSphere(camera, radius = 1) {
		// vertical distance needed
		const fov = (camera.fov * Math.PI) / 180;
		const dV = radius / Math.tan(fov / 2);
	
		// horizontal distance needed (convert vertical FOV -> horizontal FOV)
		const fovH = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
		const dH = radius / Math.tan(fovH / 2);
	
		// pick the larger so it fits both axes; add a hair of padding
		const m = 4;
		
		const dist = Math.max(dV, dH) * 2.5;
		camera.position.set(1.25, -1.25, dist);
		camera.updateProjectionMatrix();
	}
	
	const setSizeSafe = (w, h) => {
		const cw = Math.max(64, Math.floor(w || 0));
		const ch = Math.max(64, Math.floor(h || 0));
		if (!rRef.current || !camRef.current) return;
		const cam = camRef.current;
		cam.aspect = cw / ch;
		cam.updateProjectionMatrix();
		rRef.current.setSize(cw, ch, false);
	
		// keep the sphere fully in view on any resize
		frameSphere(cam, 1); // radius = 1 (your sphere)
	};

	const loadZipURL = async (relPath) => {
		if (!relPath) return null;
		let p = relPath;
		if (!p.startsWith('assets/')) p = `assets/${p}`;
		const zip = window._root?.zip;
		const f = zip?.file(p);
		if (!f) return null;
		const blob = await f.async('blob');
		const obj = URL.createObjectURL(blob);
		urlsRef.current.push(obj);
		return obj;
	};

	const applyMaterialFromMatURL = async (matUrl) => {
		if (!meshRef.current || !matUrl) return;
		let def = {};
		try {
			const resp = await fetch(matUrl);
			def = JSON.parse(await resp.text() || '{}');
		} catch {
			return;
		}

		// Build params
		const params = {};
		if (def.color) params.color = new THREE.Color(Number(def.color));
		if (def.emissive) params.emissive = new THREE.Color(def.emissive);
		if (typeof def.emissiveIntensity === 'number') params.emissiveIntensity = def.emissiveIntensity;
		if (typeof def.roughness === 'number') params.roughness = def.roughness;
		if (typeof def.metalness === 'number') params.metalness = def.metalness;
		if (typeof def.wireframe === 'boolean') params.wireframe = def.wireframe;
		if (typeof def.opacity === 'number') {
			params.opacity = def.opacity;
			params.transparent = def.opacity < 1 || !!def.transparent;
		} else if (typeof def.transparent === 'boolean') {
			params.transparent = def.transparent;
		}

		// Maps (optional)
		const mapKeys = ['map','normalMap','metalnessMap','roughnessMap','aoMap','emissiveMap'];
		for (const k of mapKeys) {
			const v = def[k];
			if (typeof v === 'string' && v) {
				try {
					const mUrl = await loadZipURL(v);
					if (mUrl) {
						// load texture synchronously before swapping material (prevents one-frame black)
						// eslint-disable-next-line no-await-in-loop
						await new Promise((res, rej) => {
							new THREE.TextureLoader().load(
								mUrl,
								tex => { tex.flipY = false; params[k] = tex; res(); },
								undefined,
								rej
							);
						});
					}
				} catch {}
			}
		}

		// Swap material safely
		const oldMat = meshRef.current.material;
		const mat = new THREE.MeshStandardMaterial(params);
		meshRef.current.material = mat;

		// Dispose old after swap
		if (oldMat) {
			try {
				mapKeys.forEach(k => { const t = oldMat[k]; if (t && t.dispose) t.dispose(); });
				oldMat.dispose();
			} catch {}
		}
	};

	// Build once (no flicker)
	useLayoutEffect(() => {
		const el = hostRef.current;
		if (!el) return;

		// If parent collapses, give us a sane minimum without expanding the dialog
		const rect = el.getBoundingClientRect();
		const w0 = rect.width > 0 ? rect.width : 320;
		const h0 = rect.height > 0 ? rect.height : 240;

		// renderer
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.setClearColor(0x000000, 0);
		el.appendChild(renderer.domElement);
		rRef.current = renderer;

		// scene/camera
		const scene = new THREE.Scene();
		sceneRef.current = scene;

		const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
		camera.position.set(0, 0, 5); // temp
		camRef.current = camera;
		
		// after you add the mesh, immediately frame it:
		frameSphere(camera, 1);

		scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.9));
		const dir = new THREE.DirectionalLight(0xffffff, 1);
		dir.position.set(3, 5, 2);
		scene.add(dir);

		// sphere
		const geo = new THREE.SphereGeometry(1, 64, 64);
		const mat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8, metalness: 0.2 });
		const mesh = new THREE.Mesh(geo, mat);
		scene.add(mesh);
		meshRef.current = mesh;

		// input (no layout changes)
		let dragging = false, lastX = 0, lastY = 0;
		el.onpointerdown = e => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); };
		el.onpointerup = e => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch {} };
		el.onpointermove = e => {
			if (!dragging) return;
			const dx = (e.clientX - lastX) / Math.max(1, el.clientWidth);
			const dy = (e.clientY - lastY) / Math.max(1, el.clientHeight);
			mesh.rotation.y += dx * Math.PI;
			mesh.rotation.x += dy * Math.PI * 0.5;
			lastX = e.clientX; lastY = e.clientY;
		};

		// initial size
		setSizeSafe(w0, h0);

		// resize (throttled to rAF, ignore 0×0)
		let pending = false;
		const ro = new ResizeObserver(entries => {
			if (pending) return;
			pending = true;
			requestAnimationFrame(() => {
				pending = false;
				const cr = entries[entries.length - 1].contentRect;
				if (cr.width < 2 || cr.height < 2) return; // ignore collapsed sizes
				setSizeSafe(cr.width, cr.height);
			});
		});
		ro.observe(el);
		roRef.current = ro;

		// animate
		const tick = () => {
			rafRef.current = requestAnimationFrame(tick);
			mesh.rotation.y += 0.003;
			renderer.render(scene, camera);
		};
		tick();

		return () => {
			cancelAnimationFrame(rafRef.current);
			try { ro.disconnect(); } catch {}
			el.onpointerdown = el.onpointerup = el.onpointermove = null;
			// dispose in correct order
			try { mesh.geometry.dispose(); } catch {}
			try {
				const m = mesh.material;
				['map','normalMap','metalnessMap','roughnessMap','aoMap','emissiveMap'].forEach(k => {
					if (m && m[k]?.dispose) m[k].dispose();
				});
				m.dispose();
			} catch {}
			try { renderer.dispose(); } catch {}
			if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
			urlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
			urlsRef.current = [];
		};
	}, []);

	// Load/replace material when url changes (no rebuild)
	useEffect(() => {
		if (!url) return;
		applyMaterialFromMatURL(url);
	}, [url]);

	return (
		<div
			ref={hostRef}
			// This container won’t expand the dialog; it just fills its own pane.
			style={{
				width: '100%',
				height: '100%',
				minHeight: 320,
				overflow: 'hidden',
				display: 'block',
				contain: 'layout size style' // isolates layout → prevents right pane from bullying the grid
			}}
		/>
	);
}