const MIN_PITCH = -Math.PI * 0.45;
const MAX_PITCH =  Math.PI * 0.45;

export default class ThirdPersonCameraManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this._yaw = 0;
		this._pitch = 0;
		this._distance = Number(this.component?.properties?.distance ?? 1);

		this._drive = () => {
			if (!this.component.enabled) 
				return;

			const p = this.component.properties || {};
			const target = this.d3dobject.target ?? this.d3dobject.root.find(p.targetName);
			
			if (!target) 
				return;

			const rotateSpeed = Number(p.rotateSpeed ?? 1) * 0.002;
			const zoomSpeed   = Number(p.zoomSpeed   ?? 1) * 0.002;
			const minDist     = Number(p.minDist     ?? 0.25);
			const maxDist     = Number(p.maxDist     ?? 6.0);
			const height      = Number(p.height      ?? 0.5);

			const mouse = _input.getMouseDelta();
			const wheel = _input.getWheelDelta();

			this._yaw   +=  mouse.x * rotateSpeed;
			this._pitch += -mouse.y * rotateSpeed;

			if (this._pitch < MIN_PITCH) this._pitch = MIN_PITCH;
			if (this._pitch > MAX_PITCH) this._pitch = MAX_PITCH;

			if (this._yaw >  Math.PI) this._yaw -= Math.PI * 2;
			if (this._yaw < -Math.PI) this._yaw += Math.PI * 2;
			
			if(this.allowScroll) {
				this._distance += wheel.y * zoomSpeed;
				if (this._distance < minDist) this._distance = minDist;
				if (this._distance > maxDist) this._distance = maxDist;
			}
			
			const fx = Math.sin(-this._yaw) * Math.cos(this._pitch);
			const fy = Math.sin(this._pitch);
			const fz = Math.cos(-this._yaw) * Math.cos(this._pitch);

			const focus = target.position.clone();
			focus.y += height;

			const offset = this.d3dobject.forward.clone();
			offset.set(fx, fy, fz).multiplyScalar(-this._distance);

			const camPos = focus.clone().add(offset);

			this.d3dobject.position = camPos;
			this.d3dobject.lookAt(focus);
		};
	}

	get targetName() { return this.component.properties.targetName; }
	set targetName(v) { this.component.properties.targetName = v; }

	get rotateSpeed() { return this.component.properties.rotateSpeed; }
	set rotateSpeed(v) { this.component.properties.rotateSpeed = v; }

	get zoomSpeed() { return this.component.properties.zoomSpeed; }
	set zoomSpeed(v) { this.component.properties.zoomSpeed = v; }

	get minDist() { return this.component.properties.minDist; }
	set minDist(v) { this.component.properties.minDist = v; }

	get maxDist() { return this.component.properties.maxDist; }
	set maxDist(v) { this.component.properties.maxDist = v; }

	get height() { return this.component.properties.height; }
	set height(v) { this.component.properties.height = v; }

	get distance() { return this.component.properties.distance; }
	set distance(v) {
		this.component.properties.distance = v;
		const n = Number(v ?? 1);
		if (!Number.isNaN(n)) this._distance = n;
	}
	
	get allowScroll() { return this.component.properties.allowScroll; }
	set allowScroll(v) {
		this.component.properties.allowScroll = !!v;
	}

	updateComponent() {
		if (!this.setupCamera) 
			this.setup();
		
		const p = this.component.properties || {};
		const desiredDist = Number(p.distance ?? 1);
		
		if (!Number.isNaN(desiredDist)) 
			this._distance = desiredDist;
	}

	dispose() {
		if (this.__onInternalBeforeRender === this._drive) 
			this.__onInternalBeforeRender = null;
		
		this.setupCamera = false;
	}

	setup() {
		if (!window._player) 
			return;
		
		_input.mouseLock = true;
		this.__onInternalBeforeRender = this._drive;
		this.setupCamera = true;
	}
}