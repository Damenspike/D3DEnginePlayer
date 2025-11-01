export default class DirectionalLightManager {
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
		const light = new THREE.DirectionalLight(color, c.intensity);
		this.d3dobject.replaceObject3D(light);
		
		const scene = _root.object3d;
		const target = new THREE.Object3D();
		target.name = '__dirLightTarget';
		target.visible = false;
		scene.add(target);
		light.target = target;
		
		const _pos = new THREE.Vector3();
		const _dir = new THREE.Vector3();
		const DIST = 100;
		
		const updateTarget = () => {
			if (!this.component.enabled) return;
			light.updateMatrixWorld(true);
			light.getWorldPosition(_pos);
			light.getWorldDirection(_dir);
			_dir.multiplyScalar(DIST);
			target.position.copy(_pos).add(_dir);
			target.updateMatrixWorld(true);
		};
		
		this.__onInternalEnterFrame = updateTarget;
		this.component.__setup = true;
	}

	updateLight() {
		const c = this.component.properties;
		const light = this.d3dobject.object3d;
		light.color.set(Number(c.color));
		light.intensity = c.intensity;
	}
}