import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import useSystemTheme from '../hooks/useSystemTheme.js';
import { BITMAP_TRACE_DEFAULTS } from '../../../engine/d2dbitmaptrace.js';

import '../../../assets/style/main.css';
import '../../../assets/style/editor.css';

function BitmapTrace() {
	const theme = useSystemTheme();
	
	const [colorThreshold, setColorThreshold] = useState(BITMAP_TRACE_DEFAULTS.colorThreshold);
	const [minArea, setMinArea] = useState(BITMAP_TRACE_DEFAULTS.minArea);
	const [simplifyPx, setSimplifyPx] = useState(BITMAP_TRACE_DEFAULTS.simplifyPx);
	
	useEffect(() => {
		if (!theme) return;
		document.body.classList.remove('dark', 'light');
		document.body.classList.add(theme);
	}, [theme]);
	
	const doTrace = () => {
		D3D.closeToolWindow('bitmapTrace');
		D3D.sendMessage('traceSelectedBitmap', {
			colorThreshold, minArea, simplifyPx
		});
	}
	
	return (
		<div className="new-project">
		
			<div className='field'>
				<div className='sidebyside'>
					<div className='left-side vm'>
						<label>Color threshold</label>
					</div>
					<div className='right-side'>
						<input 
							type="number" 
							className="tf"
							value={colorThreshold} 
							min={0}
							max={1}
							step={0.01}
							onChange={e => setColorThreshold(e.target.value)}
						/>
					</div>
				</div>
			</div>
			<div className='field'>
				<div className='sidebyside'>
					<div className='left-side vm'>
						<label>Minimum area</label>
					</div>
					<div className='right-side'>
						<input 
							type="number" 
							className="tf"
							value={minArea} 
							min={0}
							max={1}
							step={0.01}
							onChange={e => setMinArea(e.target.value)}
						/>
					</div>
				</div>
			</div>
			<div className='field'>
				<div className='sidebyside'>
					<div className='left-side vm'>
						<label>Simplify (px)</label>
					</div>
					<div className='right-side'>
						<input 
							type="number" 
							className="tf"
							value={simplifyPx} 
							min={0}
							max={1}
							step={0.1}
							onChange={e => setSimplifyPx(e.target.value)}
						/>
					</div>
				</div>
			</div>
			{/*<div className='field'>
				<div className='sidebyside'>
					<div className='left-side'>
						<label>Invert</label>
					</div>
					<div className='right-side'>
						<input 
							type="checkbox"
							checked={!!invert}
							onChange={e => setInvert(!!e.target.checked)}
						/>
					</div>
				</div>
			</div>*/}
		
			<button
				onClick={doTrace}
				style={{ width: '100%' }}
			>
				Trace
			</button>
		</div>
	)
}

createRoot(document.getElementById('root')).render(<BitmapTrace />);