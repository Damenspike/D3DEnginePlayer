import React, { useEffect, useRef } from 'react';
import useSystemTheme from './hooks/useSystemTheme.js';
import { loadD3D } from '../../engine/d3dplayer.js';

import '../../assets/style/main.css';
import '../../assets/style/player.css';

export default function App({srcAttr}) {
	const game3dRef = useRef(null);
	const game2dRef = useRef(null);
	const theme = _isStandalone && useSystemTheme();
	
	useEffect(() => {
		const element3d = game3dRef.current;
		const element2d = game2dRef.current;
		
		if (!element3d || !element2d)
			return;
		
		window._container3d = element3d;
		window._container2d = element2d;
		
		if(_isStandalone) {
			// Standalone
			D3D.getCurrentGameURI().then(uri => {
				loadD3D(uri);
			});
		}else{
			// Web
			window.D3D = {
				showError: ({message}) => alert(message),
				confirm: ({message, onConfirm, onDeny = null}) => {
					if(confirm(message))
						onConfirm?.();
					else
						onDeny?.();
				},
				closePlayer: () => null,
				updateWindow: () => null,
				onConsoleMessage: ({level, message}) => {
					switch(level) {
						case 'log':
							console.log(message);
						break;
						case 'warn':
							console.warn(message);
						break;
						case 'error':
							console.error(message);
						break;
					}
				}
			}
			
			// URI is the src attribute passed from main.jsx
			const uri = srcAttr;
			
			//console.log('D3D Source:', uri);
			
			loadD3D(uri);
		}
		
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