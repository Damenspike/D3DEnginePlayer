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

get color() {
		return this.component.properties.color;
	}
	set color(v) {
		this.component.properties.color = v;
		this.updateLight();
	}
	
	get intensity() {
		return Number(this.component.properties.intensity);
	}
	set intensity(v) {
		this.component.properties.intensity = Number(v);
		this.updateLight();
	}
	
	get distance() {
		return Number(this.component.properties.distance);
	}
	set distance(v) {
		this.component.properties.distance = Number(v);
		this.updateLight();
	}
	
	get castShadow() {
		return !!this.component.properties.castShadow;
	}
	set castShadow(v) {
		this.component.properties.castShadow = !!v;
		this.updateLight();
	}
	
	get shadowMapSize() {
		return Number(this.component.properties.shadowMapSize ?? 2048);
	}
	set shadowMapSize(v) {
		this.component.properties.shadowMapSize = Number(v) | 0;
		this.updateLight();
	}
	
	get shadowNear() {
		return Number(this.component.properties.shadowNear ?? 0.5);
	}
	set shadowNear(v) {
		this.component.properties.shadowNear = Number(v);
		this.updateLight();
	}
	
	get shadowFar() {
		return Number(this.component.properties.shadowFar ?? 500);
	}
	set shadowFar(v) {
		this.component.properties.shadowFar = Number(v);
		this.updateLight();
	}
	
	get shadowOrthoSize() {
		return Number(this.component.properties.shadowOrthoSize ?? 50);
	}
	set shadowOrthoSize(v) {
		this.component.properties.shadowOrthoSize = Number(v);
		this.updateLight();
	}
	
	get shadowBias() {
		return Number(this.component.properties.shadowBias ?? -0.0005);
	}
	set shadowBias(v) {
		this.component.properties.shadowBias = Number(v);
		this.updateLight();
	}
	
	get shadowNormalBias() {
		return Number(this.component.properties.shadowNormalBias ?? 0.02);
	}
	set shadowNormalBias(v) {
		this.component.properties.shadowNormalBias = Number(v);
		this.updateLight();
	}
	
	get shadowRadius() {
		return Number(this.component.properties.shadowRadius ?? 1);
	}
	set shadowRadius(v) {
		this.component.properties.shadowRadius = Number(v);
		this.updateLight();
	}
	
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
		if(!this.d3dobject.enabled)
			return;
		
		const c = this.component.properties;
		const light = this.d3dobject.object3d;
		if (!light) return;

		light.color.set(Number(c.color));
		light.intensity = c.intensity;

		this._applyShadowProps(light);
	}

	__onInternalEnterFrame() {
		if(!this.__setup || !this.component.enabled)
			return;
	
		const light = this.d3dobject.object3d;
		const target = this._target;
	
		this._pos.copy(this.d3dobject.worldPosition);
		light.getWorldDirection(this._dir).normalize();
	
		target.position.copy(this._pos).addScaledVector(this._dir, this.distance);
	
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