export default function AmbientLightManager(d3dobject, component) {
	this.updateComponent = () => {
		if(!component.lightSetup)
			setupLight();
		else
			updateLight();
	}
	
	function setupLight() {
		const color = new THREE.Color(Number(component.properties.color));
		const light = new THREE.AmbientLight(
			color,
			component.properties.intensity
		);
		d3dobject.replaceObject3D(light);
		component.lightSetup = true;
	}
	function updateLight() {
		const light = d3dobject.object3d;
		light.color.set(Number(component.properties.color));
		light.intensity = component.properties.intensity;
	}
}