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

	get castShadow() {
		return !!this.component.properties.castShadow;
	}
	set castShadow(v) {
		this.component.properties.castShadow = !!v;
		this.updateLight();
	}

	updateComponent() {
		if (!this.__setup) this.setup();
		this.updateLight();
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

		// --- Shadow setup ---
		if (c.castShadow) {
			light.castShadow = true;
			light.shadow.mapSize.width = c.shadowMapSize ?? 1024;
			light.shadow.mapSize.height = c.shadowMapSize ?? 1024;
			light.shadow.bias = c.shadowBias ?? -0.0005;
			light.shadow.normalBias = c.shadowNormalBias ?? 0.02;
			light.shadow.radius = c.shadowRadius ?? 1.0;
			light.shadow.camera.near = c.shadowNear ?? 0.5;
			light.shadow.camera.far = c.shadowFar ?? (c.distance || 500);
			
			light.shadow.camera.updateProjectionMatrix();
			light.shadow.needsUpdate = true;
		} else {
			light.castShadow = false;
		}

		this.d3dobject.replaceObject3D(light);
		this.__setup = true;
	}

	updateLight() {
		if(!this.d3dobject.enabled || !this.component.enabled || !this.__setup)
			return;
		
		const c = this.component.properties;
		const light = this.d3dobject.object3d;
		
		if(!light || !light.color)
			return;
	
		light.color.set(Number(c.color));
		light.intensity = c.intensity ?? 1;
		light.distance = c.distance ?? 0;
		light.decay = c.decay ?? 1;
	
		const wantShadow = !!c.castShadow;
		const hadShadow = !!light.castShadow;
	
		light.castShadow = wantShadow;
	
		if (wantShadow) {
			light.shadow.mapSize.width = c.shadowMapSize ?? 1024;
			light.shadow.mapSize.height = c.shadowMapSize ?? 1024;
			light.shadow.bias = c.shadowBias ?? -0.0005;
			light.shadow.normalBias = c.shadowNormalBias ?? 0.02;
			light.shadow.radius = c.shadowRadius ?? 1.0;
			light.shadow.camera.near = c.shadowNear ?? 0.5;
			light.shadow.camera.far = c.shadowFar ?? (c.distance || 500);
	
			// if we just turned shadows on, force fresh allocation
			if(!hadShadow && light.shadow?.map) {
				light.shadow.map.dispose();
				light.shadow.map = null;
			}
	
			light.shadow.camera.updateProjectionMatrix();
			light.shadow.needsUpdate = true;
		}
	}
	
	dispose() {
		const light = this.d3dobject?.object3d;
		if (!light || !light.isPointLight)
			return;
	
		// Dispose shadow map if it exists
		if (light.shadow?.map) {
			light.shadow.map.dispose();
			light.shadow.map = null;
		}
	
		// Detach from scene graph (replaceObject3D usually handled this, but be safe)
		if (light.parent)
			light.parent.remove(light);
			
		this.__setup = false;
	}
}