import React from 'react';
import { createRoot } from 'react-dom/client';
import AppPlayer from './AppPlayer.jsx';

window._isStandalone = true; // Editor player is always standalone mode

const playerRoot = document.getElementById('damen3d-player');

if(_isStandalone) {
	// Running in standalone
	// make player shell follow the full width styling
	playerRoot.classList.add('player-shell');
}

createRoot(playerRoot)
.render(
	<AppPlayer srcAttr={playerRoot.getAttribute('src')} />
);