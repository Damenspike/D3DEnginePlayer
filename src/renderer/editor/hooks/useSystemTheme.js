// src/hooks/useSystemTheme.js
import { useEffect, useState } from 'react';
const { ipcRenderer } = require('electron');

export default function useSystemTheme() {
	const [theme, setTheme] = useState('light');

	useEffect(() => {
		// Initial theme
		ipcRenderer.invoke('get-theme').then((t) => setTheme(t));

		// Subscribe to changes
		const handler = (_, t) => setTheme(t);
		ipcRenderer.on('theme-changed', handler);

		return () => {
			ipcRenderer.removeListener('theme-changed', handler);
		};
	}, []);

	// Reflect on <body>
	useEffect(() => {
		document.body.classList.remove('dark', 'light');
		document.body.classList.add(theme);
	}, [theme]);

	return theme;
}