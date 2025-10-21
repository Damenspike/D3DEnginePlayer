import React, { useState, useEffect, useRef } from 'react';
import {
	MdPlayArrow,
	MdPause,
	MdFastForward,
	MdFastRewind,
	MdFiberManualRecord
} from 'react-icons/md';
import { v4 as uuidv4 } from 'uuid';

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
var onFinishDraggingKeys;
var clipboard;

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
	const [clipDuration, setClipDuration] = useState(0);
	const [fpsTemp, setFpsTemp] = useState(_editor.animationDefaultFps);
	const [resolution, setResolution] = useState(0.5);
	const [selectedTracks, setSelectedTracks] = useState([]);
	const [selectedKeys, setSelectedKeys] = useState([]);
	const [currentTime, setCurrentTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [scrubbing, setScrubbing] = useState(false);
	const [startKeyframePos, setStartKeyframePos] = useState({x: 0, y: 0});
	const [startKeyframePos_, setStartKeyframePos_] = useState({x: 0, y: 0});
	const [draggingKey, setDraggingKey] = useState(false);
	const [recording, setRecording] = useState(false);
	/* AI BOX SELECT */
	const [isBoxSelecting, setIsBoxSelecting] = useState(false);
	const [boxStart, setBoxStart] = useState({ x: 0, y: 0 });   // client coords
	const [boxNow, setBoxNow] = useState({ x: 0, y: 0 });       // client coords
	const [boxPrimed, setBoxPrimed] = useState(false);
	/* AI BOX SELECT */
	
	const frameWidth = 10 * (resolution + 0.5);
	const duration = activeClip?.duration ?? 0;
	const totalFrames = Math.round(duration * fps);
	const timingBarWidth = totalFrames * frameWidth;
	const trackWidth = (totalFrames+1) * frameWidth;
	
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
			
			let objectName = d3dobject.name;
			const frameNumber = Math.floor((currentTime * duration) * fps);
			const t = currentTime * activeClip.duration;
			
			if(d3dobject == selectedObject)
				objectName = '__self__';
			
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
			
			console.log(originTransform);
			
			const key_Pos = objectTrack.position.smartTrack.find(
				k => Math.floor(k.time * fps) == frameNumber
			);
			const key_Rot = objectTrack.quaternion.smartTrack.find(
				k => Math.floor(k.time * fps) == frameNumber
			);
			const key_Scl = objectTrack.scale.smartTrack.find(
				k => Math.floor(k.time * fps) == frameNumber
			);
			
			// Ensure start frame presence
			if(frameNumber > 0) {
				const startKey_Pos = objectTrack.position.smartTrack.find(
					k => Math.floor(k.time * fps) == 0
				);
				const startKey_Rot = objectTrack.quaternion.smartTrack.find(
					k => Math.floor(k.time * fps) == 0
				);
				const startKey_Scl = objectTrack.scale.smartTrack.find(
					k => Math.floor(k.time * fps) == 0
				);
				
				if(!startKey_Pos && changed.includes('pos')) {
					objectTrack.position.smartTrack.push({
						time: 0,
						objectName,
						objectTrack,
						keyNumber: objectTrack.position.smartTrack.length,
						smartTrack: objectTrack.position.smartTrack,
						transformType: 'position',
						value: {
							x: originTransform.position.x,
							y: originTransform.position.y,
							z: originTransform.position.z
						}
					})
				}
				if(!startKey_Rot && changed.includes('rot')) {
					objectTrack.quaternion.smartTrack.push({
						time: 0,
						objectName,
						objectTrack,
						keyNumber: objectTrack.quaternion.smartTrack.length,
						smartTrack: objectTrack.quaternion.smartTrack,
						transformType: 'quaternion',
						value: {
							x: originTransform.quaternion.x,
							y: originTransform.quaternion.y,
							z: originTransform.quaternion.z,
							w: originTransform.quaternion.w
						}
					})
				}
				if(!startKey_Scl && changed.includes('scl')) {
					objectTrack.scale.smartTrack.push({
						time: 0,
						objectName,
						objectTrack,
						keyNumber: objectTrack.scale.smartTrack.length,
						smartTrack: objectTrack.scale.smartTrack,
						transformType: 'scale',
						value: {
							x: originTransform.scale.x,
							y: originTransform.scale.y,
							z: originTransform.scale.z
						}
					})
				}
			}
			
			if(!key_Pos && changed.includes('pos')) {
				// Create new keyframe
				objectTrack.position.smartTrack.push({
					time: t,
					objectName,
					objectTrack,
					keyNumber: objectTrack.position.smartTrack.length,
					smartTrack: objectTrack.position.smartTrack,
					transformType: 'position',
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
					smartTrack: objectTrack.quaternion.smartTrack,
					transformType: 'quaternion',
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
					smartTrack: objectTrack.scale.smartTrack,
					transformType: 'scale',
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
			selectedObject._animation.rebuildClipTracks(activeClip.uuid);
			
			setStartKeyframePos_({...startKeyframePos_}); // hack
		}
		const onSelectAll = () => {
			if(keyTracksRef.current.contains(document.activeElement))
				selectAllKeyframes();
			
			if(tracksRef.current.contains(document.activeElement))
				selectAllTracks();
		}
		const onCopy = () => {
			if(!animationEditorInFocus()) 
				return;
			
			clipboard = [...selectedKeys];
		}
		const onCut = () => {
			if(!animationEditorInFocus()) 
				return;
			
			onCopy();
			_events.invoke('delete-action');
		}
		const onPaste = () => {
			if(!animationEditorInFocus()) 
				return;
			
			let st;
			
			const cb = [...clipboard];
			const newKeys = [];
			
			// Paste the keys at playhead
			cb.forEach(key => {
				if(st === undefined)
					st = key.time;
					
				const timeDiff = key.time - st;
				const frameNumber = Math.floor(key.time * fps);
				const objectTrack = key.objectTrack;
				const key_Pos = objectTrack.position.smartTrack.find(
					k => Math.floor(k.time * fps) == frameNumber
				);
				const key_Rot = objectTrack.quaternion.smartTrack.find(
					k => Math.floor(k.time * fps) == frameNumber
				);
				const key_Scl = objectTrack.scale.smartTrack.find(
					k => Math.floor(k.time * fps) == frameNumber
				);
				
				const newTime = (currentTime * duration) + timeDiff;
				
				if(key_Pos) {
					const newKey = {...key_Pos, time: newTime, keyNumber: key.objectTrack.position.smartTrack.length};
					
					key.objectTrack.position.smartTrack.push(newKey);
					newKeys.push(newKey);
				}
				if(key_Rot) {
					const newKey = {...key_Rot, time: newTime, keyNumber: key.objectTrack.quaternion.smartTrack.length};
					
					key.objectTrack.quaternion.smartTrack.push(newKey);
					newKeys.push(newKey);
				}
				if(key_Scl) {
					const newKey = {...key_Scl, time: newTime, keyNumber: key.objectTrack.scale.smartTrack.length};
					
					key.objectTrack.scale.smartTrack.push(newKey);
					newKeys.push(newKey);
				}
					
				if(!key_Pos && !key_Rot && !key_Scl) {
					const newKey = {...key, time: newTime, keyNumber: key.smartTrack.length};
					
					key.smartTrack.push(newKey);
					newKeys.push(newKey);
				}
				
				// Rebuild the actual native three animation clip tracks based on our own spec
				selectedObject._animation.rebuildClipTracks(activeClip.uuid);
				setStartKeyframePos_({...startKeyframePos_}); // hack
			});
			
			_editor.addStep({
				name: 'Paste key(s)',
				undo: () => {
					newKeys.forEach(
						k => deleteKey(k)
					);
					
					selectedObject._animation.rebuildClipTracks(activeClip.uuid);
					setStartKeyframePos_({...startKeyframePos_}); // hack
				},
				redo: () => {
					newKeys.forEach(k => {
						k.smartTrack.push(k);
					});
					
					selectedObject._animation.rebuildClipTracks(activeClip.uuid);
					setStartKeyframePos_({...startKeyframePos_}); // hack
				}
			})
		}
		
		_events.on('transform-changed', onTransformChanged);
		_events.on('select-all', onSelectAll);
		_events.on('copy', onCopy);
		_events.on('cut', onCut);
		_events.on('paste', onPaste);
		
		return () => {
			_events.un('transform-changed', onTransformChanged);
			_events.un('select-all', onSelectAll);
			_events.un('copy', onCopy);
			_events.un('cut', onCut);
			_events.un('paste', onPaste);
		}
		
	}, [selectedObject, selectedKeys, activeClip, recording, currentTime, keyTracksRef, tracksRef, animationEditorRef]);
	
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
		setFpsTemp(fps);
	}, [fps]);
	
	useEffect(() => {
		if(!selectedObject || !activeClip)
			return;
		
		const clipState = selectedObject._animation.getClipState(activeClip.uuid);
		
		if(!clipState)
			return;
		
		clipState.updateTransforms(currentTime * activeClip.duration);
		clipState.setNormalTime(currentTime);
	}, [currentTime]);
	
	useEffect(() => {
		console.log(activeClip);
		
		// Set duration state for visuals
		setClipDuration(activeClip?.duration ?? 0);
		
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
				
				const clipState = selectedObject._animation.getClipState(activeClip.uuid);
				
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
						selectedObject._animation.rebuildClipTracks(activeClip.uuid);
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
						selectedObject._animation.rebuildClipTracks(activeClip.uuid);
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
	
	useEffect(() => {
		const el = keyTracksRef.current;
		if (!el) 
			return;
		
		el.addEventListener('wheel', updateZoom, { passive: false });
		return () => el.removeEventListener('wheel', updateZoom);
	}, [keyTracksRef.current]);
	
	/* AI BOX SELECT */
	// clientX -> frame index (0..totalFrames)
	const clientToFrame = (clientX) => {
		if (!keyTracksRef.current) return 0;
		const rect = keyTracksRef.current.getBoundingClientRect();
		const x = (clientX - rect.left) + keyTracksRef.current.scrollLeft;
		return Math.max(0, Math.min(Math.round(x / frameWidth), Math.round(duration * fps)));
	};
	
	// vertical overlap check
	const rectsOverlapY = (aTop, aBot, bTop, bBot) => !(aBot <= bTop || aTop >= bBot);
	/* AI BOX SELECT */
	
	const animationEditorInFocus = () => {
		return animationEditorRef.current.contains(document.activeElement);
	}
	
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
	const selectKey = (e, key) => {
		_events.invoke('deselect-assets');
	
		// collect all keys at this frame for the same objectTrack
		const frame = Math.floor(key.time * fps);
		const objectTrack = key.objectTrack;
	
		const group = [];
		objectTrack.position.smartTrack.forEach(k => {
			if (Math.floor(k.time * fps) === frame) group.push(k);
		});
		objectTrack.quaternion.smartTrack.forEach(k => {
			if (Math.floor(k.time * fps) === frame) group.push(k);
		});
		objectTrack.scale.smartTrack.forEach(k => {
			if (Math.floor(k.time * fps) === frame) group.push(k);
		});
	
		const add = e.shiftKey;
		const sub = e.ctrlKey || e.metaKey;
	
		if (sub) {
			// subtract: remove all from group
			setSelectedKeys(selectedKeys.filter(k => !group.includes(k)));
			setSelectedTracks([]);
			return;
		}
	
		if (add) {
			// add: merge in group
			const merged = [...selectedKeys];
			for (const g of group) if (!merged.includes(g)) merged.push(g);
			setSelectedKeys(merged);
			setSelectedTracks([]);
			return;
		}
	
		// replace: set only this group
		setSelectedKeys(group);
		setSelectedTracks([]);
	};
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
			selectedObject._animation.pause(activeClip.uuid);
			setPlaying(false);
		}else{
			selectedObject._animation.play(activeClip.uuid, {
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
		
		const moveActions = [];
		
		selectedKeys.forEach(key => {
			const objectTrack = key.objectTrack;
			const oldTime = key.startDragTime;
			const oldFrameNumber = key.startFrameNumber;
			let newTime = oldTime + timeDelta;
			
			if(newTime < 0)
				newTime = 0;
			
			if(newTime > duration)
				newTime = duration;
				
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
			
			const doMove = () => {
				if(key_Pos)
					key_Pos.time = newTime;
				
				if(key_Rot)
					key_Rot.time = newTime;
				
				if(key_Scl)
					key_Scl.time = newTime;
				
				key.time = newTime;
			}
			
			doMove();
			
			moveActions.push({
				undo: () => {
					if(key_Pos)
						key_Pos.time = oldTime;
					
					if(key_Rot)
						key_Rot.time = oldTime;
					
					if(key_Scl)
						key_Scl.time = oldTime;
						
					key.time = oldTime;
				},
				redo: () => doMove()
			})
		});
		
		onFinishDraggingKeys = () => {
			_editor.addStep({
				name: 'Move keyframe(s)',
				undo: () => {
					moveActions.forEach(a => a.undo())
					
					selectedObject._animation.rebuildClipTracks(activeClip.uuid);
					setStartKeyframePos_({x: e.pageX, y: e.pageY}); // hack
				},
				redo: () => {
					moveActions.forEach(a => a.redo())
					
					selectedObject._animation.rebuildClipTracks(activeClip.uuid);
					setStartKeyframePos_({x: e.pageX, y: e.pageY}); // hack
				}
			})
			onFinishDraggingKeys = null;
		}
		
		// Rebuild the actual native three animation clip tracks based on our own spec
		selectedObject._animation.rebuildClipTracks(activeClip.uuid);
		
		setStartKeyframePos_({x: e.pageX, y: e.pageY}); // hack
	}
	const updateScrub = (e, override = false) => {
		if(!scrubbing && !override) return;
		if((e.buttons & 1) !== 1 && !override) {
			setScrubbing(false);
			return;
		}
	
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
		e.preventDefault();
		
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
			selectedObject._animation.rebuildClipTracks(activeClip.uuid);
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
		const clipState = selectedObject._animation.getClipState(activeClip.uuid);
		
		if(clipState) {
			const d3dtarget = clipState.findAnimationTarget(track);
			d3dtarget.resetAnimationTransform();
		}
		
		const doDelete = () => {
			delete activeClip.objectTracks[track];
			
			// Rebuild the actual native three animation clip tracks based on our own spec
			selectedObject._animation.rebuildClipTracks(activeClip.uuid);
		}
		
		doDelete();
		
		return {
			deletedTrack: objectTrack,
			track, doDelete
		}
	}
	const boxDragUp = (e) => {
		const wasSelecting = isBoxSelecting;
		setBoxPrimed(false);
		setIsBoxSelecting(false);
		
		if (!wasSelecting) return;  // simple click: let key cell handlers do their thing
		
		// compute horizontal frame range (inclusive)
		const fA = clientToFrame(boxStart.x);
		const fB = clientToFrame(e.clientX);
		const fMin = Math.min(fA, fB);
		const fMax = Math.max(fA, fB);
		
		// compute vertical rect in client space
		const yMin = Math.min(boxStart.y, e.clientY);
		const yMax = Math.max(boxStart.y, e.clientY);
		
		// which track rows are overlapped
		const overlapped = new Set();
		if (keyTracksRef.current) {
			const trackEls = keyTracksRef.current.querySelectorAll(':scope > .track');
			const names = Object.keys(activeClip.objectTracks);
			for (let i = 0; i < trackEls.length && i < names.length; i++) {
				const r = trackEls[i].getBoundingClientRect();
				if (!(yMax <= r.top || yMin >= r.bottom)) overlapped.add(names[i]);
			}
		}
		
		// gather keys in range
		const newlySelected = [];
		for (const name in activeClip.objectTracks) {
			if (!overlapped.has(name)) continue;
			const ot = activeClip.objectTracks[name];
			const pushIfIn = (key) => {
				const frame = Math.floor(key.time * fps);
				if (frame >= fMin && frame <= fMax) newlySelected.push(key);
			};
			ot.position.smartTrack.forEach(pushIfIn);
			ot.quaternion.smartTrack.forEach(pushIfIn);
			ot.scale.smartTrack.forEach(pushIfIn);
		}
		
		// commit selection
		if (e.shiftKey) {
			// add keys
			const merged = [...selectedKeys];
			for (const k of newlySelected) {
				if (!merged.includes(k)) merged.push(k);
			}
			setSelectedKeys(merged);
		} else if (e.ctrlKey || e.metaKey) {
			// remove keys
			const reduced = selectedKeys.filter(k => !newlySelected.includes(k));
			setSelectedKeys(reduced);
		} else {
			// replace
			setSelectedKeys(newlySelected);
		}
	}
	
	const drawAnimationEditor = () => {
		if(!selectedObject) {
			return (
				<p>No object selected</p>
			)
		}
		if(selectedObject == _root) {
			return (
				<div className='noanim-placeholder'>
					<p>
						Select an object to animate
					</p>
				</div>
			)
		}
		if(!animManager) {
			return (
				<div className='noanim-placeholder'>
					<p>
						{selectedObject.name} is not animated
					</p>
					<button onClick={() => {
						D3D.invoke('add-component', 'Animation');
						_editor.probeSelection();
					}}>
						Animate
					</button>
				</div>
			)
		}
		
		const drawOptions = () => {
			const recordingButtonClasses = ['play-button', 'record-button'];
			
			if(recording)
				recordingButtonClasses.push('record-button--active');
			
			const drawSelect = () => {
				const rows = [];
				
				animManager.getClipUUIDs().forEach(uuid => {
					const path = _root.resolvePath(uuid);
					const name = fileNameNoExt(path);
					if(!name || !path)
						return;
					
					rows.push(
						<option 
							key={rows.length}
							value={uuid}
						>
							{name}
						</option>
					)
				});
				
				return (
					<>
						<option 
							key={rows.length}
							value={''}
							disabled
						>
							Choose a clip
						</option>
						{rows}
						<option disabled>––––––––</option>
						<option key="new" value="__new__">
							Add new...
						</option>
					</>
				);
			}
			
			const drawPlayButtons = () => (
				<>
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
							value={fpsTemp}
							onChange={e => {
								let v = Number(e.target.value);
								setFpsTemp(v);
							}}
							onBlur={e => {
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
							value={clipDuration}
							onChange={e => {
								let v = Number(e.target.value);
								setClipDuration(v);
							}}
							onBlur={e => {
								let v = Number(e.target.value);
								if(isNaN(v)) return;
								if(!v) v = 0.1;
								
								activeClip.duration = v;
								setClipDuration(v); // only for state changes
								setStartKeyframePos_({...startKeyframePos});
							}}
							onKeyDown={autoBlur}
							placeholder='Secs'
						/>
					</div>
				</>
			)
			
			return (
				<div className='clip-select'>
					{activeClip && animManager && drawPlayButtons()}
					<div className='ib'>
						<select
							className="tf"
							value={activeClip?.uuid ?? ''}
							onChange={async (e) => {
								let uuid = e.target.value;
								
								if(e.target.value == '__new__') {
									const clip = {
										blendMode: 2500,
										duration: 1,
										name: 'New Clip',
										tracks: [],
										uuid: uuidv4()
									};
									const path = _editor.addNewFile({
										name: `${clip.name}.anim`,
										data: JSON.stringify(clip)
									});
									uuid = _root.resolveAssetId(path);
									await animManager.addClipFromUUID(uuid);
								}
								
								let clip = animManager.getClip(uuid);
								
								if(!clip) {
									animManager.__loadClip(uuid)
									.then(() => {
										clip = animManager.getClip(uuid);
										
										if(!clip) {
											console.error('Unknown clip', uuid);
											return;
										}
										
										setActiveClip(clip);
									});
									return;
								}
								
								setActiveClip(clip);
							}}
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
				const duration = activeClip.duration;
				
				// integer frames & exact bar width
				const totalF = Math.max(0, Math.round(duration * fps));
				const barW   = totalF * frameWidth;
				
				// choose step based on zoom (keep labels readable)
				const MIN_LABEL_PX = 80;
				const minFrames = Math.max(1, Math.ceil(MIN_LABEL_PX / frameWidth));
				const niceSecs = [1/120, 1/60, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
				const candFrames = Array.from(
					new Set(niceSecs.map(s => Math.max(1, Math.round(s * fps))))
				).sort((a, b) => a - b);
				const stepF = candFrames.find(f => f >= minFrames) || minFrames;
				
				// --- pick decimals safely ---
				const pickDecimals = (stepF, fps) => {
					const s = stepF / fps;
					if (s >= 1)    return 0;
					if (s >= 0.5)  return 1;
					if (s >= 0.25) return 2;
					if (s >= 0.1)  return 2;
					if (s >= 1/60) return 3;
					return 3;
				};
				const labelDecimals = pickDecimals(stepF, fps);
				
				// --- formatting helper ---
				const truncFmt = (secs, d) => {
					const m = 10 ** d;
					let s = (Math.floor(secs * m + 1e-8) / m).toFixed(d);
					return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
				};
				
				const px = f => Math.round(f * frameWidth);
				
				// --- boundary ticks & labels ---
				const ticks = [];
				for (let f = 0; f <= totalF; f += stepF) ticks.push(f);
				if (ticks[ticks.length - 1] !== totalF) ticks.push(totalF); // ensure end
				
				const overlay = (
					<div
						key="overlay"
						style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
					>
						{ticks.map((f, i) => {
							const isEnd = (f === totalF);
							const secs  = isEnd ? duration : (f / fps);
							const label = truncFmt(secs, isEnd ? Math.max(labelDecimals, 2) : labelDecimals) + 's';
							const left  = px(f);
				
							return (
								<div
									key={`tick-${f}-${i}`}
									className="time-marker"
									style={{
										position: 'absolute',
										left: `${left}px`,
										top: 7
									}}
									title={label}
								>
									{label}
								</div>
							);
						})}
					</div>
				);
				
				return (
					<div 
						ref={timingBarRef}
						className="timing-bar"
						style={{ width: barW }}
						onMouseDown={e => { 
							updateScrub(e, true); 
							setScrubbing(true); 
							e.stopPropagation();
						}}
						onMouseUp={e => {
							setScrubbing(false);
						}}
					>
						{rows}
						{overlay}
					</div>
				);
			};
			const drawTracks = () => {
				const rows = [];
				
				for(let objectName in objectTracks) {
					const objectTrack = objectTracks[objectName];
					const classes = ['track'];
					
					let objectLabel = objectName;
					
					if(recording)
						classes.push('track--recording')
					
					if(selectedTracks.includes(objectName))
						classes.push('track--selected')
						
					if(objectLabel == '__self__')
						objectLabel = `(${selectedObject.name})`;
					
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
							{objectLabel}
						</div>
					)
				};
				
				return (
					<div 
						ref={tracksRef} 
						tabIndex={0}
						className='tracks'
						onClick={e => {
							if(!e.shiftKey && !e.ctrlKey && !e.metaKey) {
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
								if (keyed) // dont let the keytracks start draw a box
									e.stopPropagation();
								
								setStartKeyframePos({x: e.pageX, y: e.pageY});
								
								if(!keyed)
									return;
								
								[key, ...selectedKeys].forEach(k => {
									k.startDragTime = k.time;
									k.startFrameNumber = k.frameNumber;
								})
								
								setDraggingKey(true);
							}}
							onMouseUp={e => {
								setDraggingKey(false);
								const dx = Math.abs(startKeyframePos.x - e.pageX);
								
								if(keyed && dx < 5) {
									// select key if no dragging happened
									selectKey(e, key); 
									
									e.stopPropagation();
								}else
								if(dx > 5) {
									e.stopPropagation();
								}
								
								onFinishDraggingKeys?.();
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
					
					for(let i = 0; i <= totalFrames; i++) {
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
							style={{width: trackWidth}}
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
						onMouseDown={e => {
							if (e.button !== 0) return;
							e.stopPropagation(); // prevent outer editor clearing selection on mouseup later
							setBoxPrimed(true);
							setIsBoxSelecting(false);
							setBoxStart({ x: e.clientX, y: e.clientY });
							setBoxNow({ x: e.clientX, y: e.clientY });
					
							// replace selection unless Shift is held
							if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
								setSelectedKeys([]);
								setSelectedTracks([]);
							}
						}}
						onMouseMove={e => {
							// if we haven't started, check threshold
							if (boxPrimed && !isBoxSelecting) {
								const dx = Math.abs(e.clientX - boxStart.x);
								const dy = Math.abs(e.clientY - boxStart.y);
								if (dx > 3 || dy > 3) setIsBoxSelecting(true);
							}
							if (!isBoxSelecting) return;
							setBoxNow({ x: e.clientX, y: e.clientY });
						}}
						style={{ position: 'relative' }}  // ensure overlay positions correctly
					>
						{drawTimingBar()}
						{drawPlayHead()}
					
						{/* your existing rows */}
						{rows}
					
						{/* selection rectangle overlay */}
						{isBoxSelecting && (() => {
							// compute overlay rect in keyTracks local space
							const host = keyTracksRef.current?.getBoundingClientRect();
							if (!host) return null;
					
							const x0 = Math.min(boxStart.x, boxNow.x) - host.left + keyTracksRef.current.scrollLeft;
							const x1 = Math.max(boxStart.x, boxNow.x) - host.left + keyTracksRef.current.scrollLeft;
							const y0 = Math.min(boxStart.y, boxNow.y) - host.top  + keyTracksRef.current.scrollTop;
							const y1 = Math.max(boxStart.y, boxNow.y) - host.top  + keyTracksRef.current.scrollTop;
					
							return (
								<div
									className="selection-rect"
									style={{
										position: 'absolute',
										left: `${x0}px`,
										top: `${y0}px`,
										width: `${Math.max(1, x1 - x0)}px`,
										height: `${Math.max(1, y1 - y0)}px`,
										background: 'rgba(0,153,255,0.15)',
										border: '1px dashed rgba(0,153,255,0.7)',
										pointerEvents: 'none'
									}}
								/>
							);
						})()}
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
			onMouseUp={e => {
				if(!e.shiftKey && !e.ctrlKey && !e.metaKey) {
					setSelectedKeys([]);
					setSelectedTracks([]);
				}
				boxDragUp(e);
			}}
			onMouseMove={updateMouseMove}
			onKeyDown={updateKeyDown}
		>
			{drawAnimationEditor()}
		</div>
	)
}