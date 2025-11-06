export default class PointLightManager {
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
		const light = new THREE.PointLight(
			color,
			c.intensity ?? 1,
			c.distance ?? 0,
			c.decay ?? 1
		);
		this.d3dobject.replaceObject3D(light);
		this.__setup = true;
	}
	
	updateLight() {
		const c = this.component.properties;
		const light = this.d3dobject.object3d;
		light.color.set(Number(c.color));
		light.intensity = c.intensity ?? 1;
		light.distance = c.distance ?? 0;
		light.decay = c.decay ?? 1;
	}
}