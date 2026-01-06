import * as THREE from 'three';
import D3DConsole from './d3dconsole.js';

export default class FirstPersonCameraManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this._yaw = 0;
		this._pitch = 0;
		this.__setup = false;

		this._yawV = 0;
		this._pitchV = 0;

		this._yawTarget = 0;
		this._pitchTarget = 0;

		this._noTargetWarning = false;

		this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

		this._initAngles = false;
	}

	get targetName() { return this.component.properties.targetName; }
	set targetName(v) { this.component.properties.targetName = v; }

	get targetOffset() { return this.component.properties.targetOffset; }
	set targetOffset(v) {
		v = {
			x: v?.x || 0,
			y: v?.y || 0,
			z: v?.z || 0
		}
		this.component.properties.targetOffset = v;
	}

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

	get useWorldTargetPosition() { return !!this.component.properties.useWorldTargetPosition; }
	set useWorldTargetPosition(v) { this.component.properties.useWorldTargetPosition = !!v; }

	get advancedControls() { return !!this.component.properties.advancedControls; }
	set advancedControls(v) { this.component.properties.advancedControls = !!v; }

	get smoothRotate() { return !!this.component.properties.smoothRotate; }
	set smoothRotate(v) { this.component.properties.smoothRotate = !!v; }

	get damping() { return Number(this.component.properties.damping) ?? 1; }
	set damping(v) { this.component.properties.damping = Number(v); }

	updateComponent() {
		if(!this.__setup)
			this.setup();
	}

	dispose() {
		this.__setup = false;
	}

	setup() {
		if(!window._player)
			return;
	
		const p = this.component.properties;
		if(p.mouseLock !== false)
			_input.mouseLock = true;
	
		if(!this._initAngles) {
			const obj = this.d3dobject.object3d;
			this._euler.copy(obj.rotation);
			this._euler.order = 'YXZ';
	
			this._yaw = this._euler.y;
			this._pitch = this._euler.x;
	
			this._yawTarget = this._yaw;
			this._pitchTarget = this._pitch;
	
			this._yawV = 0;
			this._pitchV = 0;
	
			this._initAngles = true;
		}else{
			this._euler.set(this._pitch, this._yaw, 0, 'YXZ');
			this.d3dobject.quaternion.setFromEuler(this._euler);
			this.d3dobject.object3d.updateMatrixWorld(true);
		}
	
		this.__setup = true;
	}

	__onInternalBeforeRender() {
		if(!window._player || !this.component.enabled)
			return;

		if(!this.__setup)
			this.setup();

		const p = this.component.properties;
		const target = this.target ?? this.d3dobject.root.find(p.targetName);

		if(target) {
			if(!p.useWorldTargetPosition) {
				this.d3dobject.position.copy(target.position.clone().add(this.targetOffset));
			}else{
				const w = target.worldPosition.clone().add(this._targetOffsetWorld(target));
				this.d3dobject.worldPosition = w;
			}
		}else
		if(p.targetName && this.d3dobject.parent == this.d3dobject.root && !this._noTargetWarning) {
			D3DConsole.warn(`[${this.d3dobject.name}] No target referenced by first person camera.`);
			this._noTargetWarning = true;
		}

		const rotateSpeed = Number(p.rotateSpeed ?? 1) * 0.002;
		const invertX = !!p.invertX;
		const invertY = !!p.invertY;

		const minPitchDeg = Number(p.minPitchDeg ?? -80);
		const maxPitchDeg = Number(p.maxPitchDeg ?? 80);
		const MIN_PITCH = THREE.MathUtils.degToRad(minPitchDeg);
		const MAX_PITCH = THREE.MathUtils.degToRad(maxPitchDeg);

		const mouse = _input.getMouseDelta();

		let dx = mouse.x * rotateSpeed;
		let dy = mouse.y * rotateSpeed;

		if(invertX) dx = -dx;
		if(invertY) dy = -dy;

		if(!this._initAngles) {
			this._syncFromWorldForward();
			this._initAngles = true;
		}

		this._yawTarget -= dx;
		this._pitchTarget -= dy;

		this._pitchTarget = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this._pitchTarget));
		this._yawTarget = this._wrapAngle(this._yawTarget);

		const smoothRotate = !!p.smoothRotate;
		const damping = Number(p.damping ?? 1);

		if(smoothRotate) {
			const damp = Math.max(0.0001, damping);
			const smoothTime = damp / 10;

			this._yaw = this._smoothDampAngle(this._yaw, this._yawTarget, '_yawV', smoothTime, 9999, _time.delta);
			this._pitch = this._smoothDamp(this._pitch, this._pitchTarget, '_pitchV', smoothTime, 9999, _time.delta);
		}else{
			this._yaw = this._yawTarget;
			this._pitch = this._pitchTarget;

			this._yawV = 0;
			this._pitchV = 0;
		}

		this._pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this._pitch));
		this._yaw = this._wrapAngle(this._yaw);

		this._euler.set(this._pitch, this._yaw, 0, 'YXZ');
		this.d3dobject.quaternion.setFromEuler(this._euler);
		this.d3dobject.object3d.updateMatrixWorld(true);
	}

	_targetOffsetWorld(target) {
		const o = new THREE.Vector3(
			Number(this.targetOffset?.x) || 0,
			Number(this.targetOffset?.y) || 0,
			Number(this.targetOffset?.z) || 0
		);
		return target ? target.localDirToWorld(o) : o;
	}

	_syncFromWorldForward() {
		const f = this.d3dobject.forward;

		const yaw = Math.atan2(-f.x, -f.z);
		const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));

		this._yaw = yaw;
		this._pitch = pitch;
		this._yawTarget = yaw;
		this._pitchTarget = pitch;

		this._yawV = 0;
		this._pitchV = 0;

		this._initAngles = true;
	}

	_wrapAngle(a) {
		while(a > Math.PI) a -= Math.PI * 2;
		while(a < -Math.PI) a += Math.PI * 2;
		return a;
	}

	_smoothDampAngle(current, target, vKey, smoothTime, maxSpeed, dt) {
		target = current + this._wrapAngle(target - current);
		return this._smoothDamp(current, target, vKey, smoothTime, maxSpeed, dt);
	}

	_smoothDamp(current, target, vKey, smoothTime, maxSpeed, dt) {
		smoothTime = Math.max(0.0001, smoothTime);
		const omega = 2 / smoothTime;

		const x = omega * dt;
		const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

		let change = current - target;

		const maxChange = maxSpeed * smoothTime;
		if(change > maxChange) change = maxChange;
		if(change < -maxChange) change = -maxChange;

		const tempTarget = current - change;

		let v = this[vKey] || 0;
		const temp = (v + omega * change) * dt;
		v = (v - omega * temp) * exp;

		let output = tempTarget + (change + temp) * exp;

		const origToTarget = target - current;
		const outToTarget = target - output;
		if(origToTarget > 0 && outToTarget < 0) {
			output = target;
			v = 0;
		}else
		if(origToTarget < 0 && outToTarget > 0) {
			output = target;
			v = 0;
		}

		this[vKey] = v;
		return output;
	}

	getThirdPersonYawPitch() {
		const yaw = this._wrapAngle(Math.PI - this._yawTarget);
		const pitch = this._pitchTarget;
		return { yaw, pitch };
	}

	setYawPitch(yaw, pitch) {
		this._yawTarget = this._wrapAngle(Number(yaw) || 0);
		this._pitchTarget = Number(pitch) || 0;

		this._yaw = this._yawTarget;
		this._pitch = this._pitchTarget;

		this._yawV = 0;
		this._pitchV = 0;

		this._initAngles = true;

		this._euler.set(this._pitch, this._yaw, 0, 'YXZ');
		this.d3dobject.quaternion.setFromEuler(this._euler);
		this.d3dobject.object3d.updateMatrixWorld(true);
	}
}