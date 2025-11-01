export default class AmbientLightManager {
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

	updateComponent() {
		if (!this.component.__setup) this.setup();
		else this.updateLight();
	}

	setup() {
		const c = this.component.properties;
		const color = new THREE.Color(Number(c.color));
		const light = new THREE.AmbientLight(color, c.intensity);
		this.d3dobject.replaceObject3D(light);
		this.component.__setup = true;
	}

	updateLight() {
		const c = this.component.properties;
		const light = this.d3dobject.object3d;
		light.color.set(Number(c.color));
		light.intensity = c.intensity;
	}
}