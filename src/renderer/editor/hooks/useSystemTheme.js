// src/hooks/useSystemTheme.js
import { useEffect, useState } from 'react';

export default function useSystemTheme() {
	const [theme, setTheme] = useState('light');

	useEffect(() => {
		let unsubscribe = null;
		let mounted = true;

		(async () => {
			try {
				const t = await D3D.theme.get();
				mounted && setTheme(t);
			} catch (err) {
				console.warn('[useSystemTheme] failed to get theme:', err);
			}

			unsubscribe = D3D.theme.onChange((t) => {
				mounted && setTheme(t);
			});
		})();

		return () => {
			mounted = false;
			unsubscribe && unsubscribe();
		};
	}, []);

	// Reflect on <body>
	useEffect(() => {
		document.body.classList.remove('dark', 'light');
		document.body.classList.add(theme);
	}, [theme]);

	return theme;
}