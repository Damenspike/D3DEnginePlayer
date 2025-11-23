import * as THREE from 'three';
import D3DConsole from './d3dconsole.js';

export default class FirstPersonCameraManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component  = component;

		this._yaw    = 0;
		this._pitch  = 0;
		this._inited = false;

		// Reusable Euler (YXZ order avoids roll)
		this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

		this._drive = () => {
			if (!this.component.enabled)
				return;

			const p = this.component.properties || {};
			const rotateSpeed = Number(p.rotateSpeed ?? 1) * 0.002;
			const invertX     = !!p.invertX;
			const invertY     = !!p.invertY;

			// Pitch limits
			const minPitchDeg = Number(p.minPitchDeg ?? -80);
			const maxPitchDeg = Number(p.maxPitchDeg ??  80);
			const MIN_PITCH   = THREE.MathUtils.degToRad(minPitchDeg);
			const MAX_PITCH   = THREE.MathUtils.degToRad(maxPitchDeg);

			const mouse = _input.getMouseDelta();

			// ----- ROTATION INPUT -----
			let dx = mouse.x * rotateSpeed;
			let dy = mouse.y * rotateSpeed;

			if (invertX) dx = -dx;
			if (invertY) dy = -dy;

			// FPS-style rotation: yaw around world-up, pitch around local X
			this._yaw   -= dx;
			this._pitch -= dy;

			// Clamp pitch
			this._pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this._pitch));

			// Wrap yaw
			if (this._yaw >  Math.PI) this._yaw -= Math.PI * 2;
			if (this._yaw < -Math.PI) this._yaw += Math.PI * 2;

			// Apply via YXZ euler to avoid roll
			this._euler.set(this._pitch, this._yaw, 0, 'YXZ');
			const obj = this.d3dobject.object3d;
			obj.quaternion.setFromEuler(this._euler);
		};
	}

	// ---------- Property helpers ----------

	get rotateSpeed() { return this.component.properties.rotateSpeed; }
	set rotateSpeed(v) { this.component.properties.rotateSpeed = v; }

	get invertX() { return !!this.component.properties.invertX; }
	set invertX(v) { this.component.properties.invertX = !!v; }

	get invertY() { return !!this.component.properties.invertY; }
	set invertY(v) { this.component.properties.invertY = !!v; }

	get mouseLock() { return this.component.properties.mouseLock; }
	set mouseLock(v) { this.component.properties.mouseLock = !!v; }

	get minPitchDeg() { return this.component.properties.minPitchDeg; }
	set minPitchDeg(v) { this.component.properties.minPitchDeg = v; }

	get maxPitchDeg() { return this.component.properties.maxPitchDeg; }
	set maxPitchDeg(v) { this.component.properties.maxPitchDeg = v; }

	get advancedControls() { return !!this.component.properties.advancedControls; }
	set advancedControls(v) { this.component.properties.advancedControls = !!v; }

	// ---------- Lifecycle ----------

	updateComponent() {
		if (!this._inited)
			this.setup();
	}

	dispose() {
		if (this.__onInternalEnterFrame === this._drive)
			this.__onInternalEnterFrame = null;
		this._inited = false;
	}

	setup() {
		if (!window._player)
			return;

		const p = this.component.properties || {};
		if (p.mouseLock !== false) {
			_input.mouseLock = true;
		}

		// Initialise from existing camera orientation
		const obj = this.d3dobject.object3d;
		this._euler.copy(obj.rotation);
		this._euler.order = 'YXZ';

		this._yaw   = this._euler.y;
		this._pitch = this._euler.x;

		this.__onInternalEnterFrame = this._drive;
		this._inited = true;
	}
}