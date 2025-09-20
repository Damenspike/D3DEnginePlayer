import {
	fileNameNoExt,
	approx
} from './d3dutility.js';

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
			
			if(!clipState.playing)
				continue;
			
			clipState.time = clipState.normalizedTime * clip.duration;
			clipState.time += _time.delta * clipState.speed;
			
			// Clip has ended
			if(clipState.time >= clip.duration) {
				if(clipState.wrapMode == WRAP_MODE_ONCE) {
					clipState.time = 0;
					clipState.playing = false;
				}
				if(clipState.wrapMode == WRAP_MODE_LOOP) {
					clipState.time = 0;
				}
				if(clipState.wrapMode == WRAP_MODE_BOUNCE) {
					clipState.speed = -clipState.speed;
				}
			}
			
			clipState.normalizedTime = clipState.time / clip.duration;
			
			// Now update the objects themselves
			clip.targets.forEach(name => {
				const d3dtarget = d3dobject.findDeep(name)[0];
				const track = clip.objectTracks[name];
				
				if(!d3dtarget || !track)
					return;
				
				/*TODO const idx_Pos = track.position.times.findIndex(
					t => approx(t, time)
				);
				const idx_Rot = track.quaternion.times.findIndex(
					t => approx(t, time)
				);
				const idx_Scl = track.scale.times.findIndex(
					t => approx(t, time)
				);
				
				d3dtarget.setAnimatedTransform()*/
			})
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
		return !exists;
	}
	this.getClipState = (clipName) => {
		if(!this.clipExists(clipName))
			return;
		
		if(!this.clipStates[clipName]) {
			this.clipStates[clipName] = {
				playing: false,
				time: 0,
				normalizedTime: 0,
				speed: 1,
				clip: this.clips[clipName],
				wrapMode: WRAP_MODE_ONCE
			}
		}
		return this.clipStates[clipName];
	}
	this.play = (clipName) => {
		if(!this.clipExists(clipName))
			return;
		
		const clip = this.getClipState(clipName);
		clip.playing = true;
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