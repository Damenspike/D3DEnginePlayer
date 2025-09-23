import React, { useState, useEffect, useRef } from 'react';
import {
	MdPlayArrow,
	MdPause,
	MdFastForward,
	MdFastRewind,
	MdFiberManualRecord
} from 'react-icons/md';

import { 
	fileNameNoExt
} from '../../../engine/d3dutility.js';

const autoBlur = (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();   // stop form submit
		e.currentTarget.blur();
	}
}

export default function AnimationInspector() {
	const defObject = _editor.selectedObjects[0] ?? _editor.focus.rootParent;
	
	const animationEditorRef = useRef();
	const timingBarRef = useRef();
	
	const [selectedObject, setSelectedObject] = useState(defObject);
	const [animManager, setAnimManager] = useState(defObject?.getComponent('Animation'));
	const [activeClip, setActiveClip] = useState();
	const [scale, setScale] = useState(1);
	const [fps, setFps] = useState(_editor.animationDefaultFps);
	const [resolution, setResolution] = useState(0.5);
	const [selectedTracks, setSelectedTracks] = useState([]);
	const [selectedKeys, setSelectedKeys] = useState([]);
	const [currentTime, setCurrentTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [scrubbing, setScrubbing] = useState(false);
	const [clipDuration, setClipDuration] = useState(0);
	const [startKeyframePos, setStartKeyframePos] = useState({x: 0, y: 0});
	const [startKeyframePos_, setStartKeyframePos_] = useState({x: 0, y: 0});
	const [draggingKey, setDraggingKey] = useState(false);
	
	const frameWidth = 10 * (resolution + 0.5);
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
		if(!selectedObject || !activeClip)
			return;
		
		const clipState = selectedObject.animation.getClipState(activeClip.name);
		
		if(!clipState)
			return;
		
		clipState.updateTransforms(currentTime * activeClip.duration);
	}, [currentTime]);
	
	useEffect(() => {
		console.log(activeClip);
		
		// Undo scrub effects
		const handleClickOutside = (e) => {
			if (
				animationEditorRef.current && 
				!animationEditorRef.current.contains(e.target)
			) {
				console.log('Clicked outside of animation editor, resetting transforms...');
				_editor.animationEditorInFocus = false;
				
				if(!selectedObject || !activeClip)
					return;
				
				const clipState = selectedObject.animation.getClipState(activeClip.name);
				
				if(!clipState)
					return;
				
				clipState.resetAnimationTransforms();
			}
		}
		
		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [activeClip]);
	
	useEffect(() => {
		if(selectedKeys.length > 0)
			_editor.animationEditorInFocus = true;
		
		const onDelete = () => {
			selectedKeys.forEach(key => deleteKey(key));
			setSelectedKeys([]);
		}
		
		_events.on('delete-action', onDelete);
		
		return () => {
			_events.un('delete-action', onDelete);
		}
	}, [selectedKeys]);
	
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
	const selectKey = (key) => {
		_events.invoke('deselect-assets');
		
		if(!selectedKeys.includes(key)) {
			if(_input.getKeyDown('shift')) {
				setSelectedKeys([...selectedKeys, key]);
			}else{
				setSelectedKeys([key]);
			}
		}else
		if(_input.getKeyDown('shift')) {
			const sel = [...selectedKeys];
			
			sel.splice(sel.indexOf(key), 1);
			
			setSelectedKeys(sel);
		}else{
			setSelectedKeys([key]);
		}
		setSelectedTracks([]);
	}
	const openTrack = (trackName) => {
		const d3dobject = selectedObject.findDeep(trackName)[0];
		if(!d3dobject) {
			console.warn('Could not open track object', trackName);
			return;
		}
		
		_editor.focus = d3dobject.parent ?? d3dobject;
		_editor.setSelection([d3dobject]);
		selectTrack(trackName);
	}
	const togglePlaying = () => {
		if(playing) {
			selectedObject.animation.pause(activeClip.name);
			setPlaying(false);
		}else{
			selectedObject.animation.play(activeClip.name, {
				listener: (state) => {
					setPlaying(state.playing);
					setCurrentTime(state.normalizedTime);
				}
			});
			setPlaying(true);
		}
	}
	const updateKeyDown = (e) => {
		if(e.key === 'Delete' || e.key === 'Backspace') {
			console.log('Delete action');
		}
	}
	const updateMouseMove = (e) => {
		updateKeyframeMove(e);
		updateScrub(e);
	}
	const updateKeyframeMove = (e) => {
		if(!draggingKey || selectedKeys.length < 1 || !(e.buttons & 1))
			return;
		
		const deltaX = e.pageX - startKeyframePos.x;
		const w = frameWidth;
		const movePlaces = Math.floor(
			Math.abs(deltaX / w)
		) * (deltaX > 0 ? 1 : -1);
		
		selectedKeys.forEach(key => {
			const objectTrack = key.objectTrack;
			const oldTime = key.startDragTime;
			let newTime = oldTime + (1/fps*movePlaces);
			
			if(newTime < 0)
				newTime = 0;
				
			const newFrameNumber = Math.floor(newTime * fps);
			
			const key_Pos = objectTrack.position.smartTrack.find(
				k => k.keyNumber == key.keyNumber
			);
			const key_Rot = objectTrack.quaternion.smartTrack.find(
				k => k.keyNumber == key.keyNumber
			);
			const key_Scl = objectTrack.scale.smartTrack.find(
				k => k.keyNumber == key.keyNumber
			);
			
			if(key_Pos)
				key_Pos.time = newTime;
			
			if(key_Rot)
				key_Rot.time = newTime;
			
			if(key_Scl)
				key_Scl.time = newTime;
			
			key.time = newTime;
		});
		
		// Rebuild the actual native three animation clip tracks based on our own spec
		selectedObject.animation.rebuildClipTracks(activeClip.name);
		
		setStartKeyframePos_({x: e.pageX, y: e.pageY}); // hack
	}
	const updateScrub = (e, override = false) => {
		if(!scrubbing && !override) return;
		if(!_input.getMouseButtonDown(0) && !override) return;
	
		const rect = timingBarRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		
		let time = x / timingBarWidth;
		if(time < 0) time = 0;
		if(time > 1) time = 1;
		
		const frameDur = 1 / fps / 2;
		const snappedTime = Math.round(time / frameDur) * frameDur;
		setCurrentTime(snappedTime);
	}
	const updateZoom = (e) => {
		const baseSens = 0.0015;
		const sens = e.shiftKey ? baseSens * 4 : baseSens;
		const min = 0.005;
		const max = 2;
		
		const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
		
		setResolution((prev) => {
			const scale = Math.pow(1 - sens, e.deltaY);
			return clamp(prev * scale, min, max);
		});
	}
	const deleteKey = (key) => {
		const frameNumber = Math.floor(key.time * fps);
		const objectTrack = key.objectTrack;
		
		const keyE_Pos = objectTrack.position.smartTrack.find(
			k => Math.floor(k.time * fps) == frameNumber
		);
		const keyE_Rot = objectTrack.quaternion.smartTrack.find(
			k => Math.floor(k.time * fps) == frameNumber
		);
		const keyE_Scl = objectTrack.scale.smartTrack.find(
			k => Math.floor(k.time * fps) == frameNumber
		);
		
		if(keyE_Pos) {
			objectTrack.position.smartTrack.splice(
				objectTrack.position.smartTrack.indexOf(keyE_Pos),
				1
			);
		}
		if(keyE_Rot) {
			objectTrack.quaternion.smartTrack.splice(
				objectTrack.quaternion.smartTrack.indexOf(keyE_Rot),
				1
			);
		}
		if(keyE_Scl) {
			objectTrack.scale.smartTrack.splice(
				objectTrack.scale.smartTrack.indexOf(keyE_Scl),
				1
			);
		}
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
							title='Go to start'
							onClick={() => setCurrentTime(0)}
						>
							<MdFastRewind />
						</button>
						<button
							className='play-button'
							onClick={() => togglePlaying()}
							title={!playing ? 'Play' : 'Pause'}
						>
							{
								!playing ? (
									<MdPlayArrow />
								) : (
									<MdPause />
								)
							}
						</button>
						<button
							className='play-button'
							title='Go to end'
							onClick={() => setCurrentTime(1)}
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
								setClipDuration(v); // only for state changes
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
				const duration = activeClip.duration; // seconds
				
				// choose a nice step in seconds based on resolution
				let stepSec;
				if (resolution > 0.75) stepSec = 0.1;
				else if (resolution > 0.4) stepSec = 0.25;
				else if (resolution > 0.2) stepSec = 0.5;
				else stepSec = 1;
				
				// how many full steps fit strictly before the end
				const steps = Math.floor(duration / stepSec);
				
				// marker width in px for one step
				const stepWidth = stepSec * fps * frameWidth;
				
				// emit markers at 0, stepSec, 2*stepSec, ... < duration
				for (let k = 0; k < steps; k++) {
					const secs = k * stepSec; // integer * step => stable
				
					rows.push(
						<div
							key={`t-${k}`}
							className="time-marker"
							style={{ width: stepWidth }}
						>
							{Math.round(secs * 100) / 100}s
						</div>
					);
				}
				
				// tail to fill up to exact duration (no label)
				const tailSec = duration - steps * stepSec;
				if (tailSec > 0) {
					rows.push(
						<div
							key="t-tail"
							className="time-marker"
							style={{ width: timeMarkerWidth * tailSec * fps }}
						/>
					);
				}
				
				return (
					<div 
						ref={timingBarRef}
						className='timing-bar' 
						style={{width: timingBarWidth}}
						onMouseDown={e => {
							updateScrub(e, true);
							setScrubbing(true);
						}}
						onMouseUp={() => setScrubbing(false)}
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
							onClick={e => {
								e.stopPropagation();
								selectTrack(objectName);
							}}
							onDoubleClick={() => openTrack(objectName)}
						>
							{objectName}
						</div>
					)
				};
				
				return (
					<div 
						className='tracks'
						onClick={e => {
							if(!e.shiftKey) {
								setSelectedKeys([]);
								setSelectedTracks([]);
							}
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
				
				const drawKey = (key, frameNumber, keyed) => {
					const classes = ['key'];
					
					if(keyed)
						classes.push('key--framed');
					
					if(selectedKeys.includes(key))
						classes.push('key--selected');
					
					return (
						<div 
							key={frameNumber}
							className={classes.join(' ')} 
							style={{width: frameWidth}}
							onMouseDown={e => {
								e.preventDefault();
								e.stopPropagation();
								
								if(!keyed)  {
									if(!e.shiftKey)
										setSelectedKeys([]);
									return;
								}
								
								key.startDragTime = key.time;
								
								setDraggingKey(true);
								selectKey(key);
								setStartKeyframePos({x: e.pageX, y: e.pageY});
							}}
							onMouseUp={e => {
								setDraggingKey(false);
							}}
						></div>
					)
				}
				
				for(let objectName in objectTracks) {
					const objectTrack = objectTracks[objectName];
					const drawKeys = [];
					const keys = {};
					const frameNumberNoOverwrite = [];
					
					const addKeyedFrame = (key) => {
						const { time } = key;
						const frameNumber = Math.floor(time * fps);
						
						if(frameNumberNoOverwrite.includes(frameNumber))
							return;
						
						if(selectedKeys.includes(key))
							frameNumberNoOverwrite.push(frameNumber);
						
						keys[frameNumber] = drawKey(key, frameNumber, true);
					}
					
					objectTrack.position.smartTrack.forEach(key => addKeyedFrame(key));
					objectTrack.quaternion.smartTrack.forEach(key => addKeyedFrame(key));
					objectTrack.scale.smartTrack.forEach(key => addKeyedFrame(key));
					
					for(let i = 0; i < keysCount; i++) {
						if(keys[i]) {
							drawKeys.push(keys[i]);
							continue;
						}
						drawKeys.push(drawKey(null, i, false))
					}
					
					rows.push(
						<div 
							key={rows.length}
							className='track'
							style={{width: timingBarWidth}}
						>
							{drawKeys}
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
		<div 
			ref={animationEditorRef}
			className='animation-editor no-select'
			onMouseDown={updateScrub}
			onMouseUp={() => setScrubbing(false)}
			onMouseMove={updateMouseMove}
			onWheel={updateZoom}
			onKeyDown={updateKeyDown}
		>
			{drawAnimationEditor()}
		</div>
	)
}