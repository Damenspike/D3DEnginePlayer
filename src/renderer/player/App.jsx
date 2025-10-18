import React, { useEffect, useRef } from 'react';
import useSystemTheme from './hooks/useSystemTheme.js';
import { loadD3D } from '../../engine/d3dplayer.js';

import '../../assets/style/main.css';
import '../../assets/style/player.css';

export default function App() {
	const game3dRef = useRef(null);
	const game2dRef = useRef(null);
	const theme = useSystemTheme();
	
	useEffect(() => {
		const element3d = game3dRef.current;
		const element2d = game2dRef.current;
		
		if (!element3d || !element2d)
			return;
		
		window._container3d = element3d;
		window._container2d = element2d;
		
		D3D.getCurrentGameURI().then(uri => {
			loadD3D(uri);
		});
		
		return () => observer.disconnect();
	}, []);
	
	_player.theme = theme;
	
	return (
		<div
			className='game-master-container'
		>
			<div
				id='game3d-container'
				className='game'
				ref={game3dRef}
				tabIndex={0}
				style={{ 
					display: 'block'
				}}
			/>
			<div
				id='game2d-container'
				className='game'
				ref={game2dRef}
				tabIndex={0}
				style={{ 
					display: 'block'
				}}
			/>
		</div>
	);
}