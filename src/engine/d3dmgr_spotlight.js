export default class SpotLightManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
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

	get targetX() {
		return this.component.properties.targetX;
	}
	set targetX(v) {
		this.component.properties.targetX = v;
		this.updateLight();
	}

	get targetY() {
		return this.component.properties.targetY;
	}
	set targetY(v) {
		this.component.properties.targetY = v;
		this.updateLight();
	}

	get targetZ() {
		return this.component.properties.targetZ;
	}
	set targetZ(v) {
		this.component.properties.targetZ = v;
		this.updateLight();
	}

	updateComponent() {
		if (!this.component.__setup) this.setup();
		else this.updateLight();
	}

	setup() {
		const c = this.component.properties;
		const color = new THREE.Color(Number(c.color));
		const light = new THREE.SpotLight(
			color,
			c.intensity ?? 1,
			c.distance ?? 0,
			c.angle ?? Math.PI / 3,
			c.penumbra ?? 0,
			c.decay ?? 1
		);

		light.target.position.set(c.targetX ?? 0, c.targetY ?? 0, c.targetZ ?? 0);
		light.add(light.target);

		this.d3dobject.replaceObject3D(light);
		this.component.__setup = true;
	}

	updateLight() {
		const c = this.component.properties;
		const light = this.d3dobject.object3d;
		light.color.set(Number(c.color));
		light.intensity = c.intensity ?? 1;
		light.distance = c.distance ?? 0;
		light.angle = c.angle ?? Math.PI / 3;
		light.penumbra = c.penumbra ?? 0;
		light.decay = c.decay ?? 1;
		light.target.position.set(c.targetX ?? 0, c.targetY ?? 0, c.targetZ ?? 0);
	}
}