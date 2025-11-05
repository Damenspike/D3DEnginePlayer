export default class AudioListenerManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
	}

	get masterVolume() {
		return this.component.properties.masterVolume;
	}
	set masterVolume(v) {
		this.component.properties.masterVolume = Number(v) || 0;
		
		this.__threeAudioListener.setMasterVolume(
			this.component.properties.masterVolume
		);
	}

	updateComponent() {
		if (!this.component.__setup) 
			this.setup();
	}
	setup() {
		if(_host.audioListener) {
			console.warn('There is already an audio source in the game. This one will be ignored.');
			return;
		}
		
		const object3d = this.d3dobject.object3d;
		
		this.__threeAudioListener = new THREE.AudioListener();
		this.__threeAudioListener.setMasterVolume(this.masterVolume);
		
		if(object3d) {
			object3d.add(this.__threeAudioListener);
		}else{
			console.warn('Audio listener must be put on an object with a valid object3d');
		}
		
		_host.audioListener = this.__threeAudioListener;
		
		this.component.__setup = true;
	}
}