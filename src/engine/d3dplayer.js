// d3dplayer.js
import * as THREE from 'three';

import D3DObject from './d3dobject.js';
import D3DInput from './d3dinput.js';
import D3DTime from './d3dtime.js';
import D3DEventSystem from './d3devents.js';
import D3DConsole from './d3dconsole.js';
import D3DPhysics from './d3dphysics.js';
import D2DRenderer from './d2drenderer.js';

window.THREE = THREE;
window._events = new D3DEventSystem();
window._input = new D3DInput();
window._time = new D3DTime();
window._physics = new D3DPhysics();
window._player = {};

// Host
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
	// Wait for physics to initialise
	await _physics.init();
	
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
		const renderer3d = _player.renderer3d;
		const renderer2d = _player.renderer2d;
		
		const width3d = _container3d.clientWidth;
		const height3d = _container3d.clientHeight;
		const width2d = _container2d.clientWidth;
		const height2d = _container2d.clientHeight;
		
		if (renderer3d)
			renderer3d.setSize(width3d, height3d);
		
		if (renderer2d)
			renderer2d.setSize(width2d, height2d);
		
		if (camera) {
			camera.aspect = width3d / height3d;
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
	const renderer3d = new THREE.WebGLRenderer({ antialias: true });
	const renderer2d = new D2DRenderer({root: _root});
	
	renderer3d.setPixelRatio(window.devicePixelRatio);
	renderer3d.setSize(_container3d.clientWidth, _container3d.clientHeight);
	renderer3d.outputEncoding = THREE.sRGBEncoding;
	renderer3d.toneMapping = THREE.ACESFilmicToneMapping;
	renderer3d.toneMappingExposure = 1.0;
	
	renderer2d.setPixelRatio(window.devicePixelRatio);
	renderer2d.setSize(_container2d.clientWidth, _container2d.clientHeight);
	
	_container3d.appendChild(renderer3d.domElement);
	_container2d.appendChild(renderer2d.domElement);
	
	_player.renderer3d = renderer3d;
	_player.renderer2d = renderer2d;
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
			'__onInternalEnterFrame',
			'__onEnterFrame',
			'onEnterFrame'
		], _root);
		
		if(_physics.ready)
			_physics.step(_time.delta);
		
		if(!_player.camera) {
			_root.traverse(d3dobject => {
				if(d3dobject.hasComponent('Camera')) {
					_player.camera = d3dobject;
					return false;
				}
			});
		}
		
		updateObject([
			'__onInternalBeforeRender',
			'__onBeforeRender',
			'onBeforeRender'
		], _root);
		
		const camera3d = _player.camera?.object3d;
		const renderer3d = _player.renderer3d;
		const renderer2d = _player.renderer2d;
		
		if(camera3d)
			renderer3d.render(_root.object3d, camera3d);
		else
			console.warn('No camera found for rendering');
			
		renderer2d.render(); // render 2d
		
		updateObject([
			'__onInternalExitFrame',
			'__onExitFrame',
			'onExitFrame'
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