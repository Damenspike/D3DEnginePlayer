export default function SpotLightManager(d3dobject, component) {
	this.updateComponent = () => {
		if (!component.lightSetup)
			setupLight();
		else
			updateLight();
	}
	
	function setupLight() {
		const color = new THREE.Color(Number(component.properties.color));
		const light = new THREE.SpotLight(
			color,
			component.properties.intensity ?? 1,
			component.properties.distance ?? 0,   // 0 = infinite
			component.properties.angle ?? Math.PI / 3, // default 60°
			component.properties.penumbra ?? 0,   // 0 = hard edge
			component.properties.decay ?? 1       // 1 = physically correct
		);
		
		// important: add target object for direction
		light.target.position.set(
			component.properties.targetX ?? 0,
			component.properties.targetY ?? 0,
			component.properties.targetZ ?? 0
		);
		light.add(light.target);

		d3dobject.replaceObject3D(light);
		component.lightSetup = true;
	}
	
	function updateLight() {
		const light = d3dobject.object3d;
		light.color.set(Number(component.properties.color));
		light.intensity = component.properties.intensity ?? 1;
		light.distance = component.properties.distance ?? 0;
		light.angle = component.properties.angle ?? Math.PI / 3;
		light.penumbra = component.properties.penumbra ?? 0;
		light.decay = component.properties.decay ?? 1;
		
		light.target.position.set(
			component.properties.targetX ?? 0,
			component.properties.targetY ?? 0,
			component.properties.targetZ ?? 0
		);
	}
}