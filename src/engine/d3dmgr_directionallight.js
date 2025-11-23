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

	// ---- optional convenience getters (wire these from your UI if you want) ----
	get castShadow() { return !!this.component.properties.castShadow; }
	set castShadow(v) { this.component.properties.castShadow = !!v; this.updateLight(); }

	get shadowMapSize() { return this.component.properties.shadowMapSize ?? 2048; } // square map
	set shadowMapSize(v) { this.component.properties.shadowMapSize = v|0; this.updateLight(); }

	get shadowNear() { return this.component.properties.shadowNear ?? 0.5; }
	set shadowNear(v) { this.component.properties.shadowNear = +v; this.updateLight(); }

	get shadowFar() { return this.component.properties.shadowFar ?? 500; }
	set shadowFar(v) { this.component.properties.shadowFar = +v; this.updateLight(); }

	get shadowOrthoSize() { return this.component.properties.shadowOrthoSize ?? 50; } // half-extent
	set shadowOrthoSize(v) { this.component.properties.shadowOrthoSize = +v; this.updateLight(); }

	get shadowBias() { return this.component.properties.shadowBias ?? -0.0005; }
	set shadowBias(v) { this.component.properties.shadowBias = +v; this.updateLight(); }

	get shadowNormalBias() { return this.component.properties.shadowNormalBias ?? 0.02; }
	set shadowNormalBias(v) { this.component.properties.shadowNormalBias = +v; this.updateLight(); }

	get shadowRadius() { return this.component.properties.shadowRadius ?? 1.0; } // PCF blur hint
	set shadowRadius(v) { this.component.properties.shadowRadius = +v; this.updateLight(); }

	updateComponent() {
		if (!this.__setup) this.setup();
		else this.updateLight();
	}

	setup() {
		const c = this.component.properties;
		const color = new THREE.Color(Number(c.color));
		const light = new THREE.DirectionalLight(color, c.intensity);
		this.d3dobject.replaceObject3D(light);

		// --- try to ensure renderer has shadows on (best-effort, harmless if absent)
		try {
			const r = _host?.renderer3d || _host?.renderer || _root?.renderer; // adapt to your engine
			if (r && r.shadowMap && r.shadowMap.enabled !== true) {
				r.shadowMap.enabled = true;
				if (r.shadowMap.type == null) r.shadowMap.type = THREE.PCFSoftShadowMap;
			}
		} catch {}

		// --- hidden target that we keep in front of the light
		const scene = this.d3dobject.root.object3d;
		const target = new THREE.Object3D();
		target.name = '__dirLightTarget';
		target.visible = false;
		scene.add(target);
		light.target = target;

		// --- autorun: keep target in front using the light's forward
		const _pos = new THREE.Vector3();
		const _dir = new THREE.Vector3();
		const DIST = 100;

		const _camPos = new THREE.Vector3();
		
		const updateTarget = () => {
			if (!this.component.enabled) return;
		
			const cam = _host?.camera?.object3d;   // editor/player camera
			if (!cam) return;
		
			// Where do we want best shadows? Around the camera:
			cam.getWorldPosition(_camPos);
		
			// Light direction (world)
			light.getWorldDirection(_dir).normalize();
		
			// Center of shadow box = camera position (or offset)
			const center = _camPos;
		
			// Place the light some distance back along its direction
			// so the shadow box encloses the area around the camera.
			const distBack = this.shadowOrthoSize * 0.5; // tweak
			_pos.copy(center).addScaledVector(_dir, -distBack);
			light.position.copy(_pos);
		
			// Target = “look at” the center
			target.position.copy(center);
			target.updateMatrixWorld(true);
		
			light.updateMatrixWorld(true);
		};

		this.__onInternalEnterFrame = updateTarget;
		this.__setup = true;

		// --- initial shadow config
		this._applyShadowProps(light);
	}

	updateLight() {
		const c = this.component.properties;
		const light = this.d3dobject.object3d;
		if (!light) return;

		light.color.set(Number(c.color));
		light.intensity = c.intensity;

		this._applyShadowProps(light);
	}

	_applyShadowProps(light) {
		// read with fallbacks so this works even if you don't expose all props in the UI
		const cast            = this.castShadow;
		const mapSize         = Math.max(1, this.shadowMapSize|0);
		const near            = Math.max(0.001, +this.shadowNear);
		const far             = Math.max(near + 0.001, +this.shadowFar);
		const orthoHalfExtent = Math.max(0.001, +this.shadowOrthoSize);
		const bias            = +this.shadowBias;
		const normalBias      = +this.shadowNormalBias;
		const radius          = +this.shadowRadius;

		light.castShadow = cast;

		// map size (square)
		light.shadow.mapSize.set(mapSize, mapSize);

		// ortho shadow camera bounds
		const cam = light.shadow.camera;
		cam.near = near;
		cam.far  = far;
		cam.left   = -orthoHalfExtent;
		cam.right  =  orthoHalfExtent;
		cam.top    =  orthoHalfExtent;
		cam.bottom = -orthoHalfExtent;
		cam.updateProjectionMatrix();

		// acne/peter-panning
		light.shadow.bias = bias;
		light.shadow.normalBias = normalBias;

		// PCF blur hint (some shadow types respect this)
		if ('radius' in light.shadow) light.shadow.radius = radius;
	}
}