const moveSpeed = 5;
const mouseSensitivity = 0.4;
const zoomSpeed = 0.4;

// Pitch/Yaw angles in radians
let yaw = 0;
let pitch = 0;
let wasForcingPan = false;
let initialTool = 'select';

function updateRotation() {
	const delta = _time.delta;
	const mouseDelta = _input.getMouseDelta();
	const axis = _input.getControllerAxis();
	
	if(_input.getKeyDown('alt')) {
		// arrow keys rotate
		mouseDelta.x = axis.x * 3;
		mouseDelta.y = axis.y * 3;
	}

	// Update yaw/pitch from mouse
	yaw -= mouseDelta.x * mouseSensitivity * delta;
	pitch -= mouseDelta.y * mouseSensitivity * delta;

	// Clamp pitch
	const maxPitch = Math.PI / 2 - 0.01;
	pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));

	// Apply rotation
	self.object3d.rotation.set(pitch, yaw, 0, 'YXZ');
}

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
		
		((_editor.tool == 'pan' && (_input.getLeftMouseButtonDown() || _input.getRightMouseButtonDown()) ) || _input.getKeyDown('alt')) && updateRotation();
		updateMotion();
		updateZoom();
	}
};