import React, { useState, useEffect, useRef } from 'react';

import { 
	fileNameNoExt,
	approx
} from '../../../engine/d3dutility.js';

const frameWidth = 10;

export default function AnimationInspector() {
	const defObject = _editor.selectedObjects[0] ?? _editor.focus.rootParent;
	
	const [selectedObject, setSelectedObject] = useState(defObject);
	const [animManager, setAnimManager] = useState(defObject?.getComponent('Animation'));
	const [activeClip, setActiveClip] = useState();
	const [scale, setScale] = useState(1);
	const [fps, setFps] = useState(60);
	const [resolution, setResolution] = useState(0.5);
	const [selectedTracks, setSelectedTracks] = useState([]);
	
	const duration = activeClip?.duration ?? 0;
	const keysCount = duration * fps;
	const timingBarWidth = keysCount * frameWidth;
	const timeMarkerWidth = timingBarWidth / (duration / resolution);
	
	console.log(activeClip);
	
	useEffect(() => {
		
		_events.on('deselect-animation-editor', () => {
			setSelectedTracks([]);
		});
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
	
	const selectTrack = (trackName) => {
		_events.invoke('deselect-assets');
		
		if(!selectedTracks.includes(trackName)) {
			if(_input.getKeyDown('shift')) {
				setSelectedTracks([...selectedTracks, trackName]);
			}else{
				setSelectedTracks([trackName]);
			}
		}else
		if(_input.getKeyDown('shift')) {
			const sel = [...selectedTracks];
			
			sel.splice(sel.indexOf(trackName), 1);
			
			setSelectedTracks(sel)
		}
	}
	const openTrack = (trackName) => {
		const d3dobject = selectedObject.find(trackName); // TODO: May need path parsing
		if(!d3dobject) {
			console.warn('Could not open track object', trackName);
			return;
		}
		
		_editor.focus = d3dobject;
		selectTrack(trackName);
	}
	
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
		
		const drawOptions = () => {
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
				
				return rows;
			}
			
			return (
				<div className='clip-select'>
					<div className='ib mr'>
						<span className='small mr'>
							FPS
						</span>
						<input
							type='number'
							className='tf tf--nums'
							value={fps}
							onChange={e => {
								const v = Number(e.target.value);
								if(!v) v = 60;
								if(v < 1) v = 1;
								if(v > 120) v = 120;
								setFps(v);
							}}
							placeholder='FPS'
						/>
					</div>
					<div className='ib'>
						<select
							className="tf"
							value={activeClip ?? ''}
							onChange={e => setActiveClip(e.target.value)}
						>
							{drawSelect()}
						</select>
					</div>
				</div>
			)
		}
		const drawTimeline = () => {
			if(!activeClip)
				return;
				
			if(duration <= 0 || isNaN(duration)) {
				console.warn('Invalid clip length', duration);
				return;
			}
				
			const objectTracks = {};
			
			activeClip.tracks.forEach(track => {
				const parts = track.name.split('.');
				const objectName = parts[0];
				const transform = parts[1];
				
				if(
					transform != 'position' && 
					transform != 'quaternion' && 
					transform != 'scale'
				)
					return;
				
				if(!objectTracks[objectName])
					objectTracks[objectName] = {};
				
				objectTracks[objectName][transform] = track;
			});
				
			const drawTimingBar = () => {
				const rows = [];
				
				const frames = activeClip.duration * fps;
				
				for(let i = 0; i < frames; i++) {
					const secs = i / fps;
					
					if(secs % (resolution / 2) != 0)
						continue;
					
					rows.push(
						<div 
							key={rows.length}
							className='time-marker' 
							style={{width: timeMarkerWidth }}
						>
							{secs}s
						</div>
					)
				}
				
				return (
					<div 
						className='timing-bar' 
						style={{width: timingBarWidth}}
					>
						{rows}
					</div>
				)
			}
			const drawTracks = () => {
				const rows = [];
				
				for(let objectName in objectTracks) {
					const objectTrack = objectTracks[objectName];
					const classes = ['track'];
					
					if(selectedTracks.includes(objectName))
						classes.push('track--selected')
					
					rows.push(
						<div 
							key={rows.length}
							className={classes.join(' ')}
							onClick={() => selectTrack(objectName)}
							onDoubleClick={e => {
								e.preventDefault();
								openTrack(objectName);
							}}
						>
							{objectName}
						</div>
					)
				};
				
				return (
					<div className='tracks'>
						<div className='tracks-topbar'>
							
						</div>
						{rows}
					</div>
				);
			}
			const drawKeyTracks = () => {
				
				const rows = [];
				
				for(let objectName in objectTracks) {
					const objectTrack = objectTracks[objectName];
					const keys = [];
					
					for(let i = 0; i < keysCount; i++) {
						const classes = ['key'];
						const time = i / keysCount * duration;
						
						const key_Pos = objectTrack.position.times.find(
							t => approx(t, time)
						) !== undefined;
						const key_Rot = objectTrack.quaternion.times.find(
							t => approx(t, time)
						) !== undefined;
						const key_Scl = objectTrack.scale.times.find(
							t => approx(t, time)
						) !== undefined;
						
						if(key_Pos || key_Rot || key_Scl)
							classes.push('key--framed');
							
						keys.push(
							<div 
								key={keys.length}
								className={classes.join(' ')} 
								style={{width: frameWidth}}
							></div>
						)
					}
					
					rows.push(
						<div 
							key={rows.length}
							className='track'
							style={{width: timingBarWidth}}
						>
							{keys}
						</div>
					)
				};
				
				return (
					<div className='keytracks'>
						{drawTimingBar()}
						{rows}
					</div>
				)
			}
			
			return (
				<div className='timeline' tabIndex={2}>
					{drawTracks()}
					{drawKeyTracks()}
				</div>
			)
		}
		
		return (
			<>
				{drawOptions()}
				{drawTimeline()}
			</>
		)
	}
	
	return (
		<div className='animation-editor no-select'>
			{drawAnimationEditor()}
		</div>
	)
}