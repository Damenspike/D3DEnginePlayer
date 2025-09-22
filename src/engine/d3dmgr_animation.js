import Tween from './d3dtween.js';

import {
	fileNameNoExt,
	approx
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
	
	this.__advanceFrame = () => {
		/////////////////////////////////////////////////
		// ACTUAL NEXT FRAME UDPATER
		// CALLED BY ON INTERNAL ENTER FRAME PER OBJECT
		/////////////////////////////////////////////////
		
		// Update timing
		for(let clipName in this.clipStates) {
			const clipState = this.clipStates[clipName];
			const clip = clipState.clip;
			
			if(!clipState.playing) {
				if(clipState.wasPlaying)
					clipState.updateListener();
					
				clipState.wasPlaying = false;
				continue;
			}
			
			clipState.wasPlaying = true;
			clipState.stopped = false;
			
			clipState.time = clipState.normalizedTime * clip.duration;
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
	this.__loadClips = () => {
		component.properties.clips.forEach(uuid => {
			const path = d3dobject.root.resolvePath(uuid);
			const baseName = fileNameNoExt(path);
			_editor.readFile(path)
			.then(json => {
				try {
					const obj = JSON.parse(json);
					this.addClip(baseName, obj);
				}catch(e) {
					console.error(path, 'is a corrupt animation clip');
				}
			})
		})
	}
	this.addClip = (name, clip) => {
		clip.objectTracks = {};
		
		clip.tracks.forEach(track => {
			const parts = track.name.split('.');
			const objectName = parts.shift();
			const transform = parts.pop();
			
			if(parts.length > 0) {
				console.error('Are we prepared for this?', parts);
				return;
			}
			
			if(
				transform != 'position' && 
				transform != 'quaternion' && 
				transform != 'scale'
			)
				return;
			
			if(!clip.objectTracks[objectName])
				clip.objectTracks[objectName] = {};
			
			clip.objectTracks[objectName][transform] = track;
		});
		
		this.clips[name] = clip;
	}
	this.getClipUUID = (clipName) => {
		return component.properties.clips.find(uuid => {
			const path = d3dobject.root.resolvePath(uuid);
			const baseName = fileNameNoExt(path);
			return baseName == clipName;
		})
	}
	this.getClipPath = (clipName) => {
		const uuid = this.getClipUUID(clipName);
		const path = d3dobject.root.resolvePath(uuid);
		return path;
	}
	this.getClipPaths = () => {
		return component.properties.clips.map(
			uuid => d3dobject.root.resolvePath(uuid)
		);
	}
	this.clipExists = (clipName) => {
		const clipPath = this.getClipPath(clipName);
		const exists = !!clipPath;
		if(!exists)
			console.warn(clipName, ' does not exist in animation clips')
		return exists;
	}
	this.getClipState = (clipName) => {
		if(!this.clipExists(clipName))
			return;
		
		if(!this.clipStates[clipName]) {
			this.clipStates[clipName] = new AnimationState({
				clip: this.clips[clipName],
				d3dobject
			});
		}
		return this.clipStates[clipName];
	}
	this.play = (clipName, options) => {
		if(!this.clipExists(clipName)) {
			console.warn(clipName, 'clip does not exist');
			return;
		}
		
		const clipState = this.getClipState(clipName);
		clipState.playing = true;
		
		// Apply each option or revert back
		clipState.speed = options?.speed ?? clipState.speed;
		clipState.wrapMode = options?.wrapMode ?? clipState.wrapMode;
		clipState.tween = options?.tween ?? clipState.tween;
		clipState.listener = options?.listener;
	}
	this.pause = (clipName) => {
		if(!this.clipExists(clipName))
			return;
		
		const clip = this.getClipState(clipName);
		clip.playing = false;
	}
	this.stop = (clipName) => {
		if(!this.clipExists(clipName))
			return;
		
		const clip = this.getClipState(clipName);
		clip.playing = false;
		clip.normalizedTime = 0;
	}
	
	this.__loadClips();
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
		if(time === undefined) time = this.normalizedTime;
		
		for(let name in this.clip.objectTracks) {
			const d3dtarget = this.d3dobject.findDeep(name)[0];
			const track = this.clip.objectTracks[name];
			
			if(!d3dtarget || !track)
				continue;
			
			const trackPos = interpolateClip(
				time,
				track.position.values,
				'vector',
				this.tween
			);
			const trackScl = interpolateClip(
				time,
				track.scale.values,
				'vector',
				this.tween
			);
			const trackRot = interpolateClip(
				time,
				track.quaternion.values,
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
}