// d3deditor.js
import * as three from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { arraysEqual } from './d3dutility.js';
import { GrayscaleShader } from './d3dshaders.js';
import $ from 'jquery';
import D3DObject from './d3dobject.js';
import D3DInput from './d3dinput.js';
import D3DTime from './d3dtime.js';
import D3DEditorState from './d3deditorstate.js';
import D3DInfiniteGrid from './d3dinfinitegrid.js';
import D3DTransformGizmo from './d3dtransformgizmo.js';
import D3DComponents from './d3dcomponents.js';

const fs = window.require('fs').promises;
const path = window.require('path');
const vm = window.require('vm');
const { ipcRenderer } = window.electron;

let rootContext;

window.THREE = three;
window._input = new D3DInput();
window._time = new D3DTime();
window._editor = new D3DEditorState();

// Add convenience vectors
THREE.Vector3.right = new THREE.Vector3(1, 0, 0);
THREE.Vector3.up = new THREE.Vector3(0, 1, 0);
THREE.Vector3.forward = new THREE.Vector3(0, 0, 1);

// All global vars
global.LAYER_DEFAULT = 0;

// Error handling
function showError(args) {
	let title, message, closeEditorWhenDone;
	
	if(typeof(args) == 'string')
		message = args;
	else {
		title = args.title;
		message = args.message;
		closeEditorWhenDone = args.closeEditorWhenDone;
	}
	
	ipcRenderer.send('show-error', {title, message, closeEditorWhenDone});
}
async function showConfirm({title = '', message = '', onDeny = null, onConfirm}) {
	const confirm = await ipcRenderer.invoke('show-confirm', {title, message});
	
	if(confirm)
		onConfirm();
	else
		onDeny?.();
}
function closeEditor() {
	ipcRenderer.send('close-editor');
}

_editor.showError = showError;
_editor.closeEditor = closeEditor;
_editor.showConfirm = showConfirm;

// Main loader
export async function loadD3DProj(uri) {
	// Init root
	await initRoot(uri);

	// Setup renderer
	const renderer = initRenderer();

	// Setup editor camera
	const camera = await initEditorCamera();
	
	// Configure editor state
	initEditorConfig(camera);
	
	// Init focus overlay
	initFocusOverlay();

	// Setup composer and passes
	const { composer, outlinePass, grayPass } = initComposer(renderer, camera);

	// Start update + render loop
	startAnimationLoop(composer, outlinePass);

	// Setup resize handling
	setupResize(renderer, camera);

	// Update editor window title
	ipcRenderer.send('update-editor-window', { title: _root.manifest.name });

	// Enable object selection via raycasting
	setupSelection(renderer, camera);
}

/* ---------------- Helper Functions ---------------- */

async function initRoot(uri) {
	rootContext = new D3DObject('_root', null);
	window._root = rootContext;
	await rootContext.load(uri);
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
	_editor.renderer = renderer;
	return renderer;
}

