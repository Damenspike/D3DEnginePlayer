export default function CameraManager(d3dobject, component) {
	this.updateComponent = () => {
		if(!component.cameraSetup)
			setupCamera();
		else
			updateCamera();
	}
	
	function setupCamera() {
		const camera = new THREE.PerspectiveCamera(
			component.properties.fieldOfView || 75, 
			_root.manifest.width / _root.manifest.height,
			component.properties.clipNear || 0.1, 
			component.properties.clipFar || 1000
		);
		
		camera.position.set(
			d3dobject.position.x,
			d3dobject.position.y,
			d3dobject.position.z
		);
		camera.rotation.set(
			d3dobject.rotation.x,
			d3dobject.rotation.y,
			d3dobject.rotation.z
		);
		camera.scale.set(
			d3dobject.scale.x,
			d3dobject.scale.y,
			d3dobject.scale.z
		);
		
		d3dobject.replaceObject3D(camera);
		component.cameraSetup = true;
	}
	function updateCamera() {
		const camera = d3dobject.object3d;
		
		camera.fieldOfView = component.properties.fieldOfView;
		camera.clipNear = component.properties.clipNear;
		camera.clipFar = component.properties.clipFar;
	}
}