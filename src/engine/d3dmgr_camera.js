export default class CameraManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component  = component;
		this.__setup    = false;
	}

	// ---- property helpers ----

	get props() {
		return this.component.properties || (this.component.properties = {});
	}

	// 'perspective' | 'orthographic'
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

	// Vertical size in world units for orthographic camera
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

	// Only used for orthographic; perspective ignores this and behaves like old code
	get aspect() {
		if (this.props.aspect != null) return this.props.aspect;
		const r = this.d3dobject.root?.manifest;
		if (r && r.width && r.height) return r.width / r.height;
		return 1;
	}
	set aspect(v) {
		this.props.aspect = v;
		this.updateCamera();
	}

	// ---- lifecycle ----

	updateComponent() {
		if (!this.__setup) this.setup();
		else this.updateCamera();
	}

	setup() {
		const camera = this._createCamera();
		this._applyTransformFromObject(camera);
		this.d3dobject.replaceObject3D(camera);
		this.__setup = true;
	}

	// ---- internals ----

	_createCamera() {
		const proj = this.projection;
		const near = this.clipNear ?? 0.1;
		const far  = this.clipFar  ?? 1000;

		if (proj === 'orthographic') {
			const aspect = this.aspect;
			const size   = this.orthographicSize ?? 10;
			const halfH  = size * 0.5;
			const halfW  = halfH * aspect;

			const cam = new THREE.OrthographicCamera(
				-halfW, halfW,
				halfH, -halfH,
				near, far
			);
			return cam;
		}

		// Perspective (original behaviour)
		const fov = this.fieldOfView || 75;
		const r   = this.d3dobject.root?.manifest;
		const aspect = (r && r.width && r.height)
			? (r.width / r.height)
			: 1;

		const cam = new THREE.PerspectiveCamera(
			fov,
			aspect,
			near,
			far
		);
		return cam;
	}

	_applyTransformFromObject(camera) {
		const obj = this.d3dobject;
		camera.position.copy(obj.position);
		camera.quaternion.copy(obj.quaternion);
		camera.scale.copy(obj.scale);
	}

	_applyTransformFromOldCamera(camera, old) {
		if (!old) {
			this._applyTransformFromObject(camera);
			return;
		}
		camera.position.copy(old.position);
		camera.quaternion.copy(old.quaternion);
		camera.scale.copy(old.scale);
	}

	updateCamera() {
		let camera = this.d3dobject.object3d;
		const proj = this.projection;
		const near = this.clipNear ?? 0.1;
		const far  = this.clipFar  ?? 1000;

		const wantsPerspective  = (proj === 'perspective');
		const wantsOrthographic = (proj === 'orthographic');

		const isPerspective  = camera && camera.isPerspectiveCamera;
		const isOrthographic = camera && camera.isOrthographicCamera;

		// If no camera or wrong type, recreate and keep transform
		if (!camera ||
			(wantsPerspective && !isPerspective) ||
			(wantsOrthographic && !isOrthographic)) {

			const old = camera;
			camera = this._createCamera();
			this._applyTransformFromOldCamera(camera, old);
			this.d3dobject.replaceObject3D(camera);
		}

		if (camera.isPerspectiveCamera) {
			// Match original behaviour: only tweak fov/near/far, *do not* touch aspect
			if (this.fieldOfView != null)
				camera.fov = this.fieldOfView;
			if (this.clipNear != null)
				camera.near = this.clipNear;
			if (this.clipFar != null)
				camera.far = this.clipFar;

			camera.updateProjectionMatrix();
			return;
		}

		if (camera.isOrthographicCamera) {
			// Ortho: keep aspect in sync via our aspect property / manifest
			const aspect = this.aspect;
			const size   = this.orthographicSize ?? 10;
			const halfH  = size * 0.5;
			const halfW  = halfH * aspect;

			camera.left   = -halfW;
			camera.right  =  halfW;
			camera.top    =  halfH;
			camera.bottom = -halfH;
			camera.near   = this.clipNear ?? camera.near;
			camera.far    = this.clipFar  ?? camera.far;

			camera.updateProjectionMatrix();
		}
	}
}