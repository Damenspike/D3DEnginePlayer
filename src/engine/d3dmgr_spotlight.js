import * as THREE from 'three';

export default class SpotLightManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		this.__setup = false;
	}

	get color() {
		return this.component.properties.color;
	}
	set color(v) {
		this.component.properties.color = v;
		this.updateLight();
	}

	get intensity() {
		return this.component.properties.intensity;
	}
	set intensity(v) {
		this.component.properties.intensity = v;
		this.updateLight();
	}

	get distance() {
		return this.component.properties.distance;
	}
	set distance(v) {
		this.component.properties.distance = v;
		this.updateLight();
	}

	get angle() {
		return this.component.properties.angle;
	}
	set angle(v) {
		this.component.properties.angle = v;
		this.updateLight();
	}

	get penumbra() {
		return this.component.properties.penumbra;
	}
	set penumbra(v) {
		this.component.properties.penumbra = v;
		this.updateLight();
	}

	get decay() {
		return this.component.properties.decay;
	}
	set decay(v) {
		this.component.properties.decay = v;
		this.updateLight();
	}

	updateComponent() {
		if (!this.__setup) this.setup();
		else this.updateLight();
	}

	setup() {
		const c = this.component.properties;
		const color = new THREE.Color(Number(c.color));

		const light = new THREE.SpotLight(
			color,
			c.intensity ?? 1,
			c.distance ?? 0,
			THREE.MathUtils.degToRad(c.angle) ?? Math.PI / 3,
			c.penumbra ?? 0,
			c.decay ?? 1
		);

		// Create internal target and add to scene root
		const scene = _root.object3d;
		const target = new THREE.Object3D();
		target.name = '__spotLightTarget';
		target.visible = false;
		scene.add(target);
		light.target = target;
		
		this.d3dobject.replaceObject3D(light);

		const _pos = new THREE.Vector3();
		const _dir = new THREE.Vector3();

		const updateTarget = () => {
			if (!this.component.enabled) return;

			const dist = this.component.properties.distance ?? 10;

			// update world position and direction
			light.updateMatrixWorld(true);
			light.getWorldPosition(_pos);
			this.d3dobject.object3d.getWorldDirection(_dir);

			// move target along forward vector
			target.position.copy(_pos).addScaledVector(_dir, dist || 10);
			target.updateMatrixWorld(true);
		};

		this.__onInternalEnterFrame = updateTarget;
		this.__setup = true;
	}

	updateLight() {
		const c = this.component.properties;
		const light = this.d3dobject.object3d;

		light.color.set(Number(c.color));
		light.intensity = c.intensity ?? 1;
		light.distance = c.distance ?? 0;
		light.angle = THREE.MathUtils.degToRad(c.angle) ?? Math.PI / 3;
		light.penumbra = c.penumbra ?? 0;
		light.decay = c.decay ?? 1;
	}
}