export default function D3DThirdPersonCameraManager(d3dobject, component) {
	const MIN_PITCH = -Math.PI * 0.45;
	const MAX_PITCH =  Math.PI * 0.45;

	this._yaw      = 0;
	this._pitch    = 0;
	this._distance = Number(component?.properties?.distance ?? 1);

	this.updateComponent = () => {
		if (!this.setupCamera) this.setup();
		const p = component.properties || {};
		const desiredDist = Number(p.distance ?? 1);
		if (!Number.isNaN(desiredDist)) this._distance = desiredDist;
	};

	this.dispose = () => {
		if (d3dobject.__onBeforeRender === drive) 
			d3dobject.__onBeforeRender = null;
		
		this.setupCamera = false;
	};
	
	this.setup = () => {
		if(!window._player) return; // player only
		_input.mouseLock = true;
		d3dobject.__onBeforeRender = drive;
		this.setupCamera = true;
	}

	const drive = () => {
		const p = component.properties || {};
		const target = d3dobject.target ?? d3dobject.root.find(p.targetName);
		if (!target) return;

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

		this._distance += wheel.y * zoomSpeed;
		if (this._distance < minDist) this._distance = minDist;
		if (this._distance > maxDist) this._distance = maxDist;

		const fx = Math.sin(-this._yaw) * Math.cos(this._pitch);
		const fy = Math.sin(this._pitch);
		const fz = Math.cos(-this._yaw) * Math.cos(this._pitch);

		const focus = target.position.clone();
		focus.y += height;

		const offset = d3dobject.forward.clone();
		offset.set(fx, fy, fz).multiplyScalar(-this._distance);

		const camPos = focus.clone().add(offset);

		d3dobject.position = camPos;
		d3dobject.lookAt(focus);
	};
}