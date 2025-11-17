import React, { useEffect, useState } from 'react';
import useSystemTheme from './hooks/useSystemTheme.js';

import logoLight from '../../assets/images/d3dlogo.png';
import logoDark from '../../assets/images/d3dlogowhite.png';

import '../../assets/style/main.css';

/**
	Player start splash. (DESKTOP APP ONLY)
	No guards on window.D3D because of this
 */
export default function AppStart() {
	const theme = useSystemTheme();
	const logoSrc = theme == 'dark' ? logoDark : logoLight;
	
	const [url, setURL] = useState('');
	
	useEffect(() => {
		// Initial theme
		D3D.getTheme().then((t) => {
			if (!t) return;
			document.body.classList.remove('dark', 'light');
			document.body.classList.add(t);
		});
		
		// Listen for theme updates
		D3D.setEventListener('theme-changed', (t) => {
			document.body.classList.remove('dark', 'light');
			document.body.classList.add(t);
		});
	}, []);

	// Browse local file
	const onBrowse = async () => {
		const filePath = await D3D.browseD3D();
		if (filePath) 
			setURL(filePath);
	};

	// Load D3D file or URL
	const onLoad = () => {
		let uri = url.trim();
		
		if (!uri) {
			D3D.showError({
				title: 'Player',
				message: 'Please enter a D3D file path or URL'
			});
			return;
		}
		
		D3D.openD3DFile(uri);
	};

	return (
		<div className="player-start" style={{ 
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			textAlign: 'center',
			width: '100vw'
		 }}>
			<div
				className="logo no-select"
				style={{ 
					backgroundImage: `url(${logoSrc})`,
					marginTop: 20,
					marginBottom: 20
				}}
			/>
			
			<p>Open a local or remote d3d file</p>

			<div style={{display: 'block'}}>
				<div className='ib'>
					<input
						type="text"
						className="tf"
						style={{ width: 250 }}
						placeholder="Enter URL or browse local file"
						value={url}
						onChange={(e) => setURL(e.target.value)}
					/>
				</div>
				<div className='ib'>
					<button onClick={onBrowse} style={{ marginLeft: 10 }}>
						Browse
					</button>
				</div>
			</div>

			<div style={{
				marginTop: 30
			}}>
				<button onClick={onLoad}>Load</button>
			</div>
		</div>
	);
}