import * as THREE from 'three';

export default class SpotLightManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		this.__setup = false;

		this._pos = new THREE.Vector3();
		this._dir = new THREE.Vector3();
		this._target = null;
	}

	get color() { return this.component.properties.color; }
	set color(v) { this.component.properties.color = v; this.updateLight(); }

	get intensity() { return this.component.properties.intensity; }
	set intensity(v) { this.component.properties.intensity = v; this.updateLight(); }

	get distance() { return this.component.properties.distance; }
	set distance(v) { this.component.properties.distance = v; this.updateLight(); }

	get angle() { return this.component.properties.angle; }
	set angle(v) { this.component.properties.angle = v; this.updateLight(); }

	get penumbra() { return this.component.properties.penumbra; }
	set penumbra(v) { this.component.properties.penumbra = v; this.updateLight(); }

	get decay() { return this.component.properties.decay; }
	set decay(v) { this.component.properties.decay = v; this.updateLight(); }

	get castShadow() { return !!this.component.properties.castShadow; }
	set castShadow(v) { this.component.properties.castShadow = !!v; this.updateLight(); }

	updateComponent() {
		if (!this.__setup) this.setup();
		this.updateLight();
	}

	setup() {
		const c = this.component.properties;
		const color = new THREE.Color(Number(c.color));

		const light = new THREE.SpotLight(
			color,
			c.intensity ?? 1,
			c.distance ?? 10,
			THREE.MathUtils.degToRad(c.angle ?? 45),
			c.penumbra ?? 0,
			c.decay ?? 1
		);

		const scene = this.d3dobject.root.object3d;

		if (!this._target) {
			const t = new THREE.Object3D();
			t.name = '__spotLightTarget';
			t.visible = false;
			scene.add(t);
			this._target = t;
		} else if (!this._target.parent) {
			scene.add(this._target);
		}

		light.target = this._target;

		this.d3dobject.replaceObject3D(light);

		this.__setup = true;
	}

	updateLight() {
		if(!this.d3dobject.enabled || !this.component.enabled || !this.__setup)
			return;
		
		const c = this.component.properties;
		const light = this.d3dobject.object3d;

		if (!light || !light.color) return;

		light.color.set(Number(c.color));
		light.intensity = c.intensity ?? 1;
		light.distance = c.distance ?? 10;
		light.angle = THREE.MathUtils.degToRad(c.angle ?? 45);
		light.penumbra = c.penumbra ?? 0;
		light.decay = c.decay ?? 1;

		light.castShadow = !!c.castShadow;

		if (light.castShadow) {
			light.shadow.mapSize.width = c.shadowMapSize ?? 1024;
			light.shadow.mapSize.height = c.shadowMapSize ?? 1024;
			light.shadow.bias = c.shadowBias ?? -0.0005;
			light.shadow.normalBias = c.shadowNormalBias ?? 0.02;
			light.shadow.radius = c.shadowRadius ?? 1.0;
			light.shadow.camera.near = c.shadowNear ?? 0.5;
			light.shadow.camera.far = c.shadowFar ?? (c.distance || 50);
			light.shadow.camera.fov = c.shadowFov ?? (c.angle ?? 45);
			light.shadow.camera.updateProjectionMatrix?.();
		}
	}

	__onInternalEnterFrame() {
		if (!this.component.enabled || !this.__setup)
			return;

		const light = this.d3dobject.object3d;
		const target = this._target;
		if (!light || !target)
			return;

		const dist = this.component.properties.distance ?? 10;

		light.updateMatrixWorld(true);
		light.getWorldPosition(this._pos);
		light.getWorldDirection(this._dir);

		target.position.copy(this._pos).addScaledVector(this._dir, dist);
		target.updateMatrixWorld(true);
	}
	
	dispose() {
		const light = this.d3dobject?.object3d;
		if(!light || !light.isSpotLight)
			return;
	
		if(light.shadow?.map) {
			light.shadow.map.dispose();
			light.shadow.map = null;
		}
	
		if(light.parent)
			light.parent.remove(light);
	
		this.__setup = false;
	}
}