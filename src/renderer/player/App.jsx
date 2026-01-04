import React, { useEffect, useRef } from 'react';
import useSystemTheme from './hooks/useSystemTheme.js';
import { loadD3D } from '../../engine/d3dplayer.js';
import { eventToWorld } from '../../engine/d2dutility.js';

import '../../assets/style/main.css';
import '../../assets/style/player.css';

var playerVersion = '';

export default function AppPlayer({srcAttr}) {
	const gameMasterRef = useRef(null);
	const game3dRef = useRef(null);
	const game2dRef = useRef(null);
	const theme = _isStandalone && useSystemTheme();
	
	useEffect(() => {
		if(window._isStandalone) {
			D3D.getPlayerVersion().then(v => {
				playerVersion = v;
			});
		}
	}, []);
	
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
						case 'trace':
							console.trace(message);
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
	
	// Right click menu
	useEffect(() => {
		return;
		if(!gameMasterRef?.current)
			return;
		
		const gameMaster = gameMasterRef.current;
		
		const onRightClick = (e) => {
			
			const template = [
				{
					label: `Damen3D Player ${playerVersion}`,
					enabled: false
				},
				{
					id: 'about',
					label: `About Damen3D Engine`
				}
			];
			
			const p = eventToWorld(e, _player.renderer2d.domElement, _player.renderer2d);
			
			const x = e.clientX + 2;
			const y = e.clientY + 2;
			
			_events.unall('ctx-menu-action');
			_events.on('ctx-menu-action', onCtxMenuAction);
			D3D.openContextMenu({template, x, y});
		}
		const onCtxMenuAction = async (id) => {
			if(id == 'about') {
				if(_isStandalone) {
					D3D.openWebsite();
				}else{
					window.open('https://damen3d.com/?origin=player', '_blank');
				}
			}
		}
		
		gameMaster.addEventListener('contextmenu', onRightClick);
		
		return () => {
			gameMaster.removeEventListener('contextmenu', onRightClick);
		}
	}, [gameMasterRef]);
	
	_player.theme = theme;
	
	return (
		<div
			className='game-master-container'
			ref={gameMasterRef}
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