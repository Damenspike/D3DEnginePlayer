const moveSpeed = 5;
const mouseSensitivity = 0.4;
const zoomSpeed = 0.4;

let wasForcingPan = false;
let initialTool = 'select';

function updateMotion() {
	const delta = _time.delta;
	const axis = _input.getControllerAxisArrowsOnly();
	const mult = _input.getKeyDown('control') ? 3 : 1;
	const speed = moveSpeed * mult * delta;
	
	if(_input.getKeyDown('alt')) // keyboard rotate mode
		return;
	
	/*
	if(_input.getKeyDown('shift')) {
		this.object3d.translateY(-1 * speed);
	}else
	if(_input.getKeyDown('space')) {
		this.object3d.translateY(1 * speed);
	}
	*/
	
	this.object3d.translateX(axis.x * speed);
	moveForward(-axis.y * speed);
}
function updateZoom() {
	const delta = _time.delta;
	const wheelDelta = _input.getWheelDelta();
	const mult = _input.getKeyDown('control') ? 3 : 1;
	const speed = zoomSpeed * mult * delta;
	
	this.object3d.translateZ(wheelDelta.y * speed);
}
function moveForward(distance) {
	const dir = Vector3();
	this.object3d.getWorldDirection(dir);
	
	// ignore Y so we don't move up/down
	dir.y = 0;
	dir.normalize();
	
	// move camera
	this.object3d.position.addScaledVector(dir, distance);
}
function focusOn(targets, distance = null, duration = 0.35, padding = 1.15, pointSize = 0.5) {
	const list = [...targets];
	if (!list.length) return;
	
	// union world-space AABB (includes object scale/children)
	const box = Box3().makeEmpty();
	const tmpBox = Box3();
	const tmpV = Vector3();

	let hadGeometry = false;
	let hadPoints = false;

	for (let i = 0; i < list.length; i++) {
		const obj3d = list[i] && list[i].object3d;
		if (!obj3d) continue;

		tmpBox.makeEmpty();
		tmpBox.setFromObject(obj3d);

		if (!tmpBox.isEmpty()) {
			// has renderable bounds
			if (box.isEmpty()) box.copy(tmpBox);
			else box.union(tmpBox);
			hadGeometry = true;
		} else {
			// no mesh: fall back to world position
			obj3d.getWorldPosition(tmpV);
			if (box.isEmpty()) box.set(tmpV.clone(), tmpV.clone());
			else box.expandByPoint(tmpV);
			hadPoints = true;
		}
	}

	if (box.isEmpty()) return; // nothing valid at all

	// ensure a minimum size if we only had points (no geometry)
	if (!hadGeometry && hadPoints) {
		// Inflate the box so it has some extents (centered on points union)
		const half = pointSize * 0.5;
		const c = box.getCenter(Vector3());
		box.min.set(c.x - half, c.y - half, c.z - half);
		box.max.set(c.x + half, c.y + half, c.z + half);
	}

	// center & size
	const target = Vector3();
	box.getCenter(target);
	const size = box.getSize(Vector3()).multiplyScalar(padding);

	// current camera data
	const cam = this.object3d; // perspective editor cam
	const from = cam.position.clone();

	// compute framing distance if not provided
	let dist = distance;
	if (dist == null) {
		if (cam.isPerspectiveCamera) {
			const vFov = MathUtils.degToRad(cam.fov);
			const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * cam.aspect);

			// guard against zero size
			const sx = Math.max(size.x, pointSize);
			const sy = Math.max(size.y, pointSize);
			const sz = Math.max(size.z, pointSize);

			const distV = (sy * 0.5) / Math.tan(vFov * 0.5);
			const distH = (sx * 0.5) / Math.tan(hFov * 0.5);
			const depthPad = sz * 0.5;

			dist = Math.max(distV, distH) + depthPad;
			dist = Math.max(dist, cam.near + 0.1);
		} else if (cam.isOrthographicCamera) {
			// keep current radius; controls usually zoom for ortho
			dist = cam.position.clone().sub(target).length();
		} else {
			dist = 5;
		}
	}

	// camera forward
	const forward = Vector3();
	cam.getWorldDirection(forward); // unit -Z for typical cams

	// destination so that target sits 'dist' along forward
	const to = target.clone().sub(forward.clone().multiplyScalar(dist));

	// set new orbit pivot for your editor controls
	this._orbit = target.clone();

	// tween state (advanced elsewhere)
	this._focusTween = {
		from,
		to,
		elapsed: 0,
		duration,
		ease: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
	};
}
function updateTween() {
	if(!this._focusTween)
		return;
	
	const tw = this._focusTween;
	tw.elapsed = Math.min(tw.duration, tw.elapsed + _time.delta);
	const k = tw.elapsed / tw.duration;
	const e = tw.ease(k);
	
	this.object3d.position.lerpVectors(tw.from, tw.to, e);
	
	if (k >= 1) 
		this._focusTween = null;
}
function updateOrbit(usePivot) {
	const defaultRadius = 5;
	const up = Vector3(0, 1, 0);

	// Detect mode switches
	if (this.__lastUsePivot === undefined) this.__lastUsePivot = usePivot;

	// Choose pivot
	let pivot;
	if (usePivot && this._orbit) {
		pivot = this._orbit.clone();

		// HANDOFF: if we just came from rotate-in-place, slide the pivot to the current view ray
		if (this.__lastUsePivot === false) {
			const fwd = Vector3();
			this.object3d.getWorldDirection(fwd);
			const dist = this.object3d.position.distanceTo(pivot);
			pivot = this.object3d.position.clone().addScaledVector(fwd, dist);
			this._orbit = pivot.clone(); // commit the slid pivot
		}
	} else {
		// tiny pivot ahead so it feels like rotate-in-place
		const fwd = Vector3();
		this.object3d.getWorldDirection(fwd);
		pivot = this.object3d.position.clone().addScaledVector(fwd, 0.01);
	}

	// Current offset and radius
	const offset = this.object3d.position.clone().sub(pivot);
	let r = offset.length();
	if (!isFinite(r) || r < 1e-6) { r = defaultRadius; offset.set(0, 0, r); }

	// Input → angles
	const delta = _time.delta;
	const md = _input.getMouseDelta();
	const angleH = -md.x * mouseSensitivity * delta;
	let angleV = -md.y * mouseSensitivity * delta;

	// Horizontal around world up
	offset.applyAxisAngle(up, angleH);

	// Vertical around camera right (derived from current look dir)
	const forward = offset.clone().negate().normalize();
	let right = Vector3().crossVectors(forward, up).normalize();
	if (right.lengthSq() < 1e-8) right.set(1, 0, 0);

	// Simple vertical clamp
	const maxPitch = Math.PI / 2 - 0.01;
	const test = offset.clone().applyAxisAngle(right, angleV);
	const fy = test.clone().negate().normalize().y;
	const limit = Math.sin(maxPitch);
	if (Math.abs(fy) > limit) {
		const curY = forward.y;
		const tgtY = (angleV > 0) ? limit : -limit;
		const frac = (fy === curY) ? 0 : Math.max(0, Math.min(1, (tgtY - curY) / (fy - curY)));
		angleV *= frac;
	}
	offset.applyAxisAngle(right, angleV);

	// Apply position & orientation
	offset.setLength(r);
	this.object3d.position.copy(pivot).add(offset);
	this.object3d.lookAt(pivot);

	// Remember last mode
	this.__lastUsePivot = usePivot;
}

this.onEditorEnterFrame = () => {
	const isGameInFocus = _input.getIsGameInFocus();
	const isCursorOverGame = _input.getCursorOverGame();
	const inputFieldInFocus = _input.getInputFieldInFocus();
	
	if(isGameInFocus) {
		if(_input.getRightMouseButtonDown()) {
			if(!wasForcingPan)
				initialTool = _editor.tool;
			
			_editor.setTool('pan');
			wasForcingPan = true;
		}else
		if(wasForcingPan) {
			_editor.setTool(initialTool);
			wasForcingPan = false;
		}
		
		if (_input.getKeyDown('alt') && _input.getLeftMouseButtonDown())
			updateOrbit(true);
		else
		if(_editor.tool == 'pan' && (_input.getLeftMouseButtonDown() || _input.getRightMouseButtonDown()))
			updateOrbit(false);
		
		updateMotion();
	}
	
	if(isCursorOverGame)
		updateZoom();
	
	updateTween();
};
_editor.focusOnSelectedObjects = () => {
	const inputFieldInFocus = _input.getInputFieldInFocus();
	
	if(!inputFieldInFocus && _editor.selectedObjects.length > 0 && !this._focusTween)
		focusOn(_editor.selectedObjects)
};