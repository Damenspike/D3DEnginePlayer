import React, { useEffect } from 'react';
import useSystemTheme from './hooks/useSystemTheme.js';

import '../../assets/style/main.css';

import logoLight from '../../assets/images/d3dlogo.png';
import logoDark from '../../assets/images/d3dlogowhite.png';

export default function StartScreen() {
	const theme = useSystemTheme();
	const logoSrc = theme == 'dark' ? logoDark : logoLight;

	useEffect(() => {
		if (!theme) return;
		document.body.classList.remove('dark', 'light');
		document.body.classList.add(theme);
	}, [theme]);

	return (
		<center>
			<div 
				className="logo no-select"
				style={{ 
					backgroundImage: `url(${logoSrc})`,
					marginTop: 20,
					marginBottom: 20
				}}
			></div>

			<p>
				<button onClick={() => D3D.startNewProject()}>
					New Project
				</button>
			</p>

			<p>
				<button onClick={() => D3D.openProjectDialog()}>
					Open Project
				</button>
			</p>
		</center>
	);
}