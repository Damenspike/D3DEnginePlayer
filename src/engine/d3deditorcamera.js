const moveSpeed = 5;
const mouseSensitivity = 0.4;
const zoomSpeed = 0.4;

let wasForcingPan = false;
let initialTool = 'select';

function updateMotion() {
	const delta = _time.delta;
	const axis = _input.getControllerAxis();
	const mult = _input.getKeyDown('control') ? 3 : 1;
	const speed = moveSpeed * mult * delta;
	
	if(_input.getKeyDown('alt')) // keyboard rotate mode
		return;
	
	if(_input.getKeyDown('shift')) {
		self.object3d.translateY(-1 * speed);
	}else
	if(_input.getKeyDown('space')) {
		self.object3d.translateY(1 * speed);
	}
	
	self.object3d.translateX(axis.x * speed);
	moveForward(-axis.y * speed);
}
function updateZoom() {
	const delta = _time.delta;
	const wheelDelta = _input.getWheelDelta();
	const mult = _input.getKeyDown('control') ? 3 : 1;
	const speed = zoomSpeed * mult * delta;
	
	self.object3d.translateZ(wheelDelta.y * speed);
}
function moveForward(distance) {
	const dir = new THREE.Vector3();
	self.object3d.getWorldDirection(dir);
	
	// ignore Y so we don't move up/down
	dir.y = 0;
	dir.normalize();
	
	// move camera
	self.object3d.position.addScaledVector(dir, distance);
}
function focusOn(targets, distance = 5, duration = 0.35) {
	// normalize to array
	const list = Array.isArray(targets) ? targets : (targets ? [targets] : []);
	if (!list.length) return;

	// combined world-space AABB center
	const box = new THREE.Box3();
	let any = false;
	for (let i = 0; i < list.length; i++) {
		const obj3d = list[i] && list[i].object3d;
		if (!obj3d) continue;
		const b = new THREE.Box3().setFromObject(obj3d);
		if (!b.isEmpty()) {
			if (!any) { box.copy(b); any = true; }
			else box.union(b);
		}
	}
	const target = new THREE.Vector3();
	if (any) box.getCenter(target);
	else {
		const first = list[0]?.object3d;
		if (!first) return;
		first.getWorldPosition(target);
	}

	// current camera position
	const from = self.object3d.position.clone();

	// use the camera's current forward to define the viewing ray
	const forward = new THREE.Vector3();
	self.object3d.getWorldDirection(forward); // unit vector pointing where camera looks

	// place camera so target sits exactly along forward at the given distance
	const to = target.clone().sub(forward.clone().multiplyScalar(distance));

	self._orbit = target.clone();
	
	// tween state (advanced in beforeEditorRenderFrame via _time.delta)
	self._focusTween = {
		from,
		to,
		elapsed: 0,
		duration, // seconds
		ease: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
	};
}
function updateTween() {
	if(!self._focusTween)
		return;
	
	const tw = self._focusTween;
	tw.elapsed = Math.min(tw.duration, tw.elapsed + _time.delta);
	const k = tw.elapsed / tw.duration;
	const e = tw.ease(k);
	
	self.object3d.position.lerpVectors(tw.from, tw.to, e);
	
	if (k >= 1) 
		self._focusTween = null;
}
function updateOrbit(usePivot) {
	const defaultRadius = 5;
	const up = new THREE.Vector3(0, 1, 0);

	// Detect mode switches
	if (self.__lastUsePivot === undefined) self.__lastUsePivot = usePivot;

	// Choose pivot
	let pivot;
	if (usePivot && self._orbit) {
		pivot = self._orbit.clone();

		// HANDOFF: if we just came from rotate-in-place, slide the pivot to the current view ray
		if (self.__lastUsePivot === false) {
			const fwd = new THREE.Vector3();
			self.object3d.getWorldDirection(fwd);
			const dist = self.object3d.position.distanceTo(pivot);
			pivot = self.object3d.position.clone().addScaledVector(fwd, dist);
			self._orbit = pivot.clone(); // commit the slid pivot
		}
	} else {
		// tiny pivot ahead so it feels like rotate-in-place
		const fwd = new THREE.Vector3();
		self.object3d.getWorldDirection(fwd);
		pivot = self.object3d.position.clone().addScaledVector(fwd, 0.01);
	}

	// Current offset and radius
	const offset = self.object3d.position.clone().sub(pivot);
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
	let right = new THREE.Vector3().crossVectors(forward, up).normalize();
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
	self.object3d.position.copy(pivot).add(offset);
	self.object3d.lookAt(pivot);

	// Remember last mode
	self.__lastUsePivot = usePivot;
}

self.beforeEditorRenderFrame = () => {
	const isGameInFocus = _input.getIsGameInFocus();
	
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
		
		if(_editor.tool == 'pan' && (_input.getLeftMouseButtonDown() || _input.getRightMouseButtonDown()))
			updateOrbit(false);
		else
		if (_input.getKeyDown('alt') && _input.getLeftMouseButtonDown())
			updateOrbit(true);
		
		updateMotion();
		updateTween();
		
		if(_input.getKeyDown('f') && _editor.selectedObjects.length > 0)
			focusOn(_editor.selectedObjects);
	}
	updateZoom();
};