async function initEditorCamera() {
	const cameraD3DObj = await _root.createObject({
		name: '__EDITOR_CAMERA',
		position: { x: 0, y: 2, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		editorOnly: true,
		noSelect: true,
		editorAlwaysVisible: true,
		engineScript: 'd3deditorcamera.js',
		uuid: '',
		components: [{ type: 'Camera', properties: {} }]
	});
	const editorLight = await cameraD3DObj.createObject({
		name: 'Editor Camera Light',
		position: { x: 0, y: 0, z: 100 },
		rotation: { x: 0, y: THREE.MathUtils.degToRad(180), z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		editorOnly: true,
		noSelect: true,
		engineScript: 'd3deditorlight.js',
		components: [{ type: 'DirectionalLight', properties: {
			color: '0xffffff',
			intensity: 2
		} }]
	});
	
	_editor.editorLight = editorLight;
	
	return cameraD3DObj.object3d;
}

function initComposer(renderer, camera) {
	const scene = _root.object3d;
	const composer = new EffectComposer(renderer);
	
	_editor.composer = composer;

	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);
	
	// Setup transform gizmo
	setupTransformGizmo();

	const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
	composer.addPass(gammaCorrectionPass);
	
	const grayPass = new ShaderPass(GrayscaleShader);
	grayPass.enabled = false;
	composer.addPass(grayPass);
	
	const outlinePass = new OutlinePass(
		new THREE.Vector2(_container3d.clientWidth, _container3d.clientHeight),
		scene,
		camera
	);
	composer.addPass(outlinePass);

	// Outline styling
	outlinePass.edgeStrength = 12.0;
	outlinePass.edgeGlow = 0.0;
	outlinePass.edgeThickness = 8.0;
	outlinePass.pulsePeriod = 0;
	outlinePass.visibleEdgeColor.set('#0099ff');
	outlinePass.hiddenEdgeColor.set('#000000');
	
	// Assign values if needed
	_editor.grayPass = grayPass;

	return { composer, outlinePass };
}

function initEditorConfig(camera) {
	_editor.project = _root.manifest;
	_editor.config = _editor.project.editorConfig;
	_editor.camera = camera;
	_editor.gridHelper = addGridHelper();
	_editor.setTool('select'); // default tool
	_editor.setTransformTool('translate'); // default tool
	_editor.onProjectLoaded?.();

	if (!_editor.config) {
		throw new Error('Missing editor configuration');
	}
}

function initFocusOverlay() {
	if (_editor._overlayScene) return;
	_editor._overlayScene = new THREE.Scene();
	_editor._overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	
	const geo = new THREE.PlaneGeometry(2, 2); // full-screen in NDC
	const mat = new THREE.MeshBasicMaterial({
		color: 0xFFFFFF,
		opacity: 0.35,
		transparent: true,
		depthTest: false,
		depthWrite: false
	});
	_editor._overlayQuad = new THREE.Mesh(geo, mat);
	_editor._overlayScene.add(_editor._overlayQuad);
}

function updateObject(method, d3dobj) {
	d3dobj[method]?.();
	d3dobj.children.forEach(child => updateObject(method, child));
}

function afterRenderShowObjects() {
	_root.children.forEach(d3dobject => {
		if(d3dobject == _editor.focus || d3dobject.__wasVisible === undefined || d3dobject.editorAlwaysVisible)
			return;
		
		d3dobject.visible = d3dobject.__wasVisible;
		d3dobject.__wasVisible = undefined;
	});
}
function afterRenderHideObjects() {
	_root.children.forEach(d3dobject => {
		if(d3dobject == _editor.focus || d3dobject.isLight || d3dobject.editorAlwaysVisible)
			return;
		
		if(d3dobject.__wasVisible === undefined)
			d3dobject.__wasVisible = d3dobject.visible;
		
		d3dobject.visible = false;
	});
}

function startAnimationLoop(composer, outlinePass) {
	function animate() {
		updateObject('beforeEditorRenderFrame', _root);
		updateObject('__beforeEditorRenderFrame', _root);

		requestAnimationFrame(animate);

		_time.delta = _time.now - _time.lastRender;
		_time.lastRender = _time.now;

		outlinePass.selectedObjects = _editor.selectedObjects.map(d3dobj => d3dobj.object3d);
		composer.render();
		
		if (_editor.focus != _root) {
			afterRenderHideObjects();
		
			// 1) draw the screen-space gray layer ABOVE the greyscaled scene
			_editor.renderer.autoClear = false;
			_editor.renderer.render(_editor._overlayScene, _editor._overlayCam);
			
			// 2) now clear depth so focus redraw can overwrite
			_editor.renderer.clearDepth();
			_editor.renderer.render(_root.object3d, _editor.camera);
		
			// 3) gizmo on top
			_editor.renderer.clearDepth();
			_editor.renderer.render(_editor.gizmo._group, _editor.camera);
		
			_editor.renderer.autoClear = true;
		
			afterRenderShowObjects();
		}
		
		if(_editor.gizmo)
			_editor.gizmo.update();
		
		updateObject('afterEditorRenderFrame', _root);
		_input._afterRenderFrame?.();
	}

	_time.lastRender = _time.now;
	
	updateObject('onEditorStart', _root);
	updateObject('__onEditorStart', _root);
	animate();
}

function setupResize(renderer, camera) {
	const resizeUpdate = () => {
		const width = _container3d.clientWidth;
		const height = _container3d.clientHeight;
		renderer.setSize(width, height);
		if (camera) {
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		}
	};

	const resizeObserver = new ResizeObserver(resizeUpdate);
	window.addEventListener('resize', resizeUpdate);
	resizeObserver.observe(_container3d);
}

function setupSelection(renderer, camera) {
	const scene = _root.object3d;
	const raycaster = new THREE.Raycaster();

	// --- Selection Box Overlay ---
	const selectionBox = document.createElement('div');
	selectionBox.style.position = 'absolute';
	selectionBox.style.border = '1px dashed #0099ff';
	selectionBox.style.backgroundColor = 'rgba(0, 150, 255, 0.1)';
	selectionBox.style.pointerEvents = 'none';
	selectionBox.style.display = 'none';
	_container3d.appendChild(selectionBox);

	let startPoint = null;

	renderer.domElement.addEventListener('mousedown', (event) => {
		if (_editor.tool !== 'select' || event.button !== 0) return;
		if (_input.getKeyDown('alt')) return;
		if (_editor.gizmo.busy) return;
		if(!_input.getIsGameInFocus()) return;

		const r = renderer.domElement.getBoundingClientRect();
		startPoint = {
			x: event.clientX - r.left, // canvas-local
			y: event.clientY - r.top   // canvas-local
		};

		selectionBox.style.left = `${startPoint.x}px`;
		selectionBox.style.top = `${startPoint.y}px`;
		selectionBox.style.width = '0px';
		selectionBox.style.height = '0px';
		selectionBox.style.display = 'block';
	});

	renderer.domElement.addEventListener('mousemove', (event) => {
		if (!startPoint) return;
		if (_editor.gizmo.busy) {
			selectionBox.style.display = 'none';
			startPoint = null;
			return;
		}

		const r = renderer.domElement.getBoundingClientRect();
		const currentX = event.clientX - r.left; // canvas-local
		const currentY = event.clientY - r.top;  // canvas-local

		const x = Math.min(currentX, startPoint.x);
		const y = Math.min(currentY, startPoint.y);
		const w = Math.abs(currentX - startPoint.x);
		const h = Math.abs(currentY - startPoint.y);

		selectionBox.style.left = `${x}px`;
		selectionBox.style.top = `${y}px`;
		selectionBox.style.width = `${w}px`;
		selectionBox.style.height = `${h}px`;
	});

	renderer.domElement.addEventListener('mouseup', (event) => {
		if (!startPoint) 
			return;
			
		selectionBox.style.display = 'none';

		const r = renderer.domElement.getBoundingClientRect();
		const endX = event.clientX - r.left;  // canvas-local
		const endY = event.clientY - r.top;   // canvas-local

		const x1 = Math.min(startPoint.x, endX);
		const y1 = Math.min(startPoint.y, endY);
		const x2 = Math.max(startPoint.x, endX);
		const y2 = Math.max(startPoint.y, endY);

		startPoint = null;

		// Tiny drag → treat as click
		if (Math.abs(x2 - x1) < 4 && Math.abs(y2 - y1) < 4) {
			return singleClickSelect(event);
		}

		camera.updateProjectionMatrix();
		camera.updateMatrixWorld();

		// Area select (de-duped by owning D3D object, testing owner AABB)
		const selectedObjects = [];
		const seen = new Set(); // de-dup by d3dobject
		
		// Gather unique owners first
		const owners = [];
		scene.traverse((obj) => {
			if (!obj.isMesh) return;
		
			// walk up until we find the node that actually carries the d3dobject ref
			let owner = obj;
			while (owner && !owner.userData?.d3dobject && owner.parent) owner = owner.parent;
		
			const d3dobj = owner?.userData?.d3dobject;
			if (!d3dobj || d3dobj === _root || d3dobj.noSelect) return;
		
			const key = d3dobj.uuid || d3dobj; // stable key if you have one
			if (!seen.has(key)) {
				seen.add(key);
				owners.push({ owner, d3dobj });
			}
		});
		
		// Test each owner's screen-space AABB against the drag rect
		const rc = _container3d.getBoundingClientRect();
		for (const { owner, d3dobj } of owners) {
			// compute world-space bounding box of the whole owner subtree
			const box = new THREE.Box3().setFromObject(owner);
			if (!box.isEmpty()) {
				// 8 corners of the box
				const corners = [
					new THREE.Vector3(box.min.x, box.min.y, box.min.z),
					new THREE.Vector3(box.min.x, box.min.y, box.max.z),
					new THREE.Vector3(box.min.x, box.max.y, box.min.z),
					new THREE.Vector3(box.min.x, box.max.y, box.max.z),
					new THREE.Vector3(box.max.x, box.min.y, box.min.z),
					new THREE.Vector3(box.max.x, box.min.y, box.max.z),
					new THREE.Vector3(box.max.x, box.max.y, box.min.z),
					new THREE.Vector3(box.max.x, box.max.y, box.max.z),
				];
		
				let anyInside = false;
				for (let i = 0; i < corners.length; i++) {
					// project to NDC
					const v = corners[i].clone().project(camera);
					// convert to container-local pixels
					const sx = (v.x * 0.5 + 0.5) * rc.width;
					const sy = (-v.y * 0.5 + 0.5) * rc.height;
					if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) {
						anyInside = true;
						break;
					}
				}
				if (anyInside) selectedObjects.push(d3dobj);
			}
		}

		if (_input.getKeyDown('shift')) {
			_editor.addSelection(selectedObjects);
		} else {
			_editor.setSelection(selectedObjects);
		}
	});

	// --- Helper: single click select ---
	function singleClickSelect(event) {
		const r = renderer.domElement.getBoundingClientRect();
		const mouse = new THREE.Vector2();
		mouse.x = ((event.clientX - r.left) / r.width) * 2 - 1;
		mouse.y = -((event.clientY - r.top) / r.height) * 2 + 1;

		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObjects(scene.children, true);

		if (intersects.length > 0) {
			const d3dobjects = [];

			intersects.forEach(intersect => {
				let parent = intersect.object;
				while (!parent.userData.d3dobject && parent.parent) parent = parent.parent;

				const d3dobj = parent.userData.d3dobject;
				if (!d3dobj || d3dobj == _root || d3dobj.noSelect) return;
				d3dobjects.push(d3dobj);
			});

			const selectedObject = d3dobjects.shift();
			if(selectedObject) {
				if (_input.getKeyDown('shift')) 
					_editor.addSelection([selectedObject]);
				else 
					_editor.setSelection([selectedObject]);
			}else
				_editor.setSelection([]);
		}else
			_editor.setSelection([]);
	}
}

