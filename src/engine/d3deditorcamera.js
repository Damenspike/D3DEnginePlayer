const moveSpeed = 5;
const mouseSensitivity = 0.4;

// Pitch/Yaw angles in radians
let yaw = 0;
let pitch = 0;
let wasForcingPan = false;

function updateRotation() {
	const delta = _time.delta;
	const mouseDelta = _input.getMouseDelta();

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
	const mult = _input.getKeyDown('space') ? 3 : 1;
	const speed = moveSpeed * mult * delta;
	
	// Downwards
	if(_input.getKeyDown('shift')) {
		self.object3d.translateY(axis.y * -1 * speed);  // go down
	}else{
		self.object3d.translateZ(axis.y * speed); // forward/back
	}
	
	self.object3d.translateX(axis.x * speed);  // right/left
}

self.beforeEditorRenderFrame = () => {
	if(_input.getIsGameInFocus()) {
		if(_input.getRightMouseButtonDown()) {
			_editor.setTool('pan');
			wasForcingPan = true;
		}else
		if(wasForcingPan) {
			_editor.setTool('select');
			wasForcingPan = false;
		}
		
		_editor.tool == 'pan' && updateRotation();
		_input.getIsGameInFocus() && updateMotion();
	}
};