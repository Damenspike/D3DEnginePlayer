import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

window._isStandalone = typeof D3D !== 'undefined';

const playerRoot = document.getElementById('damen3d-player');

if(_isStandalone) {
	// Running in standalone
	// make player shell follow the full width styling
	playerRoot.classList.add('player-shell');
}

createRoot(playerRoot)
.render(
	<App srcAttr={playerRoot.getAttribute('src')} />
);