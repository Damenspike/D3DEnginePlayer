// GameView.jsx
import React, { useEffect, useRef } from 'react';
const { ipcRenderer } = require('electron');
import { loadD3DProj } from '../../../engine/d3deditor.js';

export default function GameView() {
	const ref = useRef(null);

	useEffect(() => {
		const element = ref.current;
		if(!element) return;
		
		window._container3d = element;
		
		const observer = new ResizeObserver(() => {
			const w = element.clientWidth;
			const h = element.clientHeight;
			if(w > 0 && h > 0 && window._editor) {
				const r = window._editor.renderer;
				const cam = window._editor.camera;
				const comp = window._editor.composer;
				if(r) {
					r.setSize(w, h, false);
				}
				if(comp?.setSize) {
					comp.setSize(w, h);
				}
				if(cam) {
					cam.aspect = w / h;
					cam.updateProjectionMatrix();
				}
			}
		});
		observer.observe(element);
		
		ipcRenderer.invoke('get-current-project-uri').then(uri => {
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
			// style here only to guarantee non-zero sizing path;
			// keep your CSS as-is, this just guards against 0px init.
			style={{ position: 'relative', width: '100%', height: '100%' }}
		/>
	);
}