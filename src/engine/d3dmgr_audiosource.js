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
		this.__lastRandomOffset = 0;
		this.__restartOnRandomChange = false;

		this._audioListenerWarned = false;

		this.__gizmoRoot = null;
		this.__gizmoRefSphere = null;
		this.__gizmoMaxSphere = null;
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

	get random() {
		return !!this.props.random;
	}
	set random(v) {
		v = !!v;
		if(this.props.random === v)
			return;

		this.props.random = v;

		if(this.__threeAudio && this.__buffer && this.__threeAudio.isPlaying) {
			this.__threeAudio.stop();
			this.play();
		}
	}

	setupComponent() {
		if(!window._player)
			return;

		if(this.__setup)
			return;

		const object3d = this.d3dobject.object3d;
		if(!object3d)
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
	
	__onEditorEnterFrame() {
		this._updateEditorGizmo();
	}

	dispose() {
		if(!this.__setup)
			return;

		this.__loadToken++;

		if(this.__threeAudio)
			this.__threeAudio.stop();

		const object3d = this.d3dobject.object3d;
		if(object3d && this.__threeAudio)
			object3d.remove(this.__threeAudio);

		this.__threeAudio = null;
		this.__buffer = null;
		this.__setup = false;

		this._disposeEditorGizmo();
	}

	play() {
		if(!this.__threeAudio || !this.__buffer)
			return;

		if(this.__threeAudio.isPlaying)
			return;

		this._applyRandomOffsetForNextPlay();

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

		const object3d = this.d3dobject.object3d;
		if(!object3d)
			return;

		const listener = _host.audioListener;
		if(!listener)
			return;

		if(this.__threeAudio) {
			this.__threeAudio.stop();
			object3d.remove(this.__threeAudio);
			this.__threeAudio = null;
		}

		this.__threeAudio = (this.soundSpace === '2D')
			? new THREE.Audio(listener)
			: new THREE.PositionalAudio(listener);

		object3d.add(this.__threeAudio);

		this.__threeAudio.setVolume(this.volume);
		this.__threeAudio.setLoop(this.loop);

		if(this.__buffer)
			this.__threeAudio.setBuffer(this.__buffer);

		this._applySpatial();
	}

	_applySpatial() {
		if(!window._player)
			return;

		const threeAudio = this.__threeAudio;
		if(!threeAudio || threeAudio.type !== 'PositionalAudio')
			return;

		threeAudio.setDistanceModel(this.distanceModel);

		const distanceScale = 1;
		const epsilon = 0.0001;

		const fullVolumeRadius = Math.max(epsilon, this.refDistance * distanceScale);
		const cutOffRadius = Math.max(fullVolumeRadius + epsilon, this.maxDistance * distanceScale);

		threeAudio.setRefDistance(fullVolumeRadius);

		if(typeof threeAudio.setMaxDistance === 'function')
			threeAudio.setMaxDistance(cutOffRadius);

		if(typeof threeAudio.setRolloffFactor === 'function')
			threeAudio.setRolloffFactor(this.rolloffFactor);
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
		const audioContext = listener.context;

		const audioBuf = await audioContext.decodeAudioData(arrayBuf);

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

	_applyRandomOffsetForNextPlay() {
		if(!this.__threeAudio || !this.__buffer)
			return;

		if(!this.random) {
			this.__lastRandomOffset = 0;
			this.__threeAudio.offset = 0;
			return;
		}

		const durationSeconds = this.__buffer.duration || 0;
		if(durationSeconds <= 0) {
			this.__lastRandomOffset = 0;
			this.__threeAudio.offset = 0;
			return;
		}

		let maxStartSeconds = durationSeconds;
		if(this.loop)
			maxStartSeconds = Math.max(0, durationSeconds - 0.05);

		const randomOffsetSeconds = (maxStartSeconds > 0) ? (Math.random() * maxStartSeconds) : 0;

		this.__lastRandomOffset = randomOffsetSeconds;
		this.__threeAudio.offset = randomOffsetSeconds;
	}

	_isEditorSelected() {
		if(!window._editor)
			return false;
			
		const selectedObjects = window._editor.selectedObjects;
		if(!Array.isArray(selectedObjects) || selectedObjects.length === 0)
			return false;
		
		return selectedObjects.includes(this.d3dobject);
	}

	_updateEditorGizmo() {
		if(!this._isEditorSelected()) {
			this._disposeEditorGizmo();
			return;
		}

		if(this.soundSpace !== '3D') {
			this._disposeEditorGizmo();
			return;
		}

		if(!this.d3dobject?.object3d) {
			this._disposeEditorGizmo();
			return;
		}
		
		const distanceScale = 1;
		const epsilon = 0.0001;

		const fullVolumeRadius = Math.max(epsilon, this.refDistance * distanceScale);
		const cutOffRadius = Math.max(fullVolumeRadius + epsilon, this.maxDistance * distanceScale);

		if(!this.__gizmoRoot) {
			this.__gizmoRoot = new THREE.Group();
			this.__gizmoRoot.name = '__d3d_audio_gizmo__';

			const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);

			const fullVolumeMaterial = new THREE.MeshBasicMaterial({
				color: 0xff3333,
				wireframe: true,
				depthTest: false,
				transparent: true,
				opacity: 0.3
			});
			
			const cutOffMaterial = new THREE.MeshBasicMaterial({
				color: 0x3366ff,
				wireframe: true,
				depthTest: false,
				transparent: true,
				opacity: 0.08
			});

			this.__gizmoRefSphere = new THREE.Mesh(sphereGeometry, fullVolumeMaterial);
			this.__gizmoMaxSphere = new THREE.Mesh(sphereGeometry, cutOffMaterial);

			this.__gizmoRefSphere.renderOrder = 9999;
			this.__gizmoMaxSphere.renderOrder = 9998;

			this.__gizmoRoot.add(this.__gizmoMaxSphere);
			this.__gizmoRoot.add(this.__gizmoRefSphere);

			this.d3dobject.object3d.add(this.__gizmoRoot);
		}

		if(this.__gizmoRefSphere)
			this.__gizmoRefSphere.scale.set(fullVolumeRadius, fullVolumeRadius, fullVolumeRadius);

		if(this.__gizmoMaxSphere)
			this.__gizmoMaxSphere.scale.set(cutOffRadius, cutOffRadius, cutOffRadius);
	}

	_disposeEditorGizmo() {
		if(!this.__gizmoRoot)
			return;

		const parentObject = this.__gizmoRoot.parent;
		if(parentObject)
			parentObject.remove(this.__gizmoRoot);

		if(this.__gizmoRefSphere?.geometry)
			this.__gizmoRefSphere.geometry.dispose();
		if(this.__gizmoMaxSphere?.geometry && this.__gizmoMaxSphere.geometry !== this.__gizmoRefSphere?.geometry)
			this.__gizmoMaxSphere.geometry.dispose();

		if(this.__gizmoRefSphere?.material) {
			if(Array.isArray(this.__gizmoRefSphere.material))
				this.__gizmoRefSphere.material.forEach(material => material.dispose());
			else
				this.__gizmoRefSphere.material.dispose();
		}

		if(this.__gizmoMaxSphere?.material) {
			if(Array.isArray(this.__gizmoMaxSphere.material))
				this.__gizmoMaxSphere.material.forEach(material => material.dispose());
			else
				this.__gizmoMaxSphere.material.dispose();
		}

		this.__gizmoRoot = null;
		this.__gizmoRefSphere = null;
		this.__gizmoMaxSphere = null;
	}
}