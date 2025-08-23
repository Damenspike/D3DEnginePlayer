// renderer.js
const three = require('three');
const { ipcRenderer } = require('electron');
const { PointerLockControls } = require('three/examples/jsm/controls/PointerLockControls.js');
import D3DObject from './d3dobject.js';
import D3DInput from './d3dinput.js';
import D3DTime from './d3dtime.js';

let rootContext;

global.THREE = three;
global._input = new D3DInput();
global._time = new D3DTime();

THREE.Vector3.right = new THREE.Vector3(1, 0, 0);
THREE.Vector3.up = new THREE.Vector3(0, 1, 0);
THREE.Vector3.forward = new THREE.Vector3(0, 0, 1);

function showError(err) {
	ipcRenderer.send('show-error', {
		title: 'Could not open game file',
		message: 'Could not open game file: ' + (err.message || String(err))
	});
}
function closeGameWindow() {
	ipcRenderer.send('close-game-window');
}
function time() {
	return new Date().getTime() / 1000;
}

ipcRenderer.on('d3d-load-uri', async (_, uri) => {
	try {
		// Create the root context and load the file (main window context)
		rootContext = new D3DObject('_root', null);
		global._root = rootContext;
		const buffer = await rootContext.load(uri);
		
		if(!buffer)
			throw new Error('Load failed');
		
		// Success, root will continue loading
	} catch (err) {
		closeGameWindow();
		showError(err);
		console.error('Failed to load D3D file in main window:', err);
	}
});

// Handle load in game window
ipcRenderer.on('d3d-load', async (_, uri) => {
	try {
		// Create a new root context for the game window
		rootContext = new D3DObject('_root', null);
		global._root = rootContext;
		await rootContext.load(uri);
		
		// Rendering setup (runs in game window context)
		const container3d = document.getElementById('game-container');
		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(rootContext.manifest.width, rootContext.manifest.height);
		
		container3d.appendChild(renderer.domElement);
		
		const threeObj = rootContext.object3d;
		const camera = rootContext.find('camera')?.object3d;
		const controls = new PointerLockControls(camera, renderer.domElement);
		
		// Enable pointer lock when clicking the canvas
		renderer.domElement.addEventListener('click', () => {
			if(_input.mouseLock)
				controls.lock();
			else
			if(controls.isLocked)
				controls.unlock();
		});
		
		function animate() {
			updateObject('beforeRenderFrame', _root);
			
			requestAnimationFrame(animate);
			if (camera) {
				renderer.render(threeObj, camera);
			} else {
				console.warn('No camera found for rendering');
			}
			
			_time.delta = time() - _time.lastRender;
			_time.lastRender = time();
			
			updateObject('afterRenderFrame', _root);
			_input._afterRenderFrame?.();
		}
		function updateObject(method, d3dobj) {
			d3dobj[method]?.();
			d3dobj.children.forEach(child => updateObject(method, child));
		}
		
		_time.lastRender = time();
		
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

		// Update window size and title
		const { ipcRenderer } = require('electron');
		ipcRenderer.send('update-window', {
			width: rootContext.manifest.width,
			height: rootContext.manifest.height,
			title: rootContext.manifest.name
		});
	} catch (err) {
		console.error('Failed to load or render D3D file in game window:', err);
	}
});