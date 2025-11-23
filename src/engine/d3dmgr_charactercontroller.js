import D3DConsole from './d3dconsole.js';

export default class CharacterControllerManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		
		this.inited = false;
		
		this.component._state = {
			yaw: 0,
			vy: 0,
			air: true,
			kcc: null,
			collider: null,
		};
		
		this.d3dobject.addEventListener('reset', () => this.reset());
		
		this._drive = () => {
			if (!_physics?.ready) 
				return;
				
			const props = this.component.properties || {};
			const moveSpeed       = Number(props.moveSpeed ?? 2);
			const turnSpeed       = Number(props.turnSpeed ?? 8);
			const jumpHeight      = Number(props.jumpHeight ?? 6);
			const gravityStrength = Number(props.gravityStrength ?? 1);
			
			const state = this.component._state;
			const camera = this.camera ?? this.d3dobject.root.find(this.cameraName || 'camera');
			const forward = camera?.forward ?? this.d3dobject.forward;
			
			if(!camera && !this._noCameraWarning && _time.sinceStart > 0.5) {
				D3DConsole.warn(`[${this.d3dobject.name}] No camera referenced by character controller. The character won't know which way to face. It will default to local forward.`);
				this._noCameraWarning = true;
			}
			
			this._ensureController(state);
			
			if (!this.d3dobject.getComponent('Rigidbody')) {
				this.d3dobject.addComponent('Rigidbody', { kind: 'kinematicPosition' });
			}
			
			const rbMgr = this.d3dobject.getComponent('Rigidbody');
			const rb = _physics.getBody(this.d3dobject);
			
			if (!rbMgr || !rb || !state.kcc || !state.collider) 
				return;
				
			const dt = _time.delta;
			
			let fx = forward.x, fz = forward.z;
			const fl = Math.hypot(fx, fz) || 1;
			fx /= fl; 
			fz /= fl;
			const rx = fz;
			const rz = -fx;
			
			const input = _input.getControllerAxis();
			let mx = fx * input.y + rx * input.x;
			let mz = fz * input.y + rz * input.x;
			const ml = Math.hypot(mx, mz);
			if (ml > 1e-6) { mx /= ml; mz /= ml; }
			
			if (ml > 1e-6) {
				const targetYaw = Math.atan2(mx, mz);
				let delta = this._wrapAngle(targetYaw - state.yaw);
				const maxTurn = turnSpeed * dt;
				if (delta > maxTurn) delta = maxTurn;
				if (delta < -maxTurn) delta = -maxTurn;
				state.yaw = this._wrapAngle(state.yaw + delta);
			}
			
			const worldG = (_physics.world?.gravity?.y ?? -9.81);
			const g = worldG * gravityStrength;
			
			if (!state.air && _input.getKeyDown('Space')) {
				const v0 = Math.sqrt(Math.max(0, -2 * g * Math.max(0, jumpHeight)));
				state.vy = v0;
				state.air = true;
			} else {
				state.vy += g * dt;
			}
			
			const dx = (ml > 1e-6 ? mx * moveSpeed * dt : 0);
			const dz = (ml > 1e-6 ? mz * moveSpeed * dt : 0);
			const dy = state.vy * dt;
			
			const currentPos = rb.translation();
			const mv = _physics.kccMove(state.kcc, state.collider, { x: dx, y: dy, z: dz }, rb);
			const nextPos = {
				x: currentPos.x + mv.x,
				y: currentPos.y + mv.y,
				z: currentPos.z + mv.z
			};
			
			if (dy < 0 && Math.abs(mv.y - dy) > 0.001) {
				state.air = false;
				state.vy = 0;
			} else if (dy > 0 && Math.abs(mv.y - dy) > 0.001) {
				state.vy = 0;
			}
			
			rbMgr.setTransform(nextPos, this._quatFromYaw(state.yaw), false);
			
			this.d3dobject.position = nextPos;
			this.d3dobject.rotation = { x: 0, y: state.yaw, z: 0 };
		};
	}

	get moveSpeed() {
		return this.component.properties.moveSpeed;
	}
	set moveSpeed(v) {
		this.component.properties.moveSpeed = v;
	}

	get turnSpeed() {
		return this.component.properties.turnSpeed;
	}
	set turnSpeed(v) {
		this.component.properties.turnSpeed = v;
	}

	get jumpHeight() {
		return this.component.properties.jumpHeight;
	}
	set jumpHeight(v) {
		this.component.properties.jumpHeight = v;
	}

	get gravityStrength() {
		return this.component.properties.gravityStrength;
	}
	set gravityStrength(v) {
		this.component.properties.gravityStrength = v;
	}
	
	get cameraName() {
		return this.component.properties.cameraName;
	}
	set cameraName(v) {
		this.component.properties.cameraName = v;
	}

	updateComponent() {
		if (!_physics?.ready) 
			return;
		if (!this.inited) this.setup();
	}

	dispose() {
		if (this.__onInternalEnterFrame === this._drive) {
			this.__onInternalEnterFrame = null;
		}
		this.component._state.kcc = null;
		this.component._state.collider = null;
		this.inited = false;
	}

	setup() {
		this.__onInternalEnterFrame = this._drive;
		this.inited = true;
	}
	
	reset() {
		const state = this.component._state;
		if (!state) return;
	
		// Kill vertical motion and mark grounded
		state.vy  = 0;
		state.air = false;
	
		// Re-sync yaw from current object rotation (state-only change)
		const rotY = this.d3dobject.rotation?.y || 0;
		state.yaw = rotY;
	
		// Optionally re-sync KCC to current body position (still pure controller state)
		const rb = _physics.getBody?.(this.d3dobject);
		if (state.kcc && rb && typeof state.kcc.setPosition === 'function') {
			const p = rb.translation();
			state.kcc.setPosition({ x: p.x, y: p.y, z: p.z });
		}
	}

	_ensureController(state) {
		if (!state.collider) {
			const pack = _physics._bodies?.get?.(this.d3dobject.uuid);
			if (pack && pack.colliders && pack.colliders.length) {
				state.collider = pack.colliders[0];
			}
		}
		if (!state.kcc) {
			state.kcc = _physics.createKCC(0.02, 50, 50);
			state.kcc.enableAutostep(0.35, 0.35, true);
			state.kcc.enableSnapToGround(0.1);
		}
	}

	_wrapAngle(a) {
		while (a > Math.PI) a -= Math.PI * 2;
		while (a < -Math.PI) a += Math.PI * 2;
		return a;
	}

	_quatFromYaw(y) {
		const h = y * 0.5;
		return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
	}
}