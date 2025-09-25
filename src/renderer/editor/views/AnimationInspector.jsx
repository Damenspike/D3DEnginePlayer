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

var originTransforms = {};

export default function AnimationInspector() {
	const defObject = _editor.selectedObjects[0] ?? _editor.focus.rootParent;
	
	const animationEditorRef = useRef();
	const timingBarRef = useRef();
	const keyTracksRef = useRef();
	const tracksRef = useRef();
	
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
	const [recording, setRecording] = useState(false);
	
	const frameWidth = 10 * (resolution + 0.5);
	const duration = activeClip?.duration ?? 0;
	const totalFrames = Math.round(duration * fps);
	const timingBarWidth = totalFrames * frameWidth;
	
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
		
		const onTransformChanged = (d3dobject, changed, originTransform) => {
			if(!recording || (!selectedObject.containsChild(d3dobject) && d3dobject != selectedObject))
				return;
			
			const objectName = d3dobject.name;
			const frameNumber = Math.floor((currentTime * duration) * fps);
			const t = currentTime * activeClip.duration;
			
			// Store origin transform
			if(!originTransforms[objectName]) {
				originTransforms[objectName] = d3dobject;
				if(!d3dobject.__preAnimationTransform)
					d3dobject.__preAnimationTransform = originTransform;
			}
			
			let objectTrack = activeClip.objectTracks[objectName];
			
			if(!objectTrack) {
				objectTrack = {
					position: {smartTrack: [], track: []},
					quaternion: {smartTrack: [], track: []},
					scale: {smartTrack: [], track: []}
				}
				
				activeClip.objectTracks[objectName] = objectTrack;
			}
			
			const key_Pos = objectTrack.position.smartTrack.find(
				k => Math.floor(k.time * fps) == frameNumber
			);
			const key_Rot = objectTrack.quaternion.smartTrack.find(
				k => Math.floor(k.time * fps) == frameNumber
			);
			const key_Scl = objectTrack.scale.smartTrack.find(
				k => Math.floor(k.time * fps) == frameNumber
			);
			
			if(!key_Pos && changed.includes('pos')) {
				// Create new keyframe
				objectTrack.position.smartTrack.push({
					time: t,
					objectName,
					objectTrack,
					keyNumber: objectTrack.position.smartTrack.length,
					value: {
						x: d3dobject.position.x,
						y: d3dobject.position.y,
						z: d3dobject.position.z
					}
				})
			}else
			if(key_Pos && changed.includes('pos')) {
				key_Pos.value = {
					x: d3dobject.position.x,
					y: d3dobject.position.y,
					z: d3dobject.position.z
				}
			}
			
			if(!key_Rot && changed.includes('rot')) {
				// Create new keyframe
				objectTrack.quaternion.smartTrack.push({
					time: t,
					objectName,
					objectTrack,
					keyNumber: objectTrack.quaternion.smartTrack.length,
					value: {
						x: d3dobject.quaternion.x,
						y: d3dobject.quaternion.y,
						z: d3dobject.quaternion.z,
						w: d3dobject.quaternion.w
					}
				})
			}else
			if(key_Rot && changed.includes('rot')) {
				key_Rot.value = {
					x: d3dobject.quaternion.x,
					y: d3dobject.quaternion.y,
					z: d3dobject.quaternion.z,
					w: d3dobject.quaternion.w
				}
			}
			
			if(!key_Scl && changed.includes('scl')) {
				// Create new keyframe
				objectTrack.scale.smartTrack.push({
					time: t,
					objectName,
					objectTrack,
					keyNumber: objectTrack.scale.smartTrack.length,
					value: {
						x: d3dobject.scale.x,
						y: d3dobject.scale.y,
						z: d3dobject.scale.z
					}
				})
			}else
			if(key_Scl && changed.includes('scl')) {
				key_Scl.value = {
					x: d3dobject.scale.x,
					y: d3dobject.scale.y,
					z: d3dobject.scale.z
				}
			}
			
			// Rebuild the actual native three animation clip tracks based on our own spec
			selectedObject.animation.rebuildClipTracks(activeClip.name);
			
			setStartKeyframePos_({...startKeyframePos_}); // hack
		}
		const onSelectAll = () => {
			if(keyTracksRef.current.contains(document.activeElement))
				selectAllKeyframes();
			
			if(tracksRef.current.contains(document.activeElement))
				selectAllTracks();
		}
		
		_events.on('transform-changed', onTransformChanged);
		_events.on('select-all', onSelectAll);
		
		return () => {
			_events.un('transform-changed', onTransformChanged);
			_events.un('select-all', onSelectAll);
		}
		
	}, [selectedObject, activeClip, recording, currentTime, keyTracksRef, tracksRef]);
	
	useEffect(() => {
		
		if(!recording) {
			for(let i in originTransforms) {
				const d3dobject = originTransforms[i];
				
				// Restore original transforms
				d3dobject.resetAnimationTransform();
			}
			originTransforms = {};
		}
		
	}, [recording]);
	
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
		clipState.setNormalTime(currentTime);
	}, [currentTime]);
	
	useEffect(() => {
		console.log(activeClip);
		
		// Undo scrub effects
		const handleClickOutside = (e) => {
			if (
				animationEditorRef.current && 
				!animationEditorRef.current.contains(e.target) && 
				!recording
			) {
				console.log('Clicked outside of animation editor, resetting transforms...');
				
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
	}, [activeClip, recording]);
	
	useEffect(() => {
		const onDelete = () => {
			if(selectedKeys.length > 0) {
				const deleteResults = [];
				selectedKeys.forEach(key => {
					deleteResults.push(deleteKey(key));
				});
				
				_editor.addStep({
					name: 'Delete key(s)',
					undo: () => {
						deleteResults.forEach(({ 
							objectTrack,
							keyE_Pos,
							keyE_Rot,
							keyE_Scl 
						}) => {
							keyE_Pos && objectTrack.position.smartTrack.push(keyE_Pos);
							keyE_Rot && objectTrack.quaternion.smartTrack.push(keyE_Rot);
							keyE_Scl && objectTrack.scale.smartTrack.push(keyE_Scl);
						});
						// Rebuild the actual native three animation clip tracks based on our own spec
						selectedObject.animation.rebuildClipTracks(activeClip.name);
						setSelectedKeys([...selectedKeys]);
					},
					redo: () => {
						deleteResults.forEach(({doDelete}) => doDelete());
						setSelectedKeys([...selectedKeys]);
					}
				});
			}
			if(selectedTracks.length > 0) {
				const deleteResults = [];
				selectedTracks.forEach(track => {
					deleteResults.push(deleteTrack(track));
				});
				
				_editor.addStep({
					name: 'Delete track(s)',
					undo: () => {
						deleteResults.forEach(({track, deletedTrack}) => {
							activeClip.objectTracks[track] = deletedTrack;
						});
						// Rebuild the actual native three animation clip tracks based on our own spec
						selectedObject.animation.rebuildClipTracks(activeClip.name);
						setSelectedTracks([...selectedTracks]);
					},
					redo: () => {
						deleteResults.forEach(({doDelete}) => doDelete());
						setSelectedTracks([...selectedTracks]);
					}
				});
			}
			
			setSelectedKeys([]);
			setSelectedTracks([]);
		}
		
		_events.on('delete-action', onDelete);
		
		return () => {
			_events.un('delete-action', onDelete);
		}
	}, [selectedTracks, selectedKeys]);
	
	const selectAllTracks = () => {
		const tracks = [];
		
		for(let objectName in activeClip.objectTracks) {
			tracks.push(objectName);
		}
		
		setSelectedTracks(tracks);
	}
	const selectAllKeyframes = () => {
		const keys = [];
		
		for(let objectName in activeClip.objectTracks) {
			const objectTrack = activeClip.objectTracks[objectName];
			objectTrack.position.smartTrack.forEach(key => keys.push(key));
			objectTrack.quaternion.smartTrack.forEach(key => keys.push(key));
			objectTrack.scale.smartTrack.forEach(key => keys.push(key));
		}
		
		setSelectedKeys(keys);
	}
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
		const timeDelta = 1/fps*movePlaces;
		const frameNumberDelta = Math.floor(timeDelta * fps);
		
		selectedKeys.forEach(key => {
			const objectTrack = key.objectTrack;
			const oldTime = key.startDragTime;
			const oldFrameNumber = key.startFrameNumber;
			let newTime = oldTime + timeDelta;
			
			if(newTime < 0)
				newTime = 0;
				
			const newFrameNumber = oldFrameNumber + frameNumberDelta;
			
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
		
		let t = x / timingBarWidth;
		if (t < 0) t = 0;
		if (t > 1) t = 1;
		
		// snap in normalized space using integer frames
		const snapped = Math.round(t * totalFrames) / totalFrames;
		setCurrentTime(snapped);
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
		
		const doDelete = () => {
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
			// Rebuild the actual native three animation clip tracks based on our own spec
			selectedObject.animation.rebuildClipTracks(activeClip.name);
		}
		
		doDelete();
		
		const deletedKeys = [];
		
		if(keyE_Pos)
			deletedKeys.push(keyE_Pos);
			
		if(keyE_Rot)
			deletedKeys.push(keyE_Rot);
		
		if(keyE_Scl)
			deletedKeys.push(keyE_Scl);
		
		return {
			objectTrack,
			keyE_Pos,
			keyE_Rot,
			keyE_Scl,
			doDelete
		};
	}
	const deleteTrack = (track) => {
		const objectTrack = activeClip.objectTracks[track];
		const clipState = selectedObject.animation.getClipState(activeClip.name);
		
		if(clipState) {
			const d3dtarget = clipState.findAnimationTarget(track);
			d3dtarget.resetAnimationTransform();
		}
		
		const doDelete = () => {
			delete activeClip.objectTracks[track];
			
			// Rebuild the actual native three animation clip tracks based on our own spec
			selectedObject.animation.rebuildClipTracks(activeClip.name);
		}
		
		doDelete();
		
		return {
			deletedTrack: objectTrack,
			track, doDelete
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
			const recordingButtonClasses = ['play-button', 'record-button'];
			
			if(recording)
				recordingButtonClasses.push('record-button--active');
			
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
							className={recordingButtonClasses.join(' ')}
							onClick={() => setRecording(!recording)}
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
				const classes = ['playhead'];
				
				if(recording)
					classes.push('playhead--recording');
				
				let x = timingBarWidth * currentTime;
				return (
					<div 
						className={classes.join(' ')}
						style={{transform: `translateX(${x}px)`}}
					></div>
				)
			}
			const drawTimingBar = () => {
				const rows = [];
				const duration = activeClip.duration; // seconds
			
				// Pick step (s)
				let stepSec;
				if (resolution > 0.75) stepSec = 0.1;
				else if (resolution > 0.4) stepSec = 0.25;
				else if (resolution > 0.2) stepSec = 0.5;
				else stepSec = 1;
			
				// Work in whole frames
				const stepFrames = Math.max(1, Math.round(stepSec * fps));
				const steps = Math.floor(totalFrames / stepFrames);
			
				// Label precision from step
				const labelDecimals = Math.max(0, (String(stepSec).split('.')[1] || '').length);
			
				const px = f => Math.round(f * frameWidth); // snap frame index → px
			
				for (let k = 0; k < steps; k++) {
					const x0 = px(k * stepFrames);
					const x1 = px((k + 1) * stepFrames);
					const segW = Math.max(0, x1 - x0);
			
					const secs = (k * stepFrames) / fps;
					let label = secs.toFixed(labelDecimals)
						.replace(/(\.\d*?)0+$/, '$1')
						.replace(/\.$/, '');
			
					rows.push(
						<div
							key={`t-${k}`}
							className="time-marker"
							style={{ width: segW }}
						>
							{label}s
						</div>
					);
				}
			
				// Tail to exact end (no label)
				const remFrames = totalFrames - steps * stepFrames;
				if (remFrames > 0) {
					const x0 = px(steps * stepFrames);
					const x1 = px(totalFrames);
					rows.push(
						<div
							key="t-tail"
							className="time-marker"
							style={{ width: Math.max(0, x1 - x0) }}
						/>
					);
				}
			
				return (
					<div 
						ref={timingBarRef}
						className="timing-bar"
						style={{ width: timingBarWidth }}
						onMouseDown={e => { updateScrub(e, true); setScrubbing(true); }}
						onMouseUp={() => setScrubbing(false)}
					>
						{rows}
					</div>
				);
			};
			const drawTracks = () => {
				const rows = [];
				
				for(let objectName in objectTracks) {
					const objectTrack = objectTracks[objectName];
					const classes = ['track'];
					
					if(recording)
						classes.push('track--recording')
					
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
						ref={tracksRef} 
						tabIndex={0}
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
					
					if(key)	
						key.frameNumber = frameNumber;
					
					return (
						<div 
							key={frameNumber}
							className={classes.join(' ')} 
							style={{width: frameWidth}}
							onMouseDown={e => {
								setStartKeyframePos({x: e.pageX, y: e.pageY});
								
								if(!keyed) {
									if(!e.shiftKey)
										setSelectedKeys([]);
									return;
								}
								
								[key, ...selectedKeys].forEach(k => {
									k.startDragTime = k.time;
									k.startFrameNumber = k.frameNumber;
								})
								
								setDraggingKey(true);
							}}
							onMouseUp={e => {
								setDraggingKey(false);
								const dx = Math.abs(startKeyframePos.x - e.pageX);
								
								if(keyed && dx < 5)
									selectKey(key); // select key if no dragging happened
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
					
					for(let i = 0; i < totalFrames; i++) {
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
					<div 
						ref={keyTracksRef} 
						className='keytracks'
						tabIndex={0}
					>
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