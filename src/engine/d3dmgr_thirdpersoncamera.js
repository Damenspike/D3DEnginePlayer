import * as THREE from 'three';
import D3DConsole from './d3dconsole.js';

const MIN_PITCH = -Math.PI * 0.45;
const MAX_PITCH =  Math.PI * 0.45;

export default class ThirdPersonCameraManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.distanceMultiplier = 1;
		this._yaw = 0;
		this._pitch = 0;
		this._distance = Number(this.component?.properties?.distance ?? 1);

		this._yawV = 0;
		this._pitchV = 0;
		this._distV = 0;

		this._yawTarget = this._yaw;
		this._pitchTarget = this._pitch;
		this._distanceTarget = this._distance;

		this.__setup = false;
		this._noTargetWarning = false;
		this._firstRan = false;
		this._initAngles = false;
	}

	get targetName() {
		return this.component.properties.targetName;
	}
	set targetName(v) {
		this.component.properties.targetName = v;
	}

	get rotateSpeed() {
		return Number(this.component.properties.rotateSpeed ?? 1);
	}
	set rotateSpeed(v) {
		this.component.properties.rotateSpeed = Number(v);
	}

	get zoomSpeed() {
		return Number(this.component.properties.zoomSpeed ?? 1);
	}
	set zoomSpeed(v) {
		this.component.properties.zoomSpeed = Number(v);
	}

	get minDist() {
		return Number(this.component.properties.minDist ?? 0.25);
	}
	set minDist(v) {
		this.component.properties.minDist = Number(v);
	}

	get maxDist() {
		return Number(this.component.properties.maxDist ?? 6.0);
	}
	set maxDist(v) {
		this.component.properties.maxDist = Number(v);
	}

	get height() {
		return Number(this.component.properties.height ?? 0.5);
	}
	set height(v) {
		this.component.properties.height = Number(v);
	}

	get targetOffset() {
		return this.component.properties.targetOffset;
	}
	set targetOffset(v) {
		this.component.properties.targetOffset = v;
	}

	get distance() {
		return Number(this.component.properties.distance ?? 1);
	}
	set distance(v) {
		this.component.properties.distance = Number(v);
	}

	get allowScroll() {
		return this.component.properties.allowScroll !== false;
	}
	set allowScroll(v) {
		this.component.properties.allowScroll = !!v;
	}

	get smoothRotate() {
		return !!this.component.properties.smoothRotate;
	}
	set smoothRotate(v) {
		this.component.properties.smoothRotate = !!v;
	}

	get damping() {
		return Number(this.component.properties.damping ?? 1);
	}
	set damping(v) {
		this.component.properties.damping = Number(v);
	}

	updateComponent() {
		if(!this.__setup)
			this.setup();

		const desiredDist = Number(this.distance);
		if(!Number.isNaN(desiredDist)) {
			this._distance = desiredDist;
			this._distanceTarget = desiredDist;
		}

		this._firstRan = true;
	}

	dispose() {
		this.__setup = false;
	}

	setup() {
		if(!window._player)
			return;

		_input.mouseLock = true;

		if(!this._initAngles) {
			this._syncFromWorldForward();
			this._initAngles = true;
		}else{
			this._yaw = this._yawTarget;
			this._pitch = this._pitchTarget;

			this._yawV = 0;
			this._pitchV = 0;
		}

		this.__setup = true;
	}

	__onInternalBeforeRender() {
		if(!this.__setup || !this.component.enabled)
			return;

		const target = this.target ?? this.d3dobject.root.find(this.targetName);

		if(!target && !this._noTargetWarning && !this._firstRan) {
			D3DConsole.warn(`[${this.d3dobject.name}] No target referenced by third person camera.`);
			this._noTargetWarning = true;
		}

		if(!this._initAngles) {
			this._syncFromWorldForward();
			this._distanceTarget = this._distance;
			this._initAngles = true;
		}

		this.updatePitchYaw();

		const wheel = _input.getWheelDelta();

		if(this.allowScroll) {
			this._distanceTarget += wheel.y * (this.zoomSpeed * 0.002);
			if(this._distanceTarget < this.minDist) this._distanceTarget = this.minDist;
			if(this._distanceTarget > this.maxDist) this._distanceTarget = this.maxDist;
		}

		if(this.smoothRotate) {
			const smoothTime = Math.max(0.0001, this.damping) / 10;
			this._distance = this._smoothDamp(this._distance, this._distanceTarget, '_distV', smoothTime, 9999, _time.delta);
		}else{
			this._distance = this._distanceTarget;
			this._distV = 0;
		}

		if(this._distance < this.minDist) this._distance = this.minDist;
		if(this._distance > this.maxDist) this._distance = this.maxDist;

		const fx = Math.sin(-this._yaw) * Math.cos(this._pitch);
		const fy = Math.sin(this._pitch);
		const fz = Math.cos(-this._yaw) * Math.cos(this._pitch);

		const focus = target ? target.worldPosition.clone() : new THREE.Vector3();

		const targetOffset = new THREE.Vector3(
			Number(this.targetOffset?.x) || 0,
			Number(this.targetOffset?.y) || 0,
			Number(this.targetOffset?.z) || 0
		);
		const offsetDir = target ? target.localDirToWorld(targetOffset) : targetOffset;

		focus.add(offsetDir);

		const offset = new THREE.Vector3(fx, fy, fz).multiplyScalar(-this._distance * this.distanceMultiplier);
		const camPos = focus.clone().add(offset);

		camPos.y += this.height;

		this.d3dobject.worldPosition = camPos;
		this.d3dobject.lookAt(focus);

		this.d3dobject.object3d.updateMatrixWorld(true);
		this.d3dobject.getComponent('CameraCollision')?.updateCameraCollision();
	}

	updatePitchYaw() {
		const mouse = _input.getMouseDelta();

		this._yawTarget += mouse.x * (this.rotateSpeed * 0.002);
		this._pitchTarget += -mouse.y * (this.rotateSpeed * 0.002);

		if(this._pitchTarget < MIN_PITCH) this._pitchTarget = MIN_PITCH;
		if(this._pitchTarget > MAX_PITCH) this._pitchTarget = MAX_PITCH;

		this._yawTarget = this._wrapAngle(this._yawTarget);

		if(this.smoothRotate) {
			const smoothTime = Math.max(0.0001, this.damping) / 10;
			this._yaw = this._smoothDampAngle(this._yaw, this._yawTarget, '_yawV', smoothTime, 9999, _time.delta);
			this._pitch = this._smoothDamp(this._pitch, this._pitchTarget, '_pitchV', smoothTime, 9999, _time.delta);
		}else{
			this._yaw = this._yawTarget;
			this._pitch = this._pitchTarget;

			this._yawV = 0;
			this._pitchV = 0;
		}

		if(this._pitch < MIN_PITCH) this._pitch = MIN_PITCH;
		if(this._pitch > MAX_PITCH) this._pitch = MAX_PITCH;
		this._yaw = this._wrapAngle(this._yaw);
	}

	_syncFromWorldForward() {
		const f = this.d3dobject.forward;

		const yaw = Math.atan2(-f.x, f.z);
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
		const outToTarget  = target - output;
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

	getFirstPersonYawPitch() {
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

		const cc = this.d3dobject.getComponent('CameraCollision');
		if(cc)
			cc._smoothPos = null;
	}
}