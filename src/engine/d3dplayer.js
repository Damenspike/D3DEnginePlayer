// d3dplayer.js
const three = require('three');
const { PointerLockControls } = require('three/examples/jsm/controls/PointerLockControls.js');
import D3DObject from './d3dobject.js';
import D3DInput from './d3dinput.js';
import D3DTime from './d3dtime.js';

// Try to import electron if available
let ipcRenderer = null;
try {
	ipcRenderer = window.require?.('electron')?.ipcRenderer || null;
} catch {
	ipcRenderer = null;
}

let rootContext;

window.THREE = three;
window._input = new D3DInput();
window._time = new D3DTime();
window._editor = null;

// Add convenience vectors
THREE.Vector3.right = new THREE.Vector3(1, 0, 0);
THREE.Vector3.up = new THREE.Vector3(0, 1, 0);
THREE.Vector3.forward = new THREE.Vector3(0, 0, 1);

// Error handling
function showError(err) {
	if (ipcRenderer) {
		ipcRenderer.send('show-error', {
			title: 'Could not open game file',
			message: 'Could not open game file: ' + (err.message || String(err))
		});
	} else {
		alert('Could not open game file:\n' + (err.message || String(err)));
	}
}
function closeGameWindow() {
	if (ipcRenderer) {
		ipcRenderer.send('close-game-window');
	} else {
		console.warn('Game window close requested (browser mode)');
	}
}

// Main loader
async function loadD3D(uri) {
	// Create a new root context
	rootContext = new D3DObject('_root', null);
	window._root = rootContext;
	await rootContext.load(uri);

	// Rendering setup
	const container3d = document.getElementById('game-container');
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(rootContext.manifest.width, rootContext.manifest.height);
	container3d.appendChild(renderer.domElement);

	const threeObj = rootContext.object3d;
	const camera = rootContext.find('camera')?.object3d;
	const controls = new PointerLockControls(camera, renderer.domElement);

	renderer.domElement.addEventListener('click', () => {
		if (_input.mouseLock) controls.lock();
		else if (controls.isLocked) controls.unlock();
	});

	function updateObject(method, d3dobj) {
		d3dobj[method]?.();
		d3dobj.children.forEach(child => updateObject(method, child));
	}

	function animate() {
		updateObject('onEnterFrame', _root);

		requestAnimationFrame(animate);
		if (camera) renderer.render(threeObj, camera);
		else console.warn('No camera found for rendering');

		_time.delta = _time.now - _time.lastRender;
		_time.lastRender = _time.now;

		updateObject('afterRenderFrame', _root);
		_input._afterRenderFrame?.();
	}

	_time.lastRender = _time.now;
	updateObject('onStart', _root);
	updateObject('_onStart', _root);
	animate();

	window.addEventListener('resize', () => {
		const width = container3d.clientWidth;
		const height = container3d.clientHeight;
		renderer.setSize(width, height);
		if (camera) {
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		}
	});

	// Tell Electron to update window size/title if available
	if (ipcRenderer) {
		ipcRenderer.send('update-window', {
			width: rootContext.manifest.width,
			height: rootContext.manifest.height,
			title: rootContext.manifest.name
		});
	}
}

// --- Entry point ---

if (ipcRenderer) {
	ipcRenderer.on('d3d-load', (_, uri) => loadD3D(uri));
} else {
	// Browser: just load from URL in query string (?file=...)
	const params = new URLSearchParams(window.location.search);
	const file = params.get('file');
	if (file) loadD3D(file);
}