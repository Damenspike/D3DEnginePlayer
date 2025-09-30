import React, { useEffect, useRef } from 'react';
import useSystemTheme from './hooks/useSystemTheme.js';
import { loadD3D } from '../../engine/d3dplayer.js';

import '../../assets/style/main.css';
import '../../assets/style/player.css';

export default function App() {
	const gameRef = useRef(null);
	const theme = useSystemTheme();
	
	useEffect(() => {
		const element = gameRef.current;
		if (!element)
			return;
		
		window._container3d = element;
		
		const observer = new ResizeObserver(() => {
			const w = element.clientWidth;
			const h = element.clientHeight;
			
			if (w <= 0 || h <= 0 || !window._editor)
				return;
			
			const r = window._player.renderer;
			const comp = window._player.composer;
			
			r && r.setSize(w, h, false);
			comp && comp.setSize(w, h);
		});
		observer.observe(element);
		
		D3D.getCurrentGameURI().then(uri => {
			loadD3D(uri);
		});
		
		return () => observer.disconnect();
	}, []);
	
	_player.theme = theme;
	
	return (
		<div
			id="game-container"
			className="game"
			ref={gameRef}
			style={{ position: 'relative', width: '100%', height: '100%' }}
		/>
	);
}