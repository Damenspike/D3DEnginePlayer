import * as THREE from 'three';
import D3DConsole from './d3dconsole.js';

export default class FirstPersonCharacterControllerManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component  = component;

		this._inited = false;

		// KCC + vertical state (local to this component)
		this.component._state = {
			kcc:      null,
			collider: null,
			vy:       0,
			air:      true
		};
		
		this.d3dobject.addEventListener('reset', () => this.reset());

		this._drive = () => {
			if (!this.component.enabled)
				return;
			if (!_physics?.ready)
				return;

			const p = this.component.properties || {};
			const moveSpeed       = Number(p.moveSpeed       ?? 3);
			const jumpHeight      = Number(p.jumpHeight      ?? 6);
			const gravityStrength = Number(p.gravityStrength ?? 1);

			const dt = _time.delta;
			if (!dt || dt <= 0) return;

			// Ensure Rigidbody + KCC setup
			const state = this.component._state;
			const camera = this.camera ?? this.d3dobject.root.find(this.cameraName || 'camera');
			this._ensureRigidbody(state);

			const rbMgr = this.d3dobject.getComponent('Rigidbody');
			const rb    = _physics.getBody?.(this.d3dobject);
			if (!rbMgr || !rb) return;

			this._ensureController(state);
			if (!state.kcc || !state.collider) return;

			const obj = this.d3dobject.object3d;

			const axis = _input.getControllerAxis
				? _input.getControllerAxis()
				: { x: 0, y: 0 }; // fallback

			// Get forward from current body rotation (camera manager should already have set this)
			const worldForward = camera.forward;

			// Horizontal forward (ignore pitch)
			let fx = worldForward.x;
			let fz = worldForward.z;
			const fl = Math.hypot(fx, fz) || 1;
			fx /= fl;
			fz /= fl;

			// Right vector on horizontal plane
			const rx =  fz;
			const rz = -fx;

			// axis.y = forward/back, axis.x = strafe
			let mx = fx * axis.y + rx * axis.x;
			let mz = fz * axis.y + rz * axis.x;

			// Invert controls if requested
			if (this.invertFwd)
				mx = -mx;
			if (this.invertHoriz)
				mz = -mz;

			// Normalise to avoid faster diagonals
			const ml = Math.hypot(mx, mz);
			if (ml > 1e-6) {
				mx /= ml;
				mz /= ml;
			}

			const step   = moveSpeed * dt;
			const dxMove = ml > 1e-6 ? mx * step : 0;
			const dzMove = ml > 1e-6 ? mz * step : 0;

			// ----- Gravity + Jump (same pattern as CharacterControllerManager) -----
			const worldG = (_physics.world?.gravity?.y ?? -9.81); // usually negative
			const g      = worldG * gravityStrength;

			if (!state.air && _input.getKeyDown('Space')) {
				const h  = Math.max(0, jumpHeight);
				const v0 = Math.sqrt(Math.max(0, -2 * g * h));
				state.vy = v0;
				state.air = true;
			} else {
				state.vy += g * dt;
			}

			const dyMove = state.vy * dt;

			// Desired motion this frame (includes vertical)
			const desired = { x: dxMove, y: dyMove, z: dzMove };

			const currentPos = rb.translation();
			const mv = _physics.kccMove(
				state.kcc,
				state.collider,
				desired,
				rb
			);

			const nextPos = {
				x: currentPos.x + mv.x,
				y: currentPos.y + mv.y,
				z: currentPos.z + mv.z
			};

			// Ground / ceiling detection via comparison with desired y
			if (dyMove < 0 && Math.abs(mv.y - dyMove) > 0.001) {
				state.air = false;
				state.vy  = 0;
			} else if (dyMove > 0 && Math.abs(mv.y - dyMove) > 0.001) {
				state.vy = 0;
			} else {
				state.air = true;
			}

			// Use current body orientation (camera already drove rotation)
			const q = obj.quaternion;
			rbMgr.setTransform(
				nextPos, 
				{ x: q.x, y: q.y, z: q.z, w: q.w },
				false
			);
		};
	}

	// ---------- Property helpers ----------

	get moveSpeed() { return this.component.properties.moveSpeed; }
	set moveSpeed(v) { this.component.properties.moveSpeed = v; }
	
	get invertFwd() { return !!this.component.properties.invertFwd; }
	set invertFwd(v) { this.component.properties.invertFwd = !!v; }
	
	get invertHoriz() { return !!this.component.properties.invertHoriz; }
	set invertHoriz(v) { this.component.properties.invertHoriz = !!v; }

	get jumpHeight() { return this.component.properties.jumpHeight; }
	set jumpHeight(v) { this.component.properties.jumpHeight = v; }

	get gravityStrength() { return this.component.properties.gravityStrength; }
	set gravityStrength(v) { this.component.properties.gravityStrength = v; }

	get cameraName() {
		return this.component.properties.cameraName;
	}
	set cameraName(v) {
		this.component.properties.cameraName = v;
	}

	// ---------- Lifecycle ----------

	updateComponent() {
		if (!this._inited)
			this.setup();
	}

	dispose() {
		if (this.__onInternalEnterFrame === this._drive)
			this.__onInternalEnterFrame = null;
		this._inited = false;

		const s = this.component._state;
		if (s) {
			s.kcc      = null;
			s.collider = null;
		}
	}

	setup() {
		if (!window._player)
			return;

		this.__onInternalEnterFrame = this._drive;
		this._inited = true;
	}
	
	reset() {
		const state = this.component._state;
		if (!state) return;
	
		// Kill vertical motion and say we're grounded again
		state.vy  = 0;
		state.air = false;
	
		// Re-sync KCC to the current body position, if possible
		const rb = _physics.getBody?.(this.d3dobject);
		if (state.kcc && rb && typeof state.kcc.setPosition === 'function') {
			const p = rb.translation();
			state.kcc.setPosition({ x: p.x, y: p.y, z: p.z });
		}
	}

	// ---------- Internal helpers ----------

	_ensureRigidbody(state) {
		// Auto-create kinematic rigidbody if missing
		let rbComp = this.d3dobject.getComponent('Rigidbody');
		if (!rbComp) {
			this.d3dobject.addComponent('Rigidbody', { kind: 'kinematicPosition' });
			rbComp = this.d3dobject.getComponent('Rigidbody');
		}
	}

	_ensureController(state) {
		// Get first collider for this body
		if (!state.collider) {
			const pack = _physics._bodies?.get?.(this.d3dobject.uuid);
			if (pack && pack.colliders && pack.colliders.length) {
				state.collider = pack.colliders[0];
			}
		}
		// Create KCC if missing
		if (!state.kcc) {
			state.kcc = _physics.createKCC(0.02, 50, 50);
			state.kcc.enableAutostep(0.35, 0.35, true);
			state.kcc.enableSnapToGround(0.1);
		}
	}
}