export default function AmbientLightManager(d3dobject, component) {
	this.updateComponent = () => {
		if(!component.lightSetup)
			setupLight();
		else
			updateLight();
	}
	
	const setupLight = () => {
		const color = new THREE.Color(Number(component.properties.color));
		const light = new THREE.DirectionalLight(color, component.properties.intensity);
		
		d3dobject.replaceObject3D(light); // attaches the light to your scene graph
		
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
			if(!component.enabled) 
				return;
			
			light.updateMatrixWorld(true);
			light.getWorldPosition(_pos);
			light.getWorldDirection(_dir);
			
			_dir.multiplyScalar(DIST);
			
			target.position.copy(_pos).add(_dir);
			target.updateMatrixWorld(true);
		};
		
		this.__onInternalEnterFrame = updateTarget;
		
		component.lightSetup = true;
	}
	const updateLight = () => {
		const light = d3dobject.object3d;
		light.color.set(Number(component.properties.color));
		light.intensity = component.properties.intensity;
	}
}