import * as THREE from 'three';

export default class CameraManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.__setup = false;

		this.prevObject3D = null;
		this.prevWasCamera = false;

		this.aoBox = new THREE.Box3();
		this.aoCenter = new THREE.Vector3();
	}

	get props() {
		if(!this.component.properties)
			this.component.properties = {};
		return this.component.properties;
	}

	get projection() {
		return this.props.projection || 'perspective';
	}
	set projection(v) {
		this.props.projection = v;
		this.updateCamera();
	}

	get fieldOfView() {
		return this.props.fieldOfView;
	}
	set fieldOfView(v) {
		this.props.fieldOfView = v;
		this.updateCamera();
	}

	get orthographicSize() {
		return this.props.orthographicSize;
	}
	set orthographicSize(v) {
		this.props.orthographicSize = v;
		this.updateCamera();
	}

	get clipNear() {
		return this.props.clipNear;
	}
	set clipNear(v) {
		this.props.clipNear = v;
		this.updateCamera();
	}

	get clipFar() {
		return this.props.clipFar;
	}
	set clipFar(v) {
		this.props.clipFar = v;
		this.updateCamera();
	}

	get aspect() {
		if(this.props.aspect !== undefined && this.props.aspect !== null)
			return this.props.aspect;

		const r = this.d3dobject.root.manifest;
		if(r && r.width && r.height)
			return r.width / r.height;

		return 1;
	}
	set aspect(v) {
		this.props.aspect = v;
		this.updateCamera();
	}

	get aoClipRadius() {
		return Number(this.props.aoClipRadius);
	}
	set aoClipRadius(v) {
		this.props.aoClipRadius = Number(v);
		this.applyGtaoClipBox();
	}

	setupComponent() {
		if(this.__setup)
			return;

		this.prevObject3D = this.d3dobject.object3d;
		this.prevWasCamera = !!(this.prevObject3D && this.prevObject3D.isCamera);

		const cam = this.createCamera();
		this.copyTransform(cam, this.prevObject3D);
		this.d3dobject.replaceObject3D(cam);

		this.__setup = true;

		this.updateCamera();
		this.applyGtaoClipBox();
	}

	updateComponent() {
		if(!this.component.enabled)
			return;

		if(!this.__setup)
			this.setupComponent();
		else
			this.updateCamera();
	}

	dispose() {
		if(!this.__setup)
			return;

		this.clearGtaoClipBox();

		const cur = this.d3dobject.object3d;
		
		if(window._player) {
			if(_player.mainCamera == this.d3dobject)
				_player.mainCamera = null;
			
			if(_player.camera == this.d3dobject)
				_player.camera = null;
		}

		if(this.prevObject3D) {
			const back = this.prevObject3D;
			this.copyTransform(back, cur);
			this.d3dobject.replaceObject3D(back);
		} else {
			const back = new THREE.Object3D();
			this.copyTransform(back, cur);
			this.d3dobject.replaceObject3D(back);
		}

		this.prevObject3D = null;
		this.prevWasCamera = false;

		this.__setup = false;
	}

	__onInternalEnterFrame() {
		if(!this.component.enabled)
			return;

		if(!this.__setup)
			return;

		if(_host.camera === this.d3dobject)
			this.applyGtaoClipBox();
	}

	createCamera() {
		const proj = this.projection;

		const near = (this.clipNear !== undefined && this.clipNear !== null) ? this.clipNear : 0.1;
		const far  = (this.clipFar  !== undefined && this.clipFar  !== null) ? this.clipFar  : 1000;

		if(proj === 'orthographic') {
			const aspect = this.aspect;
			const size = (this.orthographicSize !== undefined && this.orthographicSize !== null) ? this.orthographicSize : 10;

			const halfH = size * 0.5;
			const halfW = halfH * aspect;

			return new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, near, far);
		}

		const fov = (this.fieldOfView !== undefined && this.fieldOfView !== null) ? this.fieldOfView : 75;

		const r = this.d3dobject.root.manifest;
		const aspect = (r && r.width && r.height) ? (r.width / r.height) : 1;

		return new THREE.PerspectiveCamera(fov, aspect, near, far);
	}

	copyTransform(dst, src) {
		if(src) {
			dst.position.copy(src.position);
			dst.quaternion.copy(src.quaternion);
			dst.scale.copy(src.scale);
		} else {
			dst.position.copy(this.d3dobject.position);
			dst.quaternion.copy(this.d3dobject.quaternion);
			dst.scale.copy(this.d3dobject.scale);
		}
	}

	updateCamera() {
		if(!this.__setup)
			return;

		let cam = this.d3dobject.object3d;

		const wantsPerspective = this.projection === 'perspective';
		const wantsOrtho = this.projection === 'orthographic';

		const isPerspective = !!(cam && cam.isPerspectiveCamera);
		const isOrtho = !!(cam && cam.isOrthographicCamera);

		if(!cam || (wantsPerspective && !isPerspective) || (wantsOrtho && !isOrtho)) {
			const old = cam;
			cam = this.createCamera();
			this.copyTransform(cam, old);
			this.d3dobject.replaceObject3D(cam);
		}

		if(cam.isPerspectiveCamera) {
			if(this.fieldOfView !== undefined && this.fieldOfView !== null)
				cam.fov = this.fieldOfView;

			if(this.clipNear !== undefined && this.clipNear !== null)
				cam.near = this.clipNear;

			if(this.clipFar !== undefined && this.clipFar !== null)
				cam.far = this.clipFar;

			cam.updateProjectionMatrix();
			return;
		}

		if(cam.isOrthographicCamera) {
			const aspect = this.aspect;
			const size = (this.orthographicSize !== undefined && this.orthographicSize !== null) ? this.orthographicSize : 10;

			const halfH = size * 0.5;
			const halfW = halfH * aspect;

			cam.left = -halfW;
			cam.right = halfW;
			cam.top = halfH;
			cam.bottom = -halfH;

			if(this.clipNear !== undefined && this.clipNear !== null)
				cam.near = this.clipNear;

			if(this.clipFar !== undefined && this.clipFar !== null)
				cam.far = this.clipFar;

			cam.updateProjectionMatrix();
		}
	}

	clearGtaoClipBox() {
		if(!_graphics.gtao)
			return;

		if(!_graphics.gtao.enabled)
			return;

		_graphics.gtao.setSceneClipBox(null);
	}

	applyGtaoClipBox() {
		if(!_graphics.gtao)
			return;

		if(!_graphics.gtao.enabled)
			return;

		const r = Number(this.props.aoClipRadius);
		if(!r || r <= 0) {
			_graphics.gtao.setSceneClipBox(null);
			return;
		}

		const cam = this.d3dobject.object3d;
		if(!cam || !cam.isCamera)
			return;

		this.aoCenter.copy(cam.position);

		this.aoBox.min.set(this.aoCenter.x - r, this.aoCenter.y - r, this.aoCenter.z - r);
		this.aoBox.max.set(this.aoCenter.x + r, this.aoCenter.y + r, this.aoCenter.z + r);

		_graphics.gtao.setSceneClipBox(this.aoBox);
	}
}