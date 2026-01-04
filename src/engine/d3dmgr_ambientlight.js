import * as THREE from 'three';

export default class HemisphereLightManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		this.__setup = false;

		this._pos = new THREE.Vector3();
		this._dir = new THREE.Vector3(0, -1, 0);
		this._quat = new THREE.Quaternion();
	}

	get skyColor() { return this.component.properties.skyColor; }
	set skyColor(v) { this.component.properties.skyColor = v; this.updateLight(); }

	get groundColor() { return this.component.properties.groundColor; }
	set groundColor(v) { this.component.properties.groundColor = v; this.updateLight(); }

	get intensity() { return this.component.properties.intensity; }
	set intensity(v) { this.component.properties.intensity = v; this.updateLight(); }

	updateComponent() {
		if (!this.__setup) this.setup();
	    this.updateLight();
	}

	setup() {
		const hemi = new THREE.HemisphereLight(
			new THREE.Color(Number(this.skyColor)),
			new THREE.Color(Number(this.groundColor)),
			this.intensity
		);

		this.d3dobject.replaceObject3D(hemi);
		this.__setup = true;
	}

	updateLight() {
		if(!this.d3dobject.enabled || !this.component.enabled || !this.__setup)
			return;

		const light = this.d3dobject.object3d;
		
		if(!light || !light.color)
			return;
		
		light.color.set(Number(this.skyColor));
		light.groundColor.set(Number(this.groundColor));
		light.intensity = this.intensity;
	}

	__onInternalEnterFrame() {
		if (!window._player || !this.__setup || !this.component.enabled)
			return;

		const light = this.d3dobject.object3d;

		light.updateMatrixWorld(true);
		light.getWorldPosition(this._pos);
		light.getWorldQuaternion(this._quat);

		this._dir.set(0, -1, 0).applyQuaternion(this._quat);

		light.position.copy(this._pos);
		light.lookAt(this._pos.clone().add(this._dir));
	}
	
	dispose() {
		const light = this.d3dobject?.object3d;
		if(!light || !light.isAmbientLight)
			return;
	
		if(light.parent)
			light.parent.remove(light);
	
		this.__setup = false;
	}
}