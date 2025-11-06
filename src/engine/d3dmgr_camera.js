export default class CameraManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
	}

	get fieldOfView() {
		return this.component.properties?.fieldOfView;
	}
	set fieldOfView(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.fieldOfView = v;
		this.updateCamera();
	}

	get clipNear() {
		return this.component.properties?.clipNear;
	}
	set clipNear(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.clipNear = v;
		this.updateCamera();
	}

	get clipFar() {
		return this.component.properties?.clipFar;
	}
	set clipFar(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.clipFar = v;
		this.updateCamera();
	}

	updateComponent() {
		if (!this.__setup) 
			this.setup();
		else 
			this.updateCamera();
	}
	
	setup() {
		const camera = new THREE.PerspectiveCamera(
			this.component.properties.fieldOfView || 75, 
			_root.manifest.width / _root.manifest.height,
			this.component.properties.clipNear || 0.1, 
			this.component.properties.clipFar || 1000
		);
		
		camera.position.set(
			this.d3dobject.position.x,
			this.d3dobject.position.y,
			this.d3dobject.position.z
		);
		camera.rotation.set(
			this.d3dobject.rotation.x,
			this.d3dobject.rotation.y,
			this.d3dobject.rotation.z
		);
		camera.scale.set(
			this.d3dobject.scale.x,
			this.d3dobject.scale.y,
			this.d3dobject.scale.z
		);
		
		this.d3dobject.replaceObject3D(camera);
		this.__setup = true;
	}

	updateCamera() {
		const camera = this.d3dobject.object3d;
		
		camera.fieldOfView = this.component.properties.fieldOfView;
		camera.clipNear = this.component.properties.clipNear;
		camera.clipFar = this.component.properties.clipFar;
	}
}