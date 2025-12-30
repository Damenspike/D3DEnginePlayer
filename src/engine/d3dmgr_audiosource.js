export default class AudioSourceManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.__threeAudio = null;    // THREE.Audio or THREE.PositionalAudio
		this.__buffer = null;        // AudioBuffer
	}

	// ==== schema-backed properties ====
	get audio() { return this.component.properties.audio || ''; } // UUID
	set audio(v) {
		this.component.properties.audio = v || '';
		this._reloadBuffer();
	}

	get volume() { return this.component.properties.volume ?? 0.5; }
	set volume(v) {
		const x = Math.max(0, Math.min(1, Number(v) || 0));
		this.component.properties.volume = x;
		if (this.__threeAudio) this.__threeAudio.setVolume(x);
	}

	get soundSpace() { return this.component.properties.soundSpace || '3D'; } // '3D' | '2D'
	set soundSpace(v) {
		this.component.properties.soundSpace = (v === '2D') ? '2D' : '3D';
		this._rebuildThreeAudio(); // swap between Audio/PositionalAudio
		this._applySpatial();
	}

	get distanceModel() { return this.component.properties.distanceModel || 'linear'; }
	set distanceModel(v) {
		const ok = ['linear','inverse','exponential'];
		this.component.properties.distanceModel = ok.includes(v) ? v : 'linear';
		this._applySpatial();
	}

	get refDistance() { return Number(this.component.properties.refDistance ?? 10); }
	set refDistance(v) { this.component.properties.refDistance = Number(v) || 0; this._applySpatial(); }

	get maxDistance() { return Number(this.component.properties.maxDistance ?? 100); }
	set maxDistance(v) { this.component.properties.maxDistance = Number(v) || 0; this._applySpatial(); }

	get rolloffFactor() { return Number(this.component.properties.rolloffFactor ?? 1); }
	set rolloffFactor(v) {
		this.component.properties.rolloffFactor = Math.max(0, Number(v) || 0);
		this._applySpatial();
	}

	get autoPlay() { return !!this.component.properties.autoPlay; }
	set autoPlay(v) { this.component.properties.autoPlay = !!v; }

	get loop() { return !!this.component.properties.loop; }
	set loop(v) {
		this.component.properties.loop = !!v;
		if (this.__threeAudio) this.__threeAudio.setLoop(!!v);
	}

	// ==== engine entry ====
	__onInternalEnterFrame() {
		if (window._player && !this.__setup) 
			this.setup();
	}

	setup() {
		const object3d = this.d3dobject?.object3d;
		if (!object3d) {
			console.warn('AudioSourceManager: requires a valid object3d');
			return;
		}

		const listener = _host?.audioListener;
		if (!listener) {
			console.warn('AudioSourceManager: no _host.audioListener yet; will retry.');
			return;
		}

		this._rebuildThreeAudio();   // builds/attaches THREE.Audio or THREE.PositionalAudio
		this.volume = this.volume;   // apply initial volume
		this.loop = this.loop;       // apply loop
		this._applySpatial();        // apply spatial props if 3D

		if (this.audio) this._reloadBuffer();

		this.__setup = true;
		this.__onInternalEnterFrame = null;
	}

	deinitialize() {
		this.stop();
		const o3d = this.d3dobject?.object3d;
		if (this.__threeAudio && o3d) o3d.remove(this.__threeAudio);
		this.__threeAudio = null;
		this.__buffer = null;
	}

	// ==== playback ====
	play() {
		if (!this.__threeAudio || !this.__buffer) return;
		if (!this.__threeAudio.isPlaying) this.__threeAudio.play();
	}

	pause() {
		// keep it simple: stop (three.js has no native pause/offset)
		if (this.__threeAudio) this.__threeAudio.stop();
	}

	resume() { this.play(); }

	stop() {
		if (this.__threeAudio) this.__threeAudio.stop();
	}

	get isPlaying() { return !!this.__threeAudio?.isPlaying; }

	// ==== internals ====
	_rebuildThreeAudio() {
		const o3d = this.d3dobject?.object3d;
		if (!o3d) return;

		// detach old
		if (this.__threeAudio) {
			try { o3d.remove(this.__threeAudio); } catch {}
			this.__threeAudio = null;
		}

		const listener = _host?.audioListener;
		if (!listener) return;

		this.__threeAudio = (this.soundSpace === '2D')
			? new THREE.Audio(listener)
			: new THREE.PositionalAudio(listener);

		o3d.add(this.__threeAudio);

		// re-apply props + buffer
		this.__threeAudio.setVolume(this.volume);
		this.__threeAudio.setLoop(this.loop);
		this._applySpatial();
		if (this.__buffer) this.__threeAudio.setBuffer(this.__buffer);
	}

	_applySpatial() {
		// only for 3D (PositionalAudio)
		if (!(this.__threeAudio && this.__threeAudio.type === 'PositionalAudio')) return;

		const model = this.distanceModel;
		this.__threeAudio.setDistanceModel(model);

		// Optional global unit scaling (default 1 = meters)
		const scale = (typeof _host?.audioDistanceScale === 'number' && _host.audioDistanceScale > 0)
			? _host.audioDistanceScale
			: 1;

		const eps = 0.0001;
		const ref = Math.max(eps, this.refDistance * scale);
		const max = Math.max(ref + eps, this.maxDistance * scale);

		this.__threeAudio.setRefDistance(ref);

		if (typeof this.__threeAudio.setMaxDistance === 'function') {
			// Has effect mainly for 'linear', harmless otherwise
			this.__threeAudio.setMaxDistance(max);
		}

		if (typeof this.__threeAudio.setRolloffFactor === 'function') {
			this.__threeAudio.setRolloffFactor(this.rolloffFactor);
		}
	}

	async _reloadBuffer() {
		const uuid = this.audio;
		if (!uuid) {
			this.__buffer = null;
			if (this.__threeAudio) this.__threeAudio.stop();
			return;
		}

		const root = this.d3dobject?.root;
		const zip  = root?.zip;
		if (!root || !zip || typeof root.resolvePath !== 'function') {
			console.error('AudioSourceManager: root/zip/resolvePath unavailable');
			return;
		}

		try {
			let relPath = root.resolvePath(uuid);
			if (!relPath || typeof relPath !== 'string') throw new Error(`resolvePath failed for ${uuid}`);
			relPath = relPath.replace(/^\/+/, '');

			let entry = zip.file(relPath);
			if (!entry && !/^assets\//i.test(relPath)) entry = zip.file(`assets/${relPath}`);
			if (!entry) throw new Error(`Missing in zip -> ${relPath}`);

			const arrayBuf = await entry.async('arraybuffer');

			// decode using the global listener’s AudioContext
			const listener = _host.audioListener;
			const ctx = listener.context;
			const audioBuf = await ctx.decodeAudioData(arrayBuf);
			this.__buffer = audioBuf;

			// bind to three audio node (rebuild if needed)
			if (!this.__threeAudio) this._rebuildThreeAudio();
			if (this.__threeAudio) {
				this.__threeAudio.setBuffer(this.__buffer);
				this.__threeAudio.setLoop(this.loop);
				this.__threeAudio.setVolume(this.volume);
				if (this.autoPlay) this.play();
			}
		} catch (err) {
			console.warn('AudioSourceManager: failed to load audio from zip', err);
			this.__buffer = null;
			if (this.__threeAudio) this.__threeAudio.stop();
		}
	}
}