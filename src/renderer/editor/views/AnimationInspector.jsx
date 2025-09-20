import React, { useState, useEffect, useRef } from 'react';
import {
	MdPlayArrow,
	MdFastForward,
	MdFastRewind,
	MdFiberManualRecord
} from 'react-icons/md';

import { 
	fileNameNoExt,
	approx
} from '../../../engine/d3dutility.js';

const frameWidth = 10;
const autoBlur = (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();   // stop form submit
		e.currentTarget.blur();
	}
}

export default function AnimationInspector() {
	const defObject = _editor.selectedObjects[0] ?? _editor.focus.rootParent;
	
	const [selectedObject, setSelectedObject] = useState(defObject);
	const [animManager, setAnimManager] = useState(defObject?.getComponent('Animation'));
	const [activeClip, setActiveClip] = useState();
	const [scale, setScale] = useState(1);
	const [fps, setFps] = useState(_editor.animationDefaultFps);
	const [resolution, setResolution] = useState(0.5);
	const [selectedTracks, setSelectedTracks] = useState([]);
	const [selectedKeys, setSelectedKeys] = useState([]);
	const [currentTime, setCurrentTime] = useState(0);
	
	const duration = activeClip?.duration ?? 0;
	const keysCount = duration * fps;
	const timingBarWidth = keysCount * frameWidth;
	const timeMarkerWidth = timingBarWidth / (duration / resolution);
	
	useEffect(() => {
		
		_events.on('deselect-animation-editor', () => {
			setSelectedTracks([]);
			setSelectedKeys([]);
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
		if(!animManager) {
			setActiveClip(null);
			return;
		}
		
		setActiveClip(Object.values(animManager.clips)[0]);
	}, [animManager]);
	
	useEffect(() => {
		_editor.animationDefaultFps = fps;
	}, [fps]);
	
	useEffect(() => {
		console.log(activeClip);
	}, [activeClip]);
	
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
			
			setSelectedTracks(sel);
		}
		setSelectedKeys([]);
	}
	const selectKey = (keyId) => {
		_events.invoke('deselect-assets');
		
		if(!selectedKeys.includes(keyId)) {
			if(_input.getKeyDown('shift')) {
				setSelectedKeys([...selectedKeys, keyId]);
			}else{
				setSelectedKeys([keyId]);
			}
		}else
		if(_input.getKeyDown('shift')) {
			const sel = [...selectedKeys];
			
			sel.splice(sel.indexOf(keyId), 1);
			
			setSelectedKeys(sel);
		}
		setSelectedTracks([]);
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
						<button
							className='play-button'
						>
							<MdFastRewind />
						</button>
						<button
							className='play-button'
						>
							<MdPlayArrow />
						</button>
						<button
							className='play-button'
						>
							<MdFastForward />
						</button>
					</div>
					<div className='ib mrx'>
						<button
							className='play-button record-button'
						>
							<MdFiberManualRecord />
						</button>
					</div>
					<div className='ib mr'>
						<span className='small mr'>
							FPS
						</span>
						<input
							type='number'
							className='tf tf--nums'
							value={fps}
							onChange={e => {
								let v = Number(e.target.value);
								if(!v) v = 60;
								if(v < 1) v = 1;
								if(v > 120) v = 120;
								setFps(v);
							}}
							onKeyDown={autoBlur}
							placeholder='FPS'
						/>
					</div>
					<div className='ib mr'>
						<span className='small mr'>
							Duration
						</span>
						<input
							type='number'
							className='tf tf--nums'
							value={duration}
							onChange={e => {
								let v = Number(e.target.value);
								if(isNaN(v)) return;
								if(!v) v = 0.1;
								
								activeClip.duration = v;
								setActiveClip({...activeClip});
							}}
							onKeyDown={autoBlur}
							placeholder='Secs'
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
				
			const objectTracks = activeClip.objectTracks;
				
			const drawPlayHead = () => {
				let x = (timingBarWidth * currentTime) + 4;
				if(x > timingBarWidth)
					x = timingBarWidth - 6;
				return (
					<div 
						className='playhead'
						style={{transform: `translateX(${x}px)`}}
					></div>
				)
			}
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
				
				const updateScrub = (e) => {
					if(_input.getMouseButtonDown(0)) {
						const rect = e.currentTarget.getBoundingClientRect();
						const x = e.clientX - rect.left;
						
						let time = x / timingBarWidth;
						if(time < 0) time = 0;
						if(time > 1) time = 1;
						
						const frameDur = 1 / fps / 2;
						const snappedTime = Math.round(time / frameDur) * frameDur;
						setCurrentTime(snappedTime);
					}
				}
				
				return (
					<div 
						className='timing-bar' 
						style={{width: timingBarWidth}}
						onMouseMove={updateScrub}
						onMouseDown={updateScrub}
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
					<div 
						className='tracks'
						onMouseDown={e => {
							setSelectedKeys([]);
							setSelectedTracks([]);
						}}
					>
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
						const keyId = `${objectName}_${i}`;
						
						const key_Pos = objectTrack.position.times.find(
							t => approx(t, time)
						) !== undefined;
						const key_Rot = objectTrack.quaternion.times.find(
							t => approx(t, time)
						) !== undefined;
						const key_Scl = objectTrack.scale.times.find(
							t => approx(t, time)
						) !== undefined;
						
						const isFramed = key_Pos || key_Rot || key_Scl;
						
						if(isFramed)
							classes.push('key--framed');
							
						if(selectedKeys.includes(keyId))
							classes.push('key--selected');
							
						keys.push(
							<div 
								key={keys.length}
								className={classes.join(' ')} 
								style={{width: frameWidth}}
								onMouseDown={e => {
									if(!isFramed) return;
									e.preventDefault();
									e.stopPropagation();
									selectKey(keyId);
								}}
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
						{drawPlayHead()}
						{rows}
					</div>
				)
			}
			
			return (
				<div className='timeline'>
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