function setupTransformGizmo() {
	const scene = _root.object3d;
	const camera = _editor.camera;
	const renderer = _editor.renderer;
	
	// create once
	const gizmo = new D3DTransformGizmo({
		scene,
		camera,
		dom: renderer.domElement,
		getSelected: () => _editor.selectedObjects[0]
	});
	
	// attach/detach on selection changes
	gizmo.attach(_editor.selectedObjects[0]);
	
	_editor.gizmo = gizmo;
}

function addGridHelper() {
	const grid = new D3DInfiniteGrid();
	const scene = _root.object3d;
	scene.add(grid);
	return grid;
}
async function addD3DObjectEditor(type) {
	let name = type;
	let n = 1;
	
	while(_editor.focus.find(name)) {
		name = `${type}_${n}`;
		n++;
	}
	
	const newObject = {
		name: name,
		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		components: []
	}
	let supported = true;
	
	switch(type) {
		case 'empty':
			
		break;
		case 'camera':
			newObject.components.push({
				type: 'Camera', 
				properties: {}
			});
		break;
		case 'dirlight':
			newObject.components.push({
				type: 'DirectionalLight', 
				properties: {
					color: '0xffffff',
					intensity: 2
				}
			});
		break;
		case 'pntlight':
			newObject.components.push({
				type: 'PointLight', 
				properties: {
					color: '0xffffff',
					intensity: 2
				}
			});
		break;
		case 'html':
			newObject.components.push({
				type: 'HTML', 
				properties: {
					source: ''
				}
			});
		break;
		case 'cube':
			newObject.components.push({
				type: 'Mesh', 
				properties: {
					mesh: 'Standard/Models/Cube.glb',
					materials: [
						'Standard/Materials/Default.mat'
					]
				}
			});
		break;
		default:
			supported = false;
		break;
	}
	
	if(!supported) {
		_editor.showError(`Unsupported add object '${type}'`);
		return;
	}
	
	const newd3dobj = await _editor.focus.createObject(newObject);
	
	_editor.setSelection([newd3dobj]);
}

function __onEditorFocusChanged() {
	const inFocusMode = _editor.focus != _root;
	
	_editor.grayPass.enabled = inFocusMode;
}

// INTERNAL

_editor.__onEditorFocusChanged = __onEditorFocusChanged;

ipcRenderer.once('show-error-closed', (_, closeEditorWhenDone) => {
	if(closeEditorWhenDone)
		closeEditor();
});
ipcRenderer.on('delete', () => {
	_editor.onDeleteKey();
});
ipcRenderer.on('undo', () => {
	_editor.undo();
});
ipcRenderer.on('redo', () => {
	_editor.redo();
});
ipcRenderer.on('add-object', (_, type) => {
	addD3DObjectEditor(type);
});