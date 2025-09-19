import React, { useState, useEffect, useRef } from 'react';

import { fileNameNoExt } from '../../../engine/d3dutility.js';

export default function AnimationInspector() {
	const defObject = _editor.selectedObjects[0] ?? _editor.focus.rootParent;
	
	const [selectedObject, setSelectedObject] = useState(defObject);
	const [animManager, setAnimManager] = useState(defObject?.getComponent('Animation'));
	const [activeClip, setActiveClip] = useState();
	
	useEffect(() => {
		
		_events.on('selected-objects', objects => {
			let obj = objects.length > 0 ? objects[0] : _editor.focus.rootParent;
			
			if(
				obj != _editor.focus.rootParent && 
				!obj.hasComponent('Animation') &&
				_editor.focus.rootParent.hasComponent('Animation')
			)
				obj = _editor.focus.rootParent;
			
			setSelectedObject(obj);
			setAnimManager(obj?.getComponent('Animation'));
		});
		
	}, []);
	
	useEffect(() => {
		const clipPaths = animManager?.getClipPaths();
		const path = clipPaths?.[0];
		
		if(!path) {
			setActiveClip(null);
			return;
		}
		
		_editor.readFile(path)
		.then(json => {
			try {
				const obj = JSON.parse(json);
				setActiveClip(obj);
			}catch(e) {
				setActiveClip(null);
				console.error(path, 'is a corrupt animation clip');
			}
		})
		
	}, [animManager]);
	
	const drawAnimationEditor = () => {
		if(!selectedObject) {
			return (
				<p>No object selected</p>
			)
		}
		if(!animManager) {
			return (
				<p>No animation present on {selectedObject.name}</p>
			)
		}
		
		const drawSelect = () => {
			const rows = [];
			
			rows.push(
				<option 
					key={rows.length}
					value={''}
					disabled
				>
					Choose a clip
				</option>
			)
			
			animManager.getClipPaths().forEach(path => {
				rows.push(
					<option 
						key={rows.length}
						value={path}
					>
						{fileNameNoExt(path)}
					</option>
				)
			});
			
			return (
				<select
					className="tf"
					value={activeClip ?? ''}
					onChange={e => setActiveClip(e.target.value)}
				>
					{rows}
				</select>
			)
		}
		const drawTimeline = () => {
			if(!activeClip)
				return;
			
			return (
				<div className='timeline'>
					test
				</div>
			)
		}
		
		return (
			<>
				<div className='clip-select'>
					{drawSelect()}
				</div>
				<div className='timeline'>
					{drawTimeline()}
				</div>
			</>
		)
	}
	
	return (
		<div className='animation-editor'>
			{drawAnimationEditor()}
		</div>
	)
}