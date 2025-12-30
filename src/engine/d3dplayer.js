// d3dplayer.js
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
	updateObjects,
	hookComposerPasses
} from './d3dutility.js';

import D2DRenderer from './d2drenderer.js';
import D3DObject from './d3dobject.js';
import D3DInput from './d3dinput.js';
import D3DTime from './d3dtime.js';
import D3DEventSystem from './d3devents.js';
import D3DConsole from './d3dconsole.js';
import D3DPhysics from './d3dphysics.js';
import D3DDimensions from './d3ddimensions.js';
import D3DGraphics from './d3dgraphics.js';
import D3DInstancing from './d3dinstancing.js';
import D3DAutoLODMaster from './d3dautolodmaster.js';

window.THREE = THREE;
window._loopFns = {};
window._hotObjects = new Set();
window._events = new D3DEventSystem();
window._input = new D3DInput();
window._time = new D3DTime();
window._physics = new D3DPhysics();
window._dimensions = new D3DDimensions();
window._graphics = new D3DGraphics();
window._instancing = new D3DInstancing();
window._autolod = new D3DAutoLODMaster();
window._player = {};
window.__global = {}; // our own runtime global store

// Host
window._host = window._player;

/////////////////////
// Error handling
////////////////////
window.addEventListener('error', (event) => {
	try {
		D3DConsole.error(
			'[Uncaught Error]',
			event.message,
			event.error || null
		);
	} catch (_) {}
});
// Unhandled promise rejections (async/await, .then chains, etc.)
window.addEventListener('unhandledrejection', (event) => {
	try {
		const reason = event.reason;
		const msg =
			(reason && reason.message) ||
			(typeof reason === 'string' ? reason : 'Unhandled promise rejection');

		if(reason) {
			D3DConsole.error(reason)
		}else{
			D3DConsole.error('[Unhandled Promise Rejection]', msg);
		}
	} catch (_) {}
});

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
function resizeRenderers() {
	const camera     = _player.camera?.object3d;
	const renderer3d = _player.renderer3d;
	const renderer2d = _player.renderer2d;

	if (!renderer3d || !_container3d) return;
	if (!renderer2d || !_container2d) return;

	const width3d  = _container3d.clientWidth;
	const height3d = _container3d.clientHeight;
	const width2d  = _container2d.clientWidth;
	const height2d = _container2d.clientHeight;

	renderer3d.setSize(width3d, height3d);
	renderer2d.setSize(width2d, height2d);

	if (camera && height3d > 0) {
		camera.aspect = width3d / height3d;
		camera.updateProjectionMatrix();
	}
	if (_player.composer) {
		_player.composer.setSize(width3d, height3d);
		_player.gtaoPass.setSize(width3d, height3d);
		_player.ssaoPass.setSize(width3d, height3d);
	}
	
	window._dimensions.onResize?.({width3d, height3d, width2d, height2d});
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
	
	// Ensure renderers are scaled immediately (browser)
	resizeRenderers();
	requestAnimationFrame(() => {
		resizeRenderers();
	});
	
	// Listen to window size changes
	window.addEventListener('resize', resizeRenderers);
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
	renderer3d.toneMapping = THREE.NoToneMapping;
	renderer3d.outputColorSpace = THREE.SRGBColorSpace;
	
	renderer3d.shadowMap.enabled = true;
	renderer3d.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer3d.physicallyCorrectLights = true;
		
	renderer2d.setPixelRatio(window.devicePixelRatio);
	renderer2d.setSize(_container2d.clientWidth, _container2d.clientHeight);
	
	_container3d.appendChild(renderer3d.domElement);
	_container2d.appendChild(renderer2d.domElement);
	
	_player.renderer3d = renderer3d;
	_player.renderer2d = renderer2d;
}

