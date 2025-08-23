const moveSpeed = 5;
const mouseSensitivity = 0.3;

// Enable mouse lock
_input.mouseLock = true;

// Pitch/Yaw angles in radians
let yaw = 0;
let pitch = 0;

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
	const speed = moveSpeed * delta;
	
	self.object3d.translateZ(axis.y * speed); // forward/back
	self.object3d.translateX(axis.x * speed);  // right/left
}

self.beforeRenderFrame = () => {
	updateRotation();
	updateMotion();
};