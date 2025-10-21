import Tween from './d3dtween.js';

import {
	fileNameNoExt,
	approx,
	isUUID
} from './d3dutility.js';

import {
	interpolateClip
} from './d3dinterpolateclip.js';

export const WRAP_MODE_ONCE = 'once';
export const WRAP_MODE_LOOP = 'loop';
export const WRAP_MODE_BOUNCE = 'bounce';

export default function AnimationManager(d3dobject, component) {
	this.clipStates = {};
	this.clips = {};
	
	this.setupComponent = async () => {
		await this.__loadClips();
	}
	this.__onInternalEnterFrame = () => {
		/////////////////////////////////////////////////
		// ACTUAL NEXT FRAME UDPATER
		// CALLED BY ON INTERNAL ENTER FRAME PER OBJECT
		/////////////////////////////////////////////////
		
		// Update timing
		for(let uuid in this.clipStates) {
			const clipState = this.clipStates[uuid];
			const clip = clipState.clip;
			
			if(!clipState.playing) {
				if(clipState.wasPlaying) {
					clipState.updateListener();
					clipState.updateTransforms();
				}
					
				clipState.wasPlaying = false;
				continue;
			}
			
			clipState.wasPlaying = true;
			clipState.stopped = false;
			
			//clipState.time = clipState.normalizedTime * clip.duration;
			clipState.time += _time.delta * clipState.speed;
			
			// Clip has ended
			if(clipState.time >= clip.duration) {
				if(clipState.wrapMode == WRAP_MODE_ONCE) {
					clipState.time = 0;
					clipState.playing = false;
					clipState.resetAnimationTransforms();
				}
				if(clipState.wrapMode == WRAP_MODE_LOOP) {
					clipState.time = 0;
				}
				if(clipState.wrapMode == WRAP_MODE_BOUNCE) {
					clipState.speed = -clipState.speed;
				}
			}
			
			clipState.normalizedTime = clipState.time / clip.duration;
			
			clipState.updateListener();
			clipState.updateTransforms();
		}
	}
	this.__loadClips = async () => {
		for(let uuid of component.properties.clips) {
			await this.__loadClip(uuid);
		}
	}
	this.__loadClip = async (uuid) => {
		const path = d3dobject.root.resolvePath(uuid);
		const baseName = fileNameNoExt(path);
		
		try {
			const json = await d3dobject.root.readFile(path);
			const clipObj = JSON.parse(json);
			this.__addLoadedClip(uuid, baseName, clipObj);
		}catch(e) {
			console.error(path, 'is a corrupt animation clip');
			console.error(e);
		}
	}
	this.__addLoadedClip = (uuid, name, clip) => {
		clip.uuid = uuid;
		clip.name = name;
		clip.objectTracks = {};
		clip.tracks.forEach(track => {
			const objectName = track.name.split('.').slice(0, -1).join('.');
			const transform = track.name.split('.').pop();
			
			if(
				transform != 'position' && 
				transform != 'quaternion' && 
				transform != 'scale'
			)
				return;
			
			if(!clip.objectTracks[objectName])
				clip.objectTracks[objectName] = {};
			
			const smartTrack = [];
			const step = track.type == 'vector' ? 3 : 4;
			
			for(let i = 0; i < track.values.length; i += step) {
				const t = track.times[Math.floor(i / step)];
				const smartKey = {
					time: t,
					objectName: objectName,
					objectTrack: clip.objectTracks[objectName],
					keyNumber: smartTrack.length,
					smartTrack: smartTrack,
					transformType: transform,
					value: {
						x: track.values[i],
						y: track.values[i+1],
						z: track.values[i+2]
					}
				};
				
				if(step == 4) // quaternion
					smartKey.value.w = track.values[i + 3];
				
				smartTrack.push(smartKey);
			}
			
			clip.objectTracks[objectName][transform] = {
				smartTrack,
				track
			};
		});
		
		this.clips[uuid] = clip;
	}
	this.__getSerializableObject = (uuid) => {
		const clip = this.clips[uuid];
		
		return {
			blendMode: clip.blendMode,
			duration: clip.duration,
			name: clip.name,
			tracks: clip.tracks,
			uuid: clip.uuid
		};
	}
	this.__saveClip = (uuid) => {
		if(!window._editor)
			return;
		
		if(!this.clipExists(uuid)) {
			console.warn('Unknown clip for save', uuid);
			return;
		}
		const zip = d3dobject.root.zip;
		const path = d3dobject.root.resolvePath(uuid);
		const data = JSON.stringify(this.__getSerializableObject(uuid));
		_editor.writeFile({path, data});
	}
	this.rebuildClipTracks = (uuid) => {
		const clip = this.clips[uuid];
		
		if(!clip) {
			console.error('Unknown clip to rebuild', name);
			return;
		}
		if(!clip.objectTracks) {
			console.error('No object tracks on clip for rebuild', name);
			return;
		}
		
		const rebuiltTracks = [];
		
		for(let objectName in clip.objectTracks) {
			const objectTrack = clip.objectTracks[objectName];
			
			for(let track in objectTrack) {
				const trackName = `${objectName}.${track}`;
				const smartTrack = objectTrack[track].smartTrack;
				const rebuiltTrack = {
					name: trackName,
					type: track == 'quaternion' ? 'quaternion' : 'vector',
					times: [],
					values: []
				};
				
				smartTrack
				.sort((a, b) => a.time - b.time)
				.forEach(key => {
					rebuiltTrack.times.push(key.time);
					rebuiltTrack.values.push(...[key.value.x, key.value.y, key.value.z]);
					if(rebuiltTrack.type == 'quaternion')
						rebuiltTrack.values.push(key.value.w);
				});
				
				objectTrack[track].track = rebuiltTrack; // re-assign the track to the new one
				
				rebuiltTracks.push(rebuiltTrack);
			}
		}
		
		clip.tracks = rebuiltTracks;
		
		this.__saveClip(uuid);
	}
	this.getClip = (uuid) => {
		return this.clips[uuid];
	}
	this.resolveClipUUID = (name) => {
		for(let uuid in this.clips) {
			const path = d3dobject.root.resolvePath(uuid);
			const fileName = fileNameNoExt(path);
			
			if(name == fileName)
				return uuid;
		}
	}
	this.getClipUUIDs = () => {
		return [...component.properties.clips];
	}
	this.clipExists = (uuid) => {
		return !!this.clips[uuid];
	}
	this.getClipState = (uuid) => {
		if(!uuid || !this.clipExists(uuid))
			return;
		
		if(!this.clipStates[uuid]) {
			this.clipStates[uuid] = new AnimationState({
				clip: this.clips[uuid],
				d3dobject
			});
		}
		return this.clipStates[uuid];
	}
	this.addClipFromUUID = async (uuid) => {
		if(!uuid) {
			console.warn('Unknown animation clip asset', path);
			return;
		}
		component.properties.clips.push(uuid);
		await this.__loadClip(uuid);
	}
	
	/*
		Main access from public side
	*/
	this.play = (clipName, options) => {
		const uuid = isUUID(clipName) ? clipName : this.resolveClipUUID(clipName);
		
		if(!uuid || !this.clipExists(uuid)) {
			console.warn(clipName, uuid, 'clip does not exist');
			return;
		}
		
		const clipState = this.getClipState(uuid);
		clipState.playing = true;
		
		if(options?.interpolation && Tween[options?.interpolation])
			clipState.tween = Tween[options?.interpolation];
		
		// Apply each option or revert back
		clipState.speed = options?.speed ?? clipState.speed;
		clipState.wrapMode = options?.wrapMode ?? clipState.wrapMode;
		clipState.tween = options?.tween ?? clipState.tween;
		clipState.listener = options?.listener;
	}
	this.pause = (clipName) => {
		const uuid = isUUID(clipName) ? clipName : this.resolveClipUUID(clipName);
		
		if(!uuid || !this.clipExists(uuid))
			return;
		
		const clip = this.getClipState(uuid);
		clip.playing = false;
	}
	this.stop = (clipName) => {
		const uuid = isUUID(clipName) ? clipName : this.resolveClipUUID(clipName);
		
		if(!uuid || !this.clipExists(uuid))
			return;
		
		const clip = this.getClipState(uuid);
		clip.playing = false;
		clip.time = 0;
		clip.normalizedTime = 0;
	}
}
function AnimationState({d3dobject, clip}) {
	this.playing = false;
	this.time = 0;
	this.normalizedTime = 0;
	this.speed = 1;
	this.clip = clip;
	this.wrapMode = WRAP_MODE_ONCE;
	this.tween = Tween.Linear;
	this.listener = () => null;
	this.d3dobject = d3dobject;
	
	this.updateListener = () => this.listener?.(this);
	this.updateTransforms = (time) => {
		if(time === undefined) 
			time = this.time;
			
		for(let name in this.clip.objectTracks) {
			const d3dtarget = this.findAnimationTarget(name);
			const objectTrack = this.clip.objectTracks[name];
			
			if(!d3dtarget || !objectTrack)
				continue;
			
			const trackPos = interpolateClip(
				time,
				objectTrack.position.track.times,
				objectTrack.position.track.values,
				'vector',
				this.tween
			);
			const trackScl = interpolateClip(
				time,
				objectTrack.scale.track.times,
				objectTrack.scale.track.values,
				'vector',
				this.tween
			);
			const trackRot = interpolateClip(
				time,
				objectTrack.quaternion.track.times,
				objectTrack.quaternion.track.values,
				'quaternion',
				this.tween
			);
			
			d3dtarget.setAnimatedTransform({
				position: trackPos,
				quaternion: trackRot,
				scale: trackScl
			});
		}
	}
	this.resetAnimationTransforms = () => {
		for(let name in this.clip.objectTracks) {
			const d3dtarget = this.d3dobject.findDeep(name)[0];
			
			if(!d3dtarget)
				return;
			
			d3dtarget.resetAnimationTransform();
		}
	}
	this.setNormalTime = (t) => {
		this.time = t * this.clip.duration;
	}
	this.findAnimationTarget = (name) => {
		return (name == this.d3dobject.name || name == '__self__') ? 
			this.d3dobject : 
			this.d3dobject.findDeep(name)[0]; // TODO: Support . path finding
	}
}