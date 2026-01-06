import * as THREE from 'three';
import D3DConsole from './d3dconsole.js';

export default class AudioSourceManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.__setup = false;

		this.__threeAudio = null;
		this.__buffer = null;
		this.__loadToken = 0;

		this._audioListenerWarned = false;
	}

	get props() {
		if(!this.component.properties)
			this.component.properties = {};
		return this.component.properties;
	}

	get audio() {
		return this.props.audio || '';
	}
	set audio(v) {
		this.props.audio = v || '';
		this._reloadBuffer();
	}

	get volume() {
		return this.props.volume ?? 0.5;
	}
	set volume(v) {
		const x = Math.max(0, Math.min(1, Number(v) || 0));
		this.props.volume = x;

		if(this.__threeAudio)
			this.__threeAudio.setVolume(x);
	}

	get soundSpace() {
		return this.props.soundSpace || '3D';
	}
	set soundSpace(v) {
		this.props.soundSpace = (v === '2D') ? '2D' : '3D';
		if(this.__setup)
			this._rebuildThreeAudio();
		this._applySpatial();
	}

	get distanceModel() {
		return this.props.distanceModel || 'linear';
	}
	set distanceModel(v) {
		const ok = ['linear', 'inverse', 'exponential'];
		this.props.distanceModel = ok.includes(v) ? v : 'linear';
		this._applySpatial();
	}

	get refDistance() {
		return Number(this.props.refDistance ?? 10);
	}
	set refDistance(v) {
		this.props.refDistance = Number(v) || 0;
		this._applySpatial();
	}

	get maxDistance() {
		return Number(this.props.maxDistance ?? 100);
	}
	set maxDistance(v) {
		this.props.maxDistance = Number(v) || 0;
		this._applySpatial();
	}

	get rolloffFactor() {
		return Number(this.props.rolloffFactor ?? 1);
	}
	set rolloffFactor(v) {
		this.props.rolloffFactor = Math.max(0, Number(v) || 0);
		this._applySpatial();
	}

	get autoPlay() {
		return !!this.props.autoPlay;
	}
	set autoPlay(v) {
		this.props.autoPlay = !!v;
	}

	get loop() {
		return !!this.props.loop;
	}
	set loop(v) {
		this.props.loop = !!v;

		if(this.__threeAudio)
			this.__threeAudio.setLoop(!!v);
	}

	setupComponent() {
		if(!window._player)
			return;
		
		if(this.__setup)
			return;

		const o3d = this.d3dobject.object3d;
		if(!o3d)
			return;

		const listener = _host.audioListener;
		if(!listener) {
			if(!this._audioListenerWarned) {
				console.warn('AudioSourceManager: no _host.audioListener yet; will retry.');
				this._audioListenerWarned = true;
			}
			return;
		}

		this._rebuildThreeAudio();
		this.__setup = true;

		this.volume = this.volume;
		this.loop = this.loop;
		this._applySpatial();

		if(this.audio)
			this._reloadBuffer();
	}

	updateComponent() {
		if(!window._player)
			return;
		
		if(!this.component.enabled) {
			this.dispose();
			return;
		}

		if(!this.__setup)
			this.setupComponent();

		if(!this.__setup)
			return;

		this.volume = this.volume;
		this.loop = this.loop;
		this._applySpatial();

		if(this.__threeAudio && this.__buffer && this.__threeAudio.buffer !== this.__buffer)
			this.__threeAudio.setBuffer(this.__buffer);
	}

	dispose() {
		if(!this.__setup)
			return;

		this.__loadToken++;

		if(this.__threeAudio)
			this.__threeAudio.stop();

		const o3d = this.d3dobject.object3d;
		if(o3d && this.__threeAudio)
			o3d.remove(this.__threeAudio);

		this.__threeAudio = null;
		this.__buffer = null;
		this.__setup = false;
	}

	play() {
		if(!this.__threeAudio || !this.__buffer)
			return;

		if(!this.__threeAudio.isPlaying)
			this.__threeAudio.play();
	}

	pause() {
		if(this.__threeAudio)
			this.__threeAudio.stop();
	}

	stop() {
		if(this.__threeAudio)
			this.__threeAudio.stop();
	}

	resume() {
		this.play();
	}

	get isPlaying() {
		return !!(this.__threeAudio && this.__threeAudio.isPlaying);
	}

	async setAudio(path) {
		const uuid = this.d3dobject.root.resolveAssetId(path);

		if(!uuid) {
			D3DConsole.error('Unknown asset', path);
			return;
		}

		this.props.audio = uuid;
		await this._reloadBuffer();
	}

	async playAudio(path) {
		await this.setAudio(path);
		this.play();
	}

	_rebuildThreeAudio() {
		if(!window._player)
			return;
		
		const o3d = this.d3dobject.object3d;
		if(!o3d)
			return;

		const listener = _host.audioListener;
		if(!listener)
			return;

		if(this.__threeAudio) {
			this.__threeAudio.stop();
			o3d.remove(this.__threeAudio);
			this.__threeAudio = null;
		}

		this.__threeAudio = (this.soundSpace === '2D')
			? new THREE.Audio(listener)
			: new THREE.PositionalAudio(listener);

		o3d.add(this.__threeAudio);

		this.__threeAudio.setVolume(this.volume);
		this.__threeAudio.setLoop(this.loop);

		if(this.__buffer)
			this.__threeAudio.setBuffer(this.__buffer);

		this._applySpatial();
	}

	_applySpatial() {
		if(!window._player)
			return;
		
		const a = this.__threeAudio;
		if(!a || a.type !== 'PositionalAudio')
			return;

		a.setDistanceModel(this.distanceModel);

		let scale = 1;
		if(typeof _host.audioDistanceScale === 'number' && _host.audioDistanceScale > 0)
			scale = _host.audioDistanceScale;

		const eps = 0.0001;

		const ref = Math.max(eps, this.refDistance * scale);
		const max = Math.max(ref + eps, this.maxDistance * scale);

		a.setRefDistance(ref);

		if(typeof a.setMaxDistance === 'function')
			a.setMaxDistance(max);

		if(typeof a.setRolloffFactor === 'function')
			a.setRolloffFactor(this.rolloffFactor);
	}

	async _reloadBuffer() {
		if(!window._player)
			return;
		
		const token = ++this.__loadToken;

		const uuid = this.audio;
		if(!uuid) {
			this.__buffer = null;
			if(this.__threeAudio)
				this.__threeAudio.stop();
			return;
		}

		const root = this.d3dobject.root;
		const zip = root.zip;

		let relPath = root.resolvePath(uuid);
		if(!relPath || typeof relPath !== 'string')
			throw new Error(`resolvePath failed for ${uuid}`);

		relPath = relPath.replace(/^\/+/, '');

		let entry = zip.file(relPath);
		if(!entry && !/^assets\//i.test(relPath))
			entry = zip.file(`assets/${relPath}`);

		if(!entry)
			throw new Error(`Missing in zip -> ${relPath}`);

		const arrayBuf = await entry.async('arraybuffer');

		if(token !== this.__loadToken)
			return;

		const listener = _host.audioListener;
		const ctx = listener.context;

		const audioBuf = await ctx.decodeAudioData(arrayBuf);

		if(token !== this.__loadToken)
			return;

		this.__buffer = audioBuf;

		if(this.__setup && !this.__threeAudio)
			this._rebuildThreeAudio();

		if(this.__threeAudio) {
			this.__threeAudio.setBuffer(this.__buffer);
			this.__threeAudio.setLoop(this.loop);
			this.__threeAudio.setVolume(this.volume);

			if(this.autoPlay)
				this.play();
		}
	}
}