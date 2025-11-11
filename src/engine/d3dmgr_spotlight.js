import * as THREE from 'three';

export default class SpotLightManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		this.__setup = false;
	}

	get color() { return this.component.properties.color; }
	set color(v) { this.component.properties.color = v; this.updateLight(); }

	get intensity() { return this.component.properties.intensity; }
	set intensity(v) { this.component.properties.intensity = v; this.updateLight(); }

	get distance() { return this.component.properties.distance; }
	set distance(v) { this.component.properties.distance = v; this.updateLight(); }

	get angle() { return this.component.properties.angle; }
	set angle(v) { this.component.properties.angle = v; this.updateLight(); }

	get penumbra() { return this.component.properties.penumbra; }
	set penumbra(v) { this.component.properties.penumbra = v; this.updateLight(); }

	get decay() { return this.component.properties.decay; }
	set decay(v) { this.component.properties.decay = v; this.updateLight(); }

	get castShadow() { return !!this.component.properties.castShadow; }
	set castShadow(v) { this.component.properties.castShadow = !!v; this.updateLight(); }

	updateComponent() {
		if (!this.__setup) this.setup();
		else this.updateLight();
	}

	setup() {
		const c = this.component.properties;
		const color = new THREE.Color(Number(c.color));

		const light = new THREE.SpotLight(
			color,
			c.intensity ?? 1,
			c.distance ?? 10,
			THREE.MathUtils.degToRad(c.angle ?? 45),
			c.penumbra ?? 0,
			c.decay ?? 1
		);

		// === SHADOW SETUP ===
		if (c.castShadow) {
			light.castShadow = true;
			light.shadow.mapSize.width = c.shadowMapSize ?? 1024;
			light.shadow.mapSize.height = c.shadowMapSize ?? 1024;
			light.shadow.bias = c.shadowBias ?? -0.0005;
			light.shadow.normalBias = c.shadowNormalBias ?? 0.02;
			light.shadow.radius = c.shadowRadius ?? 1.0;
			light.shadow.camera.near = c.shadowNear ?? 0.5;
			light.shadow.camera.far = c.shadowFar ?? (c.distance || 50);
			light.shadow.camera.fov = c.shadowFov ?? (c.angle ?? 45);
		} else {
			light.castShadow = false;
		}

		// Create internal target and add to scene root
		const scene = _root.object3d;
		const target = new THREE.Object3D();
		target.name = '__spotLightTarget';
		target.visible = false;
		scene.add(target);
		light.target = target;

		this.d3dobject.replaceObject3D(light);

		const _pos = new THREE.Vector3();
		const _dir = new THREE.Vector3();

		const updateTarget = () => {
			if (!this.component.enabled) return;
			const dist = this.component.properties.distance ?? 10;
			light.updateMatrixWorld(true);
			light.getWorldPosition(_pos);
			this.d3dobject.object3d.getWorldDirection(_dir);
			target.position.copy(_pos).addScaledVector(_dir, dist);
			target.updateMatrixWorld(true);
		};

		this.__onInternalEnterFrame = updateTarget;
		this.__setup = true;
	}

	updateLight() {
		const c = this.component.properties;
		const light = this.d3dobject.object3d;

		if (!light) return;

		light.color.set(Number(c.color));
		light.intensity = c.intensity ?? 1;
		light.distance = c.distance ?? 10;
		light.angle = THREE.MathUtils.degToRad(c.angle ?? 45);
		light.penumbra = c.penumbra ?? 0;
		light.decay = c.decay ?? 1;

		// === SHADOW UPDATE ===
		light.castShadow = !!c.castShadow;
		if (light.castShadow) {
			light.shadow.mapSize.width = c.shadowMapSize ?? 1024;
			light.shadow.mapSize.height = c.shadowMapSize ?? 1024;
			light.shadow.bias = c.shadowBias ?? -0.0005;
			light.shadow.normalBias = c.shadowNormalBias ?? 0.02;
			light.shadow.radius = c.shadowRadius ?? 1.0;
			light.shadow.camera.near = c.shadowNear ?? 0.5;
			light.shadow.camera.far = c.shadowFar ?? (c.distance || 50);
			light.shadow.camera.fov = c.shadowFov ?? (c.angle ?? 45);
		}
	}
}