function initComposer() {
	const camera = _player.camera.object3d;
	const scene = _root.object3d;
	const width = _container3d.clientWidth;
	const height = _container3d.clientHeight;
	
	const composer = new EffectComposer(_player.renderer3d);
	const renderPass = new RenderPass(scene, camera);
	const gtaoPass = new GTAOPass(scene, camera, width, height);
	const ssaoPass = new SSAOPass(scene, camera, width, height);
	const outputPass = new OutputPass();
	
	// GTAO pass toggle
	gtaoPass.beforeRender = () => {
		camera.layers.disable(2); // layer 2 = no gtao (like sprites)
	};
	gtaoPass.afterRender = () => {
		camera.layers.enable(2);
	};
	
	// SSAO pass
	ssaoPass.enabled = false; // disabled by default
	ssaoPass.kernelRadius = 0.3;
	ssaoPass.minDistance  = 0;
	ssaoPass.maxDistance  = 0.3;
	ssaoPass.beforeRender = () => {
		camera.layers.disable(2); // layer 2 = no ssao (like sprites)
	};
	ssaoPass.afterRender = () => {
		camera.layers.enable(2);
	};
	
	// Add passes
	composer.addPass(renderPass);
	composer.addPass(gtaoPass);
	composer.addPass(ssaoPass);
	composer.addPass(outputPass);
	
	hookComposerPasses(composer);
	
	_player.composer = composer;
	_player.renderPass = renderPass;
	_player.gtaoPass = gtaoPass;
	_player.ssaoPass = ssaoPass;
}

function startAnimationLoop() {
	function animate(nowMs) {
		_time.tick(nowMs); // updates _time.delta (seconds) + _time.now
		
		if(!_player.paused) {
			_dimensions.update();
			
			updateObjects([
				'__onInternalEnterFrame',
				'__onEnterFrame',
				'onEnterFrame'
			]);
			
			if(_physics.ready) {
				const didSteps = _physics.step(_time.delta);
				_physics.didSteps = didSteps;
				_physics.deltaTime = _physics.fixedDt * _physics.didSteps;
				if(didSteps > 0) {
					updateObjects([
						'__onInternalPhysicsUpdate',
						'__onPhysicsUpdate',
						'onPhysicsUpdate'
					]);
				}
			}
			
			if(!_player.camera) {
				if(_player.mainCamera)
					_player.camera = _player.mainCamera;
				else {
					_root.traverse(d3dobject => {
						if(d3dobject.enabled && d3dobject.hasComponent('Camera')) {
							_player.camera = d3dobject;
							return false;
						}
					});
				}
				
				if(_player.camera) {
					initComposer();
					resizeRenderers();
					
					updateObjects([
						'__onInternalGraphicsReady',
						'__onGraphicsReady',
						'onGraphicsReady'
					]);
				}
			}
			
			updateObjects([
				'__onInternalBeforeRender',
				'__onBeforeRender',
				'onBeforeRender'
			]);
			
			_instancing.updateAll();
			_autolod.updateAll();
			
			const camera3d = _player.camera?.object3d;
			const renderer3d = _player.renderer3d;
			const renderer2d = _player.renderer2d;
			
			if(!_player.paused3D && camera3d)
				_player.composer.render();
			
			if(!_player.paused2D)
				renderer2d.render(); // render 2d
			
			updateObjects([
				'__onInternalExitFrame',
				'__onExitFrame',
				'onExitFrame'
			]);
			
			_input._afterRenderFrame?.();
		}
		
		requestAnimationFrame(animate);
	}
	
	// init
	_time.tick(performance.now());
	updateObjects(['__onInternalStart','__onStart','onStart']);
	requestAnimationFrame(animate);
}
function onConsoleMessage({ level, message }) {
	D3D.onConsoleMessage({level, message});
}

_player.showError = showError;
_player.closePlayer = closePlayer;
_player.showConfirm = showConfirm;
_player.onConsoleMessage = onConsoleMessage;

if(window._isStandalone) {
	D3D.setEventListener('ctx-menu-action', (id) => _events.invoke('ctx-menu-action', id));
	D3D.setEventListener('ctx-menu-close', () => _events.invoke('ctx-menu-close'));
}