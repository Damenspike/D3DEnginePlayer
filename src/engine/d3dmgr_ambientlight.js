export default class HemisphereLightManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		this.__setup = false;
	}
	
	get skyColor() {
		return this.component.properties.skyColor;
	}
	set skyColor(v) {
		this.component.properties.skyColor = v;
		this.updateLight();
	}
	
	get groundColor() {
		return this.component.properties.groundColor;
	}
	set groundColor(v) {
		this.component.properties.groundColor = v;
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
		if (!this.__setup) this.setup();
		else this.updateLight();
	}
	
	setup() {
		const skyColor = new THREE.Color(Number(this.skyColor));
		const groundColor = new THREE.Color(Number(this.groundColor));
		const hemi = new THREE.HemisphereLight(
			skyColor,
			groundColor,
			this.intensity
		);
		this.d3dobject.replaceObject3D(hemi);
	
		const scene = this.d3dobject.root.object3d;
		const _pos = new THREE.Vector3();
		const _dir = new THREE.Vector3(0, -1, 0); // Hemisphere lights "downward" by default
		const DIST = 1;
	
		const updatePosition = () => {
			if (!this.component.enabled) return;
			hemi.updateMatrixWorld(true);
	
			// Get world position of the light
			hemi.getWorldPosition(_pos);
	
			// Optional: orient the hemisphere direction based on the light's transform
			const worldQuat = hemi.getWorldQuaternion(new THREE.Quaternion());
			_dir.set(0, -1, 0).applyQuaternion(worldQuat);
	
			// For visualization or directional correctness (not needed by three.js but consistent)
			hemi.position.copy(_pos);
			hemi.lookAt(_pos.clone().add(_dir.multiplyScalar(DIST)));
		};
		
		if(window._player)
			this.__onInternalEnterFrame = updatePosition;
		
		this.__setup = true;
	}
	
	updateLight() {
		if (!this.__setup) return;
		const light = this.d3dobject.object3d;
		light.color.set(Number(this.skyColor));
		light.groundColor.set(Number(this.groundColor));
		light.intensity = this.intensity;
	}
}