// d3dplayer.js
import * as THREE from 'three';

import D3DObject from './d3dobject.js';
import D3DInput from './d3dinput.js';
import D3DTime from './d3dtime.js';
import D3DEventSystem from './d3devents.js';
import D3DConsole from './d3dconsole.js';

window.THREE = THREE;
window._events = new D3DEventSystem();
window._input = new D3DInput();
window._time = new D3DTime();
window._player = {console: []};
window._host = window._player;

// Add convenience vectors
THREE.Vector3.right = new THREE.Vector3(1, 0, 0);
THREE.Vector3.up = new THREE.Vector3(0, 1, 0);
THREE.Vector3.forward = new THREE.Vector3(0, 0, 1);

// Error handling
function showError(args) {
	let title, message, closePlayerWhenDone;
	
	if(typeof(args) == 'string')
		message = args;
	else {
		title = args.title;
		message = args.message;
		closePlayerWhenDone = args.closePlayerWhenDone;
	}
	
	D3D.showError({title, message, closePlayerWhenDone});
}
async function showConfirm({title = '', message = '', onDeny = null, onConfirm}) {
	const confirm = await D3D.showConfirm({title, message});
	
	if(confirm)
		onConfirm();
	else
		onDeny?.();
}
function closePlayer() {
	D3D.closePlayer();
}

// Main loader
export async function loadD3D(uri) {
	// Init root
	await initRoot(uri);

	// Setup renderer
	initRenderer();

	// Start update + render loop
	startAnimationLoop();
	
	// Update editor window title
	D3D.updateWindow({ 
		title: _root.manifest.name,
		width: _root.manifest.width,
		height: _root.manifest.height
	});
	
	// Listen to window size changes
	window.addEventListener('resize', () => {
		const camera = _player.camera?.object3d;
		const renderer = _player.renderer;
		
		const width = _container3d.clientWidth;
		const height = _container3d.clientHeight;
		
		renderer.setSize(width, height);
		
		if (camera) {
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		}
	});
}

/* ---------------- Helper Functions ---------------- */

async function initRoot(uri) {
	const root = new D3DObject('_root', null);
	window._root = root;
	await root.load(uri);
}

function initRenderer() {
	const scene = _root.object3d;
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(_container3d.clientWidth, _container3d.clientHeight);
	renderer.outputEncoding = THREE.sRGBEncoding;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;
	_container3d.appendChild(renderer.domElement);
	
	_player.renderer = renderer;
}

function updateObject(methods, d3dobj) {
	methods.forEach(method => {
		try {
			d3dobj[method]?.();
		}catch(e) {
			D3DConsole.error(`[${d3dobj.name}][${method}]`, e.name, e.message);
			console.error(`[${d3dobj.name}][${method}]`, e);
		}
	});
	d3dobj.children.forEach(child => updateObject(methods, child));
}

function startAnimationLoop() {
	function animate(nowMs) {
		_time.tick(nowMs); // updates _time.delta (seconds) + _time.now
		
		updateObject([
			'onEnterFrame',
			'__onEnterFrame',
			'__onInternalEnterFrame'
		], _root);
		
		if(!_player.camera) {
			_root.traverse(d3dobject => {
				if(d3dobject.hasComponent('Camera')) {
					_player.camera = d3dobject;
					return false;
				}
			});
		}
		
		const camera3d = _player.camera?.object3d;
		const renderer = _player.renderer;
		
		if(camera3d)
			renderer.render(_root.object3d, camera3d);
		else
			console.warn('No camera found for rendering');
		
		updateObject([
			'onExitFrame',
			'__onExitFrame',
			'__onInternalExitFrame'
		], _root);
		
		_input._afterRenderFrame?.();
		
		requestAnimationFrame(animate);
	}
	
	// init
	_time.tick(performance.now());
	updateObject(['onStart','__onStart'], _root);
	requestAnimationFrame(animate);
}
function onConsoleMessage({ level, message }) {
	D3D.onConsoleMessage({level, message});
}

_player.showError = showError;
_player.closePlayer = closePlayer;
_player.showConfirm = showConfirm;
_player.onConsoleMessage = onConsoleMessage;