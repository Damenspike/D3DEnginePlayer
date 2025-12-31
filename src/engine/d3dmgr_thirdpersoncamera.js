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
	}

	get targetName() {
		return this.component.properties.targetName;
	}
	set targetName(v) {
		this.component.properties.targetName = v;
	}
	
	get rotateSpeed() {
		return Number(this.component.properties.rotateSpeed) ?? 1;
	}
	set rotateSpeed(v) {
		this.component.properties.rotateSpeed = Number(v);
	}
	
	get zoomSpeed() {
		return Number(this.component.properties.zoomSpeed) ?? 1;
	}
	set zoomSpeed(v) {
		this.component.properties.zoomSpeed = Number(v);
	}
	
	get minDist() {
		return Number(this.component.properties.minDist) ?? 0;
	}
	set minDist(v) {
		this.component.properties.minDist = Number(v);
	}
	
	get maxDist() {
		return Number(this.component.properties.maxDist) ?? 0;
	}
	set maxDist(v) {
		this.component.properties.maxDist = Number(v);
	}
	
	get height() {
		return Number(this.component.properties.height) ?? 0;
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
		return Number(this.component.properties.distance) ?? 1;
	}
	set distance(v) {
		this.component.properties.distance = Number(v);
	}
	
	get allowScroll() {
		return !!this.component.properties.allowScroll;
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
		return Number(this.component.properties.damping) ?? 1;
	}
	set damping(v) {
		this.component.properties.damping = Number(v);
	}

	updateComponent() {
		if (!this.setupCamera) 
			this.setup();
		
		const p = this.component.properties || {};
		const desiredDist = Number(p.distance ?? 1);
		
		if (!Number.isNaN(desiredDist)) {
			this._distance = desiredDist;
			this._distanceTarget = desiredDist;
		}
		
		this._firstRan = true;
	}

	dispose() {
		this.setupCamera = false;
	}
	
	__onInternalBeforeRender() {
		if (!this.setupCamera || !this.component.enabled) 
			return;
		
		const p = this.component.properties || {};
		const target = this.target ?? this.d3dobject.root.find(p.targetName);
		
		if(!target && !this._noTargetWarning && !this._firstRan) {
			D3DConsole.warn(`[${this.d3dobject.name}] No target referenced by third person camera.`);
			this._noTargetWarning = true;
		}
		
		const rotateSpeed = Number(p.rotateSpeed ?? 1) * 0.002;
		const zoomSpeed   = Number(p.zoomSpeed   ?? 1) * 0.002;
		const minDist     = Number(p.minDist     ?? 0.25);
		const maxDist     = Number(p.maxDist     ?? 6.0);
		const height      = Number(p.height      ?? 0.5);
		const smoothRotate = !!p.smoothRotate;
		const damping = Number(p.damping ?? 1);
		
		const mouse = _input.getMouseDelta();
		const wheel = _input.getWheelDelta();
		
		if (!this._initAngles) {
			this._yawTarget = this._yaw;
			this._pitchTarget = this._pitch;
			this._distanceTarget = this._distance;
			this._initAngles = true;
		}
		
		this._yawTarget   +=  mouse.x * rotateSpeed;
		this._pitchTarget += -mouse.y * rotateSpeed;
		
		if (this._pitchTarget < MIN_PITCH) this._pitchTarget = MIN_PITCH;
		if (this._pitchTarget > MAX_PITCH) this._pitchTarget = MAX_PITCH;
		
		this._yawTarget = this._wrapAngle(this._yawTarget);
		
		if(this.allowScroll) {
			this._distanceTarget += wheel.y * zoomSpeed;
			if (this._distanceTarget < minDist) this._distanceTarget = minDist;
			if (this._distanceTarget > maxDist) this._distanceTarget = maxDist;
		}
		
		if (smoothRotate) {
			const damp = Math.max(0.0001, damping);
			const smoothTime = damp / 10;
			
			this._yaw = this._smoothDampAngle(this._yaw, this._yawTarget, '_yawV', smoothTime, 9999, _time.delta);
			this._pitch = this._smoothDamp(this._pitch, this._pitchTarget, '_pitchV', smoothTime, 9999, _time.delta);
			this._distance = this._smoothDamp(this._distance, this._distanceTarget, '_distV', smoothTime, 9999, _time.delta);
		}
		else {
			this._yaw = this._yawTarget;
			this._pitch = this._pitchTarget;
			this._distance = this._distanceTarget;
			
			this._yawV = 0;
			this._pitchV = 0;
			this._distV = 0;
		}
		
		if (this._pitch < MIN_PITCH) this._pitch = MIN_PITCH;
		if (this._pitch > MAX_PITCH) this._pitch = MAX_PITCH;
		this._yaw = this._wrapAngle(this._yaw);
		
		if (this._distance < minDist) this._distance = minDist;
		if (this._distance > maxDist) this._distance = maxDist;
		
		const fx = Math.sin(-this._yaw) * Math.cos(this._pitch);
		const fy = Math.sin(this._pitch);
		const fz = Math.cos(-this._yaw) * Math.cos(this._pitch);
		
		const focus = target?.position.clone() ?? new THREE.Vector3();
		const targetOffset = new THREE.Vector3(
			Number(this.targetOffset?.x) || 0, 
			Number(this.targetOffset?.y) || 0, 
			Number(this.targetOffset?.z) || 0
		);
		const offsetDir = target ? target.localDirToWorld(targetOffset) : targetOffset;
		
		focus.add(offsetDir);
		
		const offset = this.d3dobject.forward.clone();
		offset.set(fx, fy, fz).multiplyScalar(-this._distance * this.distanceMultiplier);
		
		const camPos = focus.clone().add(offset);
		
		camPos.y += height;
		
		this.d3dobject.position = camPos;
		this.d3dobject.lookAt(focus);
		
		this.d3dobject.object3d.updateMatrixWorld(true);
		this.d3dobject.getComponent('CameraCollision')?.updateCameraCollision();
	}

	_wrapAngle(a) {
		while (a > Math.PI) a -= Math.PI * 2;
		while (a < -Math.PI) a += Math.PI * 2;
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
		if (change > maxChange) change = maxChange;
		if (change < -maxChange) change = -maxChange;
		
		const tempTarget = current - change;
		
		let v = this[vKey] || 0;
		const temp = (v + omega * change) * dt;
		v = (v - omega * temp) * exp;
		
		let output = tempTarget + (change + temp) * exp;
		
		const origToTarget = target - current;
		const outToTarget  = target - output;
		if (origToTarget > 0 && outToTarget < 0) {
			output = target;
			v = 0;
		}
		else
		if (origToTarget < 0 && outToTarget > 0) {
			output = target;
			v = 0;
		}
		
		this[vKey] = v;
		return output;
	}

	setup() {
		if (!window._player) 
			return;
		
		_input.mouseLock = true;
		this.setupCamera = true;
	}
}