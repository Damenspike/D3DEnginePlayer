import React, { useState, useEffect } from 'react';
import D3DZip from '../../engine/d3dzip.js';
import useSystemTheme from './hooks/useSystemTheme.js';

import '../../assets/style/main.css';
import '../../assets/style/editor.css';

export default function AppNew() {
	const [name, setName] = useState('');
	const [author, setAuthor] = useState('');
	const [width, setWidth] = useState(760);
	const [height, setHeight] = useState(480);
	const [template, setTemplate] = useState('none');
	
	const theme = useSystemTheme();

	useEffect(() => {
		if (!theme) return;
		document.body.classList.remove('dark', 'light');
		document.body.classList.add(theme);
	}, [theme]);

	// All D3DZip logic lives here now
	const jszipCreateProject = async ({ data, name, author, width, height }) => {
		// data is Uint8Array coming from preload
		const zip = await D3DZip.loadAsync(data);
	
		const manifestPath = 'manifest.json';
		const file = zip.file(manifestPath);
		if (!file) {
			throw new Error('Template manifest.json not found');
		}
	
		let manifest = {};
		try {
			const manifestStr = await file.async('string');
			manifest = manifestStr ? JSON.parse(manifestStr) : {};
		} catch {
			throw new Error('Template manifest is invalid JSON');
		}
	
		manifest.name = name.trim();
		manifest.author = author;
		manifest.width = width;
		manifest.height = height;
	
		zip.file(manifestPath, JSON.stringify(manifest, null, 2));
	
		// Return Uint8Array so preload can turn it into a Buffer
		const outArr = await zip.generateAsync({
			type: 'uint8array',
			compression: 'STORE'
		});
		
		return outArr;
	};
	
	const createProject = () => {
		D3D.createNewProject({
			name,
			author,
			width: Number(width),
			height: Number(height),
			template,
			onComplete: onProjectCreated,
			closeNewWindow: true,
			jszipCreateProject
		});
	};
	
	const onProjectCreated = ({ path }) => {
		console.log('Project created', path);
		D3D.openProject(path);
	};

	return (
		<div className="new-project">

			<div className="field">
				<label>Project name</label>
				<input
					id="newproj_name"
					type="text"
					className="tf"
					value={name}
					onChange={e => setName(e.target.value)}
				/>
			</div>

			<div className="field">
				<label>Author</label>
				<input
					id="newproj_author"
					type="text"
					className="tf"
					value={author}
					onChange={e => setAuthor(e.target.value)}
				/>
			</div>

			<div className="field">
				<label>Default dimensions</label>
				<input
					id="newproj_width"
					name="width"
					type="number"
					className="tf tf--num"
					value={width}
					onChange={e => setWidth(e.target.value)}
				/>
				<input
					id="newproj_height"
					name="height"
					type="number"
					className="tf tf--num"
					value={height}
					onChange={e => setHeight(e.target.value)}
				/>
			</div>

			<div className="field">
				<label>Template</label>
				<select
					id="newproj_template"
					className="tf"
					value={template}
					onChange={e => setTemplate(e.target.value)}
				>
					<option value="none">Empty Project</option>
					<option value="aviation">Aviation Demo</option>
					<option value="waddle">Waddle Demo</option>
					<option value="snail">Snail Demo</option>
					<option value="car">Car Demo</option>
				</select>
			</div>

			<button
				onClick={createProject}
				style={{ width: '100%' }}
			>
				Create Project
			</button>
		</div>
	);
}