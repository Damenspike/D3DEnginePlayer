import * as THREE from 'three';

export default class AudioListenerManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.__threeAudioListener = null;
		this.__fxOutputGain = null;
		this.__setup = false;
	}

	get masterVolume() {
		return this.component.properties.masterVolume;
	}
	set masterVolume(v) {
		this.component.properties.masterVolume = Number(v) || 0;

		if(this.__threeAudioListener)
			this.__threeAudioListener.setMasterVolume(this.component.properties.masterVolume);
	}

	setupComponent() {
		if(this.__setup)
			return;
			
		if(_host.audioListener) {
			console.warn('There is already an audio source in the game. This one will be ignored.');
			return;
		}
		
		const object3d = this.d3dobject.object3d;
		
		this.__threeAudioListener = new THREE.AudioListener();
		this.__threeAudioListener.setMasterVolume(this.masterVolume);
		
		const audioListener = this.__threeAudioListener;
		const audioContext = audioListener.context;
		
		this.__fxOutputGain = audioContext.createGain();
		this.__fxOutputGain.gain.value = 1;
		
		audioListener.__d3dFxOutput = this.__fxOutputGain;
		
		try { audioListener.gain.disconnect(); } catch {}
		try { this.__fxOutputGain.disconnect(); } catch {}
		
		try { audioListener.gain.connect(this.__fxOutputGain); } catch {}
		try { this.__fxOutputGain.connect(audioContext.destination); } catch {}
		
		if(object3d) {
			object3d.add(audioListener);
		}else{
			console.warn('Audio listener must be put on an object with a valid object3d');
		}
		
		_host.audioListener = audioListener;
		this.__setup = true;
	}

	updateComponent() {}

	dispose() {
		if(!this.__setup)
			return;
	
		if(this.component.enabled)
			return;
	
		const audioListener = this.__threeAudioListener;
		const object3d = this.d3dobject.object3d;
	
		if(audioListener?.__d3dAudioFilterOwner) {
			try { audioListener.__d3dAudioFilterOwner._releaseListener(); } catch {}
		}
	
		if(audioListener && this.__fxOutputGain) {
			const audioContext = audioListener.context;
	
			try { audioListener.gain.disconnect(); } catch {}
			try { this.__fxOutputGain.disconnect(); } catch {}
	
			try { audioListener.gain.connect(audioContext.destination); } catch {}
	
			delete audioListener.__d3dFxOutput;
		}
	
		if(object3d && audioListener)
			object3d.remove(audioListener);
	
		if(_host.audioListener === audioListener)
			_host.audioListener = null;
	
		this.__fxOutputGain = null;
		this.__threeAudioListener = null;
		this.__setup = false;
	}
}