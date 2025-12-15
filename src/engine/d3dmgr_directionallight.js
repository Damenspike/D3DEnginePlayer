import * as THREE from 'three';

export default class DirectionalLightManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		this.__setup = false;

		this._pos = new THREE.Vector3();
		this._dir = new THREE.Vector3();
		this._camPos = new THREE.Vector3();
		this._target = null;
	}

	get color() { return this.component.properties.color; }
	set color(v) { this.component.properties.color = v; this.updateLight(); }

	get intensity() { return this.component.properties.intensity; }
	set intensity(v) { this.component.properties.intensity = v; this.updateLight(); }

	get castShadow() { return !!this.component.properties.castShadow; }
	set castShadow(v) { this.component.properties.castShadow = !!v; this.updateLight(); }

	get shadowMapSize() { return this.component.properties.shadowMapSize ?? 2048; }
	set shadowMapSize(v) { this.component.properties.shadowMapSize = v | 0; this.updateLight(); }

	get shadowNear() { return this.component.properties.shadowNear ?? 0.5; }
	set shadowNear(v) { this.component.properties.shadowNear = +v; this.updateLight(); }

	get shadowFar() { return this.component.properties.shadowFar ?? 500; }
	set shadowFar(v) { this.component.properties.shadowFar = +v; this.updateLight(); }

	get shadowOrthoSize() { return this.component.properties.shadowOrthoSize ?? 50; }
	set shadowOrthoSize(v) { this.component.properties.shadowOrthoSize = +v; this.updateLight(); }

	get shadowBias() { return this.component.properties.shadowBias ?? -0.0005; }
	set shadowBias(v) { this.component.properties.shadowBias = +v; this.updateLight(); }

	get shadowNormalBias() { return this.component.properties.shadowNormalBias ?? 0.02; }
	set shadowNormalBias(v) { this.component.properties.shadowNormalBias = +v; this.updateLight(); }

	get shadowRadius() { return this.component.properties.shadowRadius ?? 1.0; }
	set shadowRadius(v) { this.component.properties.shadowRadius = +v; this.updateLight(); }

	updateComponent() {
		if (!this.__setup) this.setup();
		else this.updateLight();
	}

	setup() {
		const c = this.component.properties;
		const light = new THREE.DirectionalLight(new THREE.Color(Number(c.color)), c.intensity);
		this.d3dobject.replaceObject3D(light);

		const scene = this.d3dobject.root.object3d;

		if (!this._target) {
			const t = new THREE.Object3D();
			t.name = '__dirLightTarget';
			t.visible = false;
			scene.add(t);
			this._target = t;
		} else if (!this._target.parent) {
			scene.add(this._target);
		}

		light.target = this._target;

		this.__setup = true;
		this.updateLight();
	}

	updateLight() {
		const c = this.component.properties;
		const light = this.d3dobject.object3d;
		if (!light) return;

		light.color.set(Number(c.color));
		light.intensity = c.intensity;

		this._applyShadowProps(light);
	}

	__onInternalEnterFrame() {
		if (!this.__setup || !this.component.enabled)
			return;

		const cam = _host?.camera?.object3d;
		if (!cam) return;

		const light = this.d3dobject.object3d;
		const target = this._target;
		if (!light || !target) return;

		cam.getWorldPosition(this._camPos);
		light.getWorldDirection(this._dir).normalize();

		const distBack = this.shadowOrthoSize * 0.5;
		this._pos.copy(this._camPos).addScaledVector(this._dir, -distBack);
		light.position.copy(this._pos);

		target.position.copy(this._camPos);
		target.updateMatrixWorld(true);
		light.updateMatrixWorld(true);
	}

	_applyShadowProps(light) {
		const cast = this.castShadow;
		const mapSize = Math.max(1, this.shadowMapSize | 0);
		const near = Math.max(0.001, +this.shadowNear);
		const far = Math.max(near + 0.001, +this.shadowFar);
		const ortho = Math.max(0.001, +this.shadowOrthoSize);
		const bias = +this.shadowBias;
		const normalBias = +this.shadowNormalBias;
		const radius = +this.shadowRadius;

		light.castShadow = cast;

		const sh = light.shadow;
		sh.mapSize.set(mapSize, mapSize);

		const cam = sh.camera;
		cam.near = near;
		cam.far = far;
		cam.left = -ortho;
		cam.right = ortho;
		cam.top = ortho;
		cam.bottom = -ortho;
		cam.updateProjectionMatrix();

		sh.bias = bias;
		sh.normalBias = normalBias;
		if ('radius' in sh) sh.radius = radius;
	}
}