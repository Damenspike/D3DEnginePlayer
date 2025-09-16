// GameView.jsx
import React, { useEffect, useRef, useCallback } from 'react';
import { loadD3DProj } from '../../../engine/d3deditor.js';

const MIME = 'application/x-d3d-objectrow';

export default function GameView() {
	const ref = useRef(null);

	const unpack = useCallback((e) => {
		try {
			return JSON.parse(e.dataTransfer.getData(MIME) || '{}');
		} catch {
			return null;
		}
	}, []);

	const onDragOver = useCallback((e) => {
		// Only allow our custom payload to be dropped
		const types = e.dataTransfer?.types;
		if (!types || !Array.from(types).includes(MIME))
			return;

		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	}, []);

	const onDrop = useCallback((e) => {
		e.preventDefault();
		const payload = unpack(e);
		if (!payload)
			return;
			
		if (!payload.path)
			return;

		// Screen → local coords
		const host = ref.current;
		if (!host)
			return;

		const r = host.getBoundingClientRect();
		const sx = e.clientX - r.left;
		const sy = e.clientY - r.top;
		
		window._editor.onAssetDroppedIntoGameView(payload.path, { x: sx, y: sy });
	}, [unpack]);

	useEffect(() => {
		const element = ref.current;
		if (!element)
			return;

		window._container3d = element;

		const observer = new ResizeObserver(() => {
			const w = element.clientWidth;
			const h = element.clientHeight;

			if (w <= 0 || h <= 0 || !window._editor)
				return;

			const r = window._editor.renderer;
			const cam = window._editor.camera;
			const comp = window._editor.composer;

			if (r)
				r.setSize(w, h, false);

			if (comp?.setSize)
				comp.setSize(w, h);

			if (cam) {
				cam.aspect = w / h;
				cam.updateProjectionMatrix();
			}
		});
		observer.observe(element);

		D3D.getCurrentProjectURI().then(uri => {
			loadD3DProj(uri);
		});

		return () => observer.disconnect();
	}, []);

	return (
		<div
			id="game-container"
			className="game"
			ref={ref}
			tabIndex={0}
			onDragOver={onDragOver}
			onDrop={onDrop}
			style={{ position: 'relative', width: '100%', height: '100%' }}
		/>
	);
}