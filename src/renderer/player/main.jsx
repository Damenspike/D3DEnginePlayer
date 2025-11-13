import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const playerRoot = document.getElementById('damen3d-player');

createRoot(playerRoot)
.render(
	<App srcAttr={playerRoot.getAttribute('src')} />
);