import * as THREE from 'three';
import D3DConsole from './d3dconsole.js';

export default class CharacterControllerManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.canJump = true;
		this.__setup = false;

		this._yaw      = 0;
		this._vy       = 0;
		this._air      = true;
		this._kcc      = null;
		this._collider = null;

		this._q = new THREE.Quaternion();

		this.d3dobject.addEventListener('reset', () => this.reset());
	}

	get moveSpeed() { return this.component.properties.moveSpeed; }
	set moveSpeed(v) { this.component.properties.moveSpeed = v; }

	get turnSpeed() { return this.component.properties.turnSpeed; }
	set turnSpeed(v) { this.component.properties.turnSpeed = v; }

	get jumpHeight() { return this.component.properties.jumpHeight; }
	set jumpHeight(v) { this.component.properties.jumpHeight = v; }

	get gravityStrength() { return this.component.properties.gravityStrength; }
	set gravityStrength(v) { this.component.properties.gravityStrength = v; }

	get cameraName() { return this.component.properties.cameraName; }
	set cameraName(v) { this.component.properties.cameraName = v; }

	get positionOnly() { return !!this.component.properties.positionOnly; }
	set positionOnly(v) { this.component.properties.positionOnly = !!v; }

	updateComponent() {
		if(!_physics?.ready)
			return;

		if(!window._player)
			return;

		if(!this.__setup)
			this.setup();
	}

	dispose() {
		this._kcc = null;
		this._collider = null;
		this.__setup = false;
	}

	setup() {
		this.__setup = true;
	}

	reset() {
		this._vy  = 0;
		this._air = false;

		this._yaw = this.d3dobject.rotation?.y || 0;
	}

	__onInternalEnterFrame() {
		if(!this.__setup || !_physics?.ready || !this.component.enabled)
			return;

		const props = this.component.properties || {};
		const moveSpeed       = Number(props.moveSpeed ?? 2);
		const turnSpeed       = Number(props.turnSpeed ?? 8);
		const jumpHeight      = Number(props.jumpHeight ?? 6);
		const gravityStrength = Number(props.gravityStrength ?? 1);
		const positionOnly    = !!props.positionOnly;

		const camera = this.camera ?? this.d3dobject.root.find(this.cameraName || 'camera');
		const forward = camera?.forward ?? this.d3dobject.forward;

		if(!camera && !this._noCameraWarning && _time.sinceStart > 0.5) {
			D3DConsole.warn(`[${this.d3dobject.name}] No camera referenced by character controller. The character won't know which way to face. It will default to local forward.`);
			this._noCameraWarning = true;
		}

		this._ensureController();

		if(window._editor && !this.d3dobject.getComponent('Rigidbody')) {
			this.d3dobject.addComponent('Rigidbody', { kind: 'kinematicPosition' });
		}

		const rbMgr = this.d3dobject.getComponent('Rigidbody');
		const rb = _physics.getBody(this.d3dobject);

		if(!rbMgr || !rb || !this._kcc || !this._collider)
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

		const rawLen = Math.hypot(mx, mz);

		let dirX = 0, dirZ = 0;
		let strength = 0;

		if(rawLen > 1e-6) {
			dirX = mx / rawLen;
			dirZ = mz / rawLen;
			strength = Math.min(rawLen, 1);
		}

		if(!positionOnly && strength > 1e-6) {
			const targetYaw = Math.atan2(dirX, dirZ);
			let delta = this._wrapAngle(targetYaw - this._yaw);

			const maxTurn = turnSpeed * dt;
			if(delta > maxTurn) delta = maxTurn;
			if(delta < -maxTurn) delta = -maxTurn;

			this._yaw = this._wrapAngle(this._yaw + delta);
		}

		const worldG = (_physics.world?.gravity?.y ?? -9.81);
		const g = worldG * gravityStrength;

		if(!this._air && (_input.getKeyDown('Space') && this.canJump)) {
			const v0 = Math.sqrt(Math.max(0, -2 * g * Math.max(0, jumpHeight)));
			this._vy = v0;
			this._air = true;
		}else{
			this._vy += g * dt;
		}

		const step = moveSpeed * dt * strength;
		const dx = (strength > 1e-6 ? dirX * step : 0);
		const dz = (strength > 1e-6 ? dirZ * step : 0);
		const dy = this._vy * dt;

		const currentPos = rb.translation();
		const mv = _physics.kccMove(this._kcc, this._collider, { x: dx, y: dy, z: dz }, rb);

		const nextPos = {
			x: currentPos.x + mv.x,
			y: currentPos.y + mv.y,
			z: currentPos.z + mv.z
		};

		if(dy < 0 && Math.abs(mv.y - dy) > 0.001) {
			this._air = false;
			this._vy = 0;
		}else
		if(dy > 0 && Math.abs(mv.y - dy) > 0.001) {
			this._vy = 0;
		}

		const rot = positionOnly
			? this._quatFromObjectWorld()
			: this._quatFromYaw(this._yaw);

		rbMgr.setTransform(nextPos, rot, false);
	}

	_quatFromObjectWorld() {
		const obj = this.d3dobject.object3d;
		obj.getWorldQuaternion(this._q);
		return { x: this._q.x, y: this._q.y, z: this._q.z, w: this._q.w };
	}

	_ensureController() {
		if(!this._collider) {
			const pack = _physics._bodies?.get?.(this.d3dobject.uuid);
			if(pack && pack.colliders && pack.colliders.length)
				this._collider = pack.colliders[0];
		}

		if(!this._kcc) {
			this._kcc = _physics.createKCC(0.02, 50, 50);
			this._kcc.enableAutostep(0.35, 0.35, true);
			this._kcc.enableSnapToGround(0.1);
		}
	}

	_wrapAngle(a) {
		while(a > Math.PI) a -= Math.PI * 2;
		while(a < -Math.PI) a += Math.PI * 2;
		return a;
	}

	_quatFromYaw(y) {
		const h = y * 0.5;
		return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
	}
}