import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import useSystemTheme from '../hooks/useSystemTheme.js';

import '../../../assets/style/main.css';
import '../../../assets/style/editor.css';

function GraphicStraighten() {
	const theme = useSystemTheme();
	
	const [strength, setStrength] = useState(0.5);
	
	useEffect(() => {
		if (!theme) return;
		document.body.classList.remove('dark', 'light');
		document.body.classList.add(theme);
	}, [theme]);
	
	const okdoit = () => {
		D3D.closeToolWindow('graphicStraighten');
		D3D.sendMessage('modifySelected', 'straighten', {strength});
	}
	
	return (
		<div className="new-project">
			<div className='field'>
				<div className='sidebyside'>
					<div className='left-side vm'>
						<label>Strength</label>
					</div>
					<div className='right-side'>
						<input 
							type="number" 
							className="tf"
							value={strength} 
							min={0}
							max={1}
							step={0.01}
							onChange={e => setStrength(e.target.value)}
						/>
					</div>
				</div>
			</div>
		
			<button
				onClick={okdoit}
				style={{ width: '100%' }}
			>
				Straighten
			</button>
		</div>
	)
}

createRoot(document.getElementById('root')).render(<GraphicStraighten />);