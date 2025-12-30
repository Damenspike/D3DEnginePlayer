import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { clamp01, clamp } from '../../../engine/d3dmath.js';
import useSystemTheme from '../hooks/useSystemTheme.js';

import '../../../assets/style/main.css';
import '../../../assets/style/editor.css';

const autoBlur = e => {
	if(e.key === 'Enter') {
		e.preventDefault();
		e.currentTarget.blur();
	}
}

function ProjectSettings() {
	const theme = useSystemTheme();
	
	const [quality2D, setQuality2D] = useState(1);
	const [quality3D, setQuality3D] = useState(1);
	const [gtao, setGTAO] = useState(true);
	const [ssao, setSSAO] = useState(false);
	
	const [compression, setCompression] = useState(6);
	const [insMaxBatch, setInsMaxBatch] = useState(1024);
	const [codeObfuscation, setCodeObfuscation] = useState(true);
	const [stripAssets, setStripAssets] = useState(true);
	
	useEffect(() => {
		if(!theme) return;
		document.body.classList.remove('dark', 'light');
		document.body.classList.add(theme);
	}, [theme]);
	
	useEffect(() => {
		(async () => {
			const s = await D3D.getProjectSettings();
			if(!s) return;
			
			setQuality2D(s.quality2D ?? 1);
			setQuality3D(s.quality3D ?? 1);
			setGTAO(s.gtao ?? true);
			setSSAO(s.ssao ?? false);
			
			setCompression(s.compression ?? 6);
			setCodeObfuscation(s.codeObfuscation ?? true);
			setStripAssets(s.stripAssets ?? true);
			setInsMaxBatch(s.insMaxBatch ?? 1024);
		})();
	}, []);
	
	useEffect(() => {
		D3D.sendMessage('updateProjectSettings', {
			quality2D, quality3D,
			gtao, ssao,
			compression,
			insMaxBatch,
			codeObfuscation,
			stripAssets
		});
		
		if(gtao && ssao) {
			setSSAO(false);
			setGTAO(false);
		}
	}, [
		quality2D, quality3D,
		gtao, ssao,
		compression,
		insMaxBatch,
		codeObfuscation,
		stripAssets
	]);
	
	const drawSection = (title, children) => (
		<div className='mb'>
			<div className='small gray'>
				{title}
			</div>
			<hr />
			{children}
		</div>
	);
	
	const drawNumber = (label, value, onChange, { min, max, step } = {}, desc = null) => (
		<div className='field field-mini ib mr2 bdl'>
			<div className='sidebyside'>
				<div className='left-side vm'>
					<label>{label}</label>
					
					{desc && (
						<div style={{maxWidth: 300}}>
							<div className='small2 gray mt'>{desc}</div>
						</div>
					)}
				</div>
				<div className='right-side'>
					<input
						type="number"
						className="tf tf--num"
						value={value}
						min={min}
						max={max}
						step={step}
						onKeyDown={autoBlur}
						onChange={e => onChange(e.target.value)}
					/>
				</div>
			</div>
		</div>
	);
	
	const drawCheckbox = (label, checked, setChecked) => (
		<div className='field field-mini ib mr2 bdl'>
			<div className='sidebyside'>
				<div className='left-side vm'>
					<label>{label}</label>
				</div>
				<div className='right-side vm'>
					<input
						type="checkbox"
						onKeyDown={autoBlur}
						checked={!!checked}
						onChange={e => setChecked(e.target.checked)}
					/>
				</div>
			</div>
		</div>
	);
	
	return (
		<div className="project-settings">
			{
				drawSection('Editor', (
					<>
						{
							drawNumber(
								'2D graphics quality',
								quality2D,
								v => setQuality2D(clamp01(v)),
								{ min: 0, max: 1, step: 0.1 }
							)
						}
						{
							drawNumber(
								'3D graphics quality',
								quality3D,
								v => setQuality3D(clamp01(v)),
								{ min: 0, max: 1, step: 0.1 }
							)
						}
						<br />
						{drawCheckbox('Ground-true ambient occlusion', gtao, setGTAO)}
						{drawCheckbox('Screen-space ambient occlusion', ssao, setSSAO)}
					</>
				))
			}
			
			{
				drawSection('Build', (
					<>
						{
							drawNumber(
								'Compression',
								compression,
								v => setCompression(Number(v) || 1),
								{ min: 1, max: 9, step: 1 },
								'When building your .d3d file, the editor will compress the contents according to a compression level from 1-9. Files with greater compression take longer to decompress.'
							)
						}
						{
							drawNumber(
								'Max instances per batch',
								insMaxBatch,
								v => setInsMaxBatch(Number(v) || 1),
								{ min: 1, max: Infinity, step: 1 },
								'Determines how many instanced meshes can appear in each batch. (Default is 1024)'
							)
						}
						<br />
						{drawCheckbox('Code obfuscation', codeObfuscation, setCodeObfuscation)}
						{drawCheckbox('Strip assets', stripAssets, setStripAssets)}
					</>
				))
			}
		</div>
	);
}

createRoot(document.getElementById('root')).render(<ProjectSettings />);