// d3deditor.js
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GrayscaleShader } from './d3dshaders.js';
import { v4 as uuidv4 } from 'uuid';
import { 
	arraysEqual,
	uniqueFilePath,
	getExtension,
	pickWorldPointAtScreen,
	dropToGroundIfPossible,
	clearDir,
	fileName,
	fileNameNoExt,
	isDirectory,
	upperFirst
} from './d3dutility.js';
import {
	readLocalTRSFromZip
} from './glb-instancer.js';
import {
	onAssetDroppedIntoGameView
} from './d3deditordrop.js';

import $ from 'jquery';
import D2DRenderer from './d2drenderer.js';
import D3DObject from './d3dobject.js';
import D3DInput from './d3dinput.js';
import D3DTime from './d3dtime.js';
import D3DEditorState from './d3deditorstate.js';
import D3DInfiniteGrid from './d3dinfinitegrid.js';
import D3DTransformGizmo from './d3dtransformgizmo.js';
import D3DComponents from './d3dcomponents.js';
import D3DEventSystem from './d3devents.js';
import D3DPhysics from './d3dphysics.js';
import D3DDimensions from './d3ddimensions.js';

window.THREE = THREE;
window._editor = new D3DEditorState();
window._events = new D3DEventSystem();
window._input = new D3DInput();
window._time = new D3DTime();
window._dimensions = new D3DDimensions();
window._physics = new D3DPhysics();

// Host
window._host = window._editor;

// Add convenience vectors
THREE.Vector3.right = new THREE.Vector3(1, 0, 0);
THREE.Vector3.up = new THREE.Vector3(0, 1, 0);
THREE.Vector3.forward = new THREE.Vector3(0, 0, 1);

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
	
	D3D.showError({title, message, closeEditorWhenDone});
}
async function showConfirm({title = '', message = '', onDeny = null, onConfirm}) {
	const confirm = await D3D.showConfirm({title, message});
	
	if(confirm)
		onConfirm();
	else
		onDeny?.();
}
function closeEditor() {
	D3D.closeEditor();
}

_editor.showError = showError;
_editor.closeEditor = closeEditor;
_editor.showConfirm = showConfirm;

// Main loader
export async function loadD3DProj(uri) {
	// Init root
	await initRoot(uri);
	
	if(!_root.manifest?.editorConfig) {
		_editor.showError({
			title: 'Project Error',
			message: `${fileName(uri)} is not a valid project`,
			closeEditorWhenDone: true
		});
		return;
	}
	if(!_root.manifest.editorConfig.objectStates)
		_root.manifest.editorConfig.objectStates = {}; // guarantee objectStates in ec

	// Setup renderers
	initRenderers();

	// Setup editor camera
	await initEditorCamera();
	
	// Configure editor state
	initEditorConfig();
	
	// Init focus overlay
	initFocusOverlay();

	// Setup composer and passes
	initComposer();

	// Start update + render loop
	startAnimationLoop();

	// Setup resize handling
	setupResize();
	
	// Step clipboard
	setupClipboard();

	// Update editor window title
	D3D.updateEditorWindow({ title: _root.manifest.name });
	
	// Enable object selection via raycasting
	setupSelection();
}

/* ---------------- Helper Functions ---------------- */

async function initRoot(uri) {
	const root = new D3DObject('_root', null);
	window._root = root;
	await root.load(uri);
}

function initRenderers() {
	const scene = _root.object3d;
	const renderer3d = new THREE.WebGLRenderer({ antialias: true });
	const renderer2d = new D2DRenderer({root: _root, addGizmo: true});
	
	renderer3d.setPixelRatio(window.devicePixelRatio);
	renderer3d.setSize(_container3d.clientWidth, _container3d.clientHeight);
	renderer3d.outputEncoding = THREE.sRGBEncoding;
	renderer3d.toneMapping = THREE.ACESFilmicToneMapping;
	renderer3d.toneMappingExposure = 1.0;
	
	renderer2d.setPixelRatio(window.devicePixelRatio);
	renderer2d.setSize(_container2d.clientWidth, _container2d.clientHeight);
	
	_container3d.appendChild(renderer3d.domElement);
	_container2d.appendChild(renderer2d.domElement);
	
	_editor.renderer3d = renderer3d;
	_editor.renderer2d = renderer2d;
}

async function initEditorCamera() {
	const cameraD3DObj = await _root.createObject({
		name: '__EDITOR_CAMERA',
		position: _root.manifest.editorConfig.lastCameraPosition ?? 
			{ x: 0, y: 2, z: 0 },
		rotation: _root.manifest.editorConfig.lastCameraRotation ?? 
			{ x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		editorOnly: true,
		noSelect: true,
		no3DGizmos: true,
		editorAlwaysVisible: true,
		engineScript: 'd3deditorcamera.js',
		uuid: '',
		components: [{
			type: 'Camera',
			properties: {
				fieldOfView: 60,
				clipNear: 0.1,          // was 0.0001
				clipFar: 100000         // was 10000000
			}
		}]
	});
	const editorLight = await cameraD3DObj.createObject({
		name: 'Editor Camera Light',
		position: { x: 0, y: 0, z: 100 },
		rotation: { x: 0, y: THREE.MathUtils.degToRad(180), z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		editorOnly: true,
		noSelect: true,
		no3DGizmos: true,
		engineScript: 'd3deditorlight.js',
		components: [{ type: 'DirectionalLight', properties: {
			color: '0xffffff',
			intensity: 2
		} }]
	});
	
	_editor.editorLight = editorLight;
	_editor.camera = cameraD3DObj.object3d;
	_editor.cameraD3D = cameraD3DObj;
}

function initComposer() {
	const renderer = _editor.renderer3d;
	const camera = _editor.camera;
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
	_editor.outlinePass = outlinePass;
	_editor.gammaCorrectionPass = gammaCorrectionPass;
	_editor.renderPass = renderPass;
}

function initEditorConfig() {
	_editor.project = _root.manifest;
	_editor.config = _editor.project.editorConfig;
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

function updateObject(methods, d3dobj) {
	methods.forEach(method => d3dobj[method]?.());
	d3dobj.children.forEach(child => updateObject(methods, child));
}

function afterRenderShowObjects() {
	_editor.grid.visible = true;
	_root.children.forEach(d3dobject => {
		if(d3dobject.rootParent == _editor.focus.rootParent || d3dobject.__wasVisible === undefined || d3dobject.editorAlwaysVisible)
			return;
		
		d3dobject.__visible = d3dobject.__wasVisible;
		d3dobject.__wasVisible = undefined;
	});
}
function afterRenderHideObjects() {
	_editor.grid.visible = false;
	_root.children.forEach(d3dobject => {
		if(d3dobject.rootParent == _editor.focus.rootParent || d3dobject.isLight || d3dobject.editorAlwaysVisible)
			return;
		
		if(d3dobject.__wasVisible === undefined)
			d3dobject.__wasVisible = d3dobject.__visible;
		
		d3dobject.__visible = false;
	});
}

function startAnimationLoop() {
	const renderer3d = _editor.renderer3d;
	const renderer2d = _editor.renderer2d;
	const composer = _editor.composer;
	const outlinePass = _editor.outlinePass;
	
	function animate(nowMs) {
		_time.tick(nowMs); // updates _time.delta (seconds) + _time.now

		updateObject([
			'__onInternalEnterFrame',
			'__onEditorEnterFrame',
			'onEditorEnterFrame'
		], _root);
		
		render();

		updateObject([
			'__onInternalExitFrame',
			'__onEditorExitFrame',
			'onEditorExitFrame'
		], _root);
		
		_input._afterRenderFrame?.();

		requestAnimationFrame(animate);
	}
	function render() {
		outlinePass.selectedObjects = _editor.selectedObjects
		.filter(d => !!d.object3d)
		.map(d => d.object3d);
		
		_dimensions.update();
		
		if(_editor.mode == '3D') {
			composer.render(); // render 3d
			_editor.gizmo.update();
		}
		
		if(_editor.mode == '2D') {
			renderer2d.render(); // render 2d
			renderer2d.renderGizmos();
		}
		
		if (_editor.focus != _root) {
			afterRenderHideObjects();
			renderer3d.autoClear = false;
			renderer3d.render(_editor._overlayScene, _editor._overlayCam);
			renderer3d.clearDepth();
			const oldBG = _root.object3d.background;
			_root.object3d.background = null;
			renderer3d.render(_root.object3d, _editor.camera);
			_root.object3d.background = oldBG;
			renderer3d.clearDepth();
			renderer3d.render(_editor.gizmo._group, _editor.camera);
			renderer3d.autoClear = true;
			afterRenderShowObjects();
		}
	}
	
	_editor.render = render;

	// init
	_time.tick(performance.now());
	updateObject(['onEditorStart','__onEditorStart'], _root);
	requestAnimationFrame(animate);
}

function setupResize() {
	const renderer3d = _editor.renderer3d;
	const renderer2d = _editor.renderer2d;
	const camera = _editor.camera;
	
	const resizeUpdate = () => {
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
		
		_editor.render();
	};

	// Observe both containers
	const resizeObserver = new ResizeObserver(resizeUpdate);
	resizeObserver.observe(_container3d);
	resizeObserver.observe(_container2d);
	
	// Also handle window resize (fallback for layout shifts)
	window.addEventListener('resize', resizeUpdate);
	
	// Initial update
	resizeUpdate();
}

function setupClipboard() {
	
	window.addEventListener('copy', (e) => {
		if(_input.getInputFieldInFocus())
			return;
		
		_editor.copy();
	}, true);
	
	window.addEventListener('cut', (e) => {
		if(_input.getInputFieldInFocus())
			return;
			
		_editor.cut();
	}, true);
	
	window.addEventListener('paste', async (e) => {
		if(_input.getInputFieldInFocus())
			return;
		
		_editor.paste();
	}, true);
}

function setupSelection() {
	const renderer = _editor.renderer3d;
	const camera = _editor.camera;
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
			
			let owner = obj;
			while (owner && !owner.userData?.d3dobject && owner.parent) 
				owner = owner.parent;
		
			let d3dobj = owner?.userData?.d3dobject;
			if (!d3dobj || d3dobj === _root || d3dobj == _editor.focus || d3dobj.noSelect) 
				return;
			
			// Get the object thats child of _editor.focus
			while(d3dobj.parent != _editor.focus) {
				d3dobj = d3dobj.parent;
				if(!d3dobj)
					break;
			}
			
			if(!d3dobj)
				return;
			
			if(d3dobj.__editorState.locked || d3dobj.noSelect)
				return;
		
			const key = d3dobj.uuid || d3dobj;
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
				if (anyInside) 
					selectedObjects.push(d3dobj);
			}
		}

		if (_input.getKeyDown('shift')) {
			_editor.addSelection(selectedObjects);
		} else {
			_editor.setSelection(selectedObjects);
		}
	});
	
	function singleClickSelect(event) {
		const r = renderer.domElement.getBoundingClientRect();
		const mouse = new THREE.Vector2();
		mouse.x = ((event.clientX - r.left) / r.width) * 2 - 1;
		mouse.y = -((event.clientY - r.top) / r.height) * 2 + 1;

		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObjects(scene.children, true);
		const isDoubleClick = _time.now - _editor.lastSingleClick < 0.25 && _editor.lastSingleClick > 0;
		
		if(!isDoubleClick)
			_editor.lastSingleClick = _time.now;
		else
			_editor.lastSingleClick = 0;
		
		if (_editor.gizmo.mouseOver)
			return;

		if (intersects.length > 0) {
			const d3dobjects = [];

			intersects.forEach(intersect => {
				let parent = intersect.object;
				while (!parent.userData.d3dobject && parent.parent) 
					parent = parent.parent;

				let d3dobj = parent.userData.d3dobject;
				if (!d3dobj || d3dobj == _root || d3dobj == _editor.focus || d3dobj.noSelect) 
					return;
				
				// Get the object thats child of _editor.focus
				while(d3dobj.parent != _editor.focus) {
					d3dobj = d3dobj.parent;
					
					if(!d3dobj)
						break;
				}
				
				if(!d3dobj)
					return;
					
				if(d3dobj.__editorState.locked || d3dobj.noSelect)
					return;
				
				if(!d3dobjects.includes(d3dobj))
					d3dobjects.push(d3dobj);
			});

			const selectedObject = d3dobjects.shift();
			if(selectedObject) {
				if (_input.getKeyDown('shift')) 
					_editor.addSelection([selectedObject]);
				else {
					if(isDoubleClick) {
						_editor.focus = selectedObject;
						_editor.setSelection([]);
					}else
						_editor.setSelection([selectedObject]);
				}
			}else{
				if(isDoubleClick) {
					const oldFocus = _editor.focus;
					_editor.focus = _editor.focus.parent;
					
					if(oldFocus != _root && !oldFocus.__editorState.locked)
						_editor.setSelection([oldFocus]);
				}else{
					_editor.setSelection([]);
				}
			}
		}else{
			if(isDoubleClick) {
				const oldFocus = _editor.focus;
				_editor.focus = _editor.focus.parent;
				
				if(oldFocus != _root)
					_editor.setSelection([oldFocus]);
			}else{
				_editor.setSelection([]);
			}
		}
	}
}

function setupTransformGizmo() {
	const scene = _root.object3d;
	const camera = _editor.camera;
	const renderer = _editor.renderer3d;
	
	// create once
	const gizmo = new D3DTransformGizmo({
		scene,
		camera,
		dom: renderer.domElement,
		getSelected: () => _editor.selectedObjects
	});
	
	// attach/detach on selection changes
	gizmo.attach(_editor.selectedObjects);
	
	_editor.gizmo = gizmo;
}

function addGridHelper() {
	const grid = new D3DInfiniteGrid();
	const scene = _root.object3d;
	scene.add(grid);
	_editor.grid = grid;
	return grid;
}
async function addD3DObjectEditor(type) {
	let name = type;
	
	const newObject = {
		name: name,
		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		components: []
	}
	
	let supported = false;
	
	switch(type) {
		case 'empty':
		case 'camera':
		case 'dirlight':
		case 'amblight':
		case 'pntlight':
		case 'spotlight':
		case 'cube':
		case 'capsule':
		case 'sphere':
		case 'pyramid':
		case 'plane':
		case 'particlesys':
		case 'audiosrc':
			supported = true;
		break;
	}
	if(!supported) {
		_editor.showError(`Unsupported add object '${type}'`);
		return;
	}
	
	const newd3dobj = await _editor.focus.createObject(newObject);
	
	switch(type) {
		case 'camera':
			newd3dobj.name = 'camera';
			newd3dobj.addComponent('Camera');
		break;
		case 'amblight':
			newd3dobj.name = 'ambient light';
			newd3dobj.addComponent('AmbientLight');
		break;
		case 'dirlight':
			newd3dobj.name = 'directional light';
			newd3dobj.addComponent('DirectionalLight');
		break;
		case 'pntlight':
			newd3dobj.name = 'point light';
			newd3dobj.addComponent('PointLight');
		break;
		case 'spotlight':
			newd3dobj.name = 'spot light';
			newd3dobj.addComponent('SpotLight');
		break;
		case 'cube':
		case 'capsule':
		case 'sphere':
		case 'pyramid':
		case 'plane':
			newd3dobj.name = type;
			newd3dobj.addComponent('Mesh', {
				mesh: _root.resolveAssetId(
					`Standard/Models/${upperFirst(type)}.glb`
				),
				materials: [
					_root.resolveAssetId(
						'Standard/Materials/Default.mat'
					)
				]
			});
		break;
		case 'audiosrc':
			newd3dobj.name = 'audio source';
			newd3dobj.addComponent('AudioSource', {});
		break;
		case 'particlesys':
			newd3dobj.name = 'particle system';
			newd3dobj.addComponent('ParticleSystem', {});
		break;
	}
	
	if(_editor.mode != '3D')
		_editor.mode = '3D';
	
	setTimeout(() => {
		_editor.setSelection([newd3dobj]);
	}, 100);
}
function newAsset(extension, data) {
	const ext = !!extension ? `.${extension}` : '';
	let name = 'File';
	switch(extension) {
		case 'mat':
			name = 'Material';
		break;
		case 'html':
			name = 'HTML';
		break;
		case 'anim':
			name = 'New Clip';
		break;
	}
	
	return addNewFile({
		name: `${name}${ext}`,
		data
	})
}
function addNewFile({name, dir, data}) {
	const zip = _root.zip;
	const base = dir || 'assets';
	const path = uniqueFilePath(zip, base, name);
	zip.file(path, data || new Uint8Array());
	
	_editor.onAssetsUpdated();
	
	return path;
}
function writeFileByName({ name, dir, data }) {
	const zip = _root.zip;
	const base = dir || 'assets';
	const path = `${base.replace(/\/$/, '')}/${name}`;
	
	// Always overwrite (or create) this file
	zip.file(path, data || new Uint8Array());

	_editor.onAssetsUpdated();

	return path;
}
function writeFile({ path, data }) {
	const zip = _root.zip;
	zip.file(path, data ?? new Uint8Array());

	_editor.onAssetsUpdated();

	return path;
}
async function readFile(path) {
	const zip = _root.zip;
	const file = zip.file(path);
	if (!file) 
		return null;

	return await file.async("string");
}
function clearDirectory(path) {
	const zip = _root.zip;
	return clearDir(zip, path);
}
function symboliseSelectedObject() {
	if(_editor.selectedObjects.length < 1)
		return;
	
	_editor.selectedObjects.forEach(d3dobject => 
		symboliseObject(d3dobject));
}
function desymboliseSelectedObject() {
	if(_editor.selectedObjects.length < 1)
		return;
	
	_editor.selectedObjects.forEach(d3dobject => 
		desymboliseObject(d3dobject));
}
async function symboliseObject(d3dobject) {
	if(d3dobject.symbol) {
		const e = `${d3dobject.name} is already a symbol`;
		_editor.showError(e);
		console.error(e);
		return;
	}
	
	const symbolId = uuidv4();
	const serializableObject = d3dobject.getSerializableObject();
	const symbol = {
		symbolId: symbolId,
		objData: {...serializableObject, symbolId: symbolId}
	}
	
	_root.__symbols[symbolId] = symbol;
	
	d3dobject.symbolId = symbolId;
	
	const path = _editor.addNewFile({
		name: `${d3dobject.name}.d3dsymbol`,
		data: JSON.stringify(symbol)
	});
	
	symbol.file = _root.zip.file(path);
	
	console.log('Created symbol', symbol);
	
	d3dobject.checkSymbols(); // Ensure other instances understand this is now a symbol
	_editor.updateInspector();
}
async function desymboliseObject(d3dobject) {
	if(!d3dobject.symbol) {
		const e = `${d3dobject.name} is not a symbol`;
		_editor.showError(e);
		console.error(e);
		return;
	}
	
	d3dobject.symbolId = null;
	d3dobject.checkSymbols();
	_editor.updateInspector();
}
function moveObjectToCameraView(d3dobject, opts = {}) {
	// options
	const {
		client = null,            // {x, y} in client/screen coords
		ndc = null,               // {x, y} in normalized device coords (-1..1)
		minDistance = 0.75,       // min distance in front of camera if no hits
		groundY = 0,              // ground plane Y
		useGroundFallback = true, // try ground plane if no scene hits
		excludeSelf = true,       // don't hit the object we're placing
	} = opts;

	const camera = _editor.camera;
	const scene  = _editor.focus.object3d;
	const renderer = _editor.renderer3d; // assumed three.js renderer
	if (!camera) return;

	// --- compute object's bounding radius (for spawn offset) ---
	const threeObj = d3dobject.object3d || null;
	let radius = 0.5;
	if (threeObj) {
		const box = new THREE.Box3().setFromObject(threeObj);
		if (box.isEmpty() === false && isFinite(box.min.x) && isFinite(box.max.x)) {
			const sphere = new THREE.Sphere();
			box.getBoundingSphere(sphere);
			if (Number.isFinite(sphere.radius) && sphere.radius > 0) radius = sphere.radius;
		}
	}

	// --- build a ray from camera through the requested screen point ---
	const rc = new THREE.Raycaster();

	// figure out NDC
	let ndcPoint = new THREE.Vector2(0, 0); // center of screen by default
	if (ndc && typeof ndc.x === 'number' && typeof ndc.y === 'number') {
		ndcPoint.set(ndc.x, ndc.y);
	} else if (client && renderer?.domElement) {
		// convert client coords to NDC
		const rect = renderer.domElement.getBoundingClientRect();
		const x = ((client.x - rect.left) / rect.width) * 2 - 1;
		const y = -(((client.y - rect.top) / rect.height) * 2 - 1);
		ndcPoint.set(x, y);
	}
	rc.setFromCamera(ndcPoint, camera);

	// --- raycast the scene (skip the object we’re placing, if requested) ---
	let intersects = [];
	if (scene) {
		const all = [];
		scene.traverse(o => {
			if (!o || !o.isObject3D) return;
			if (excludeSelf && threeObj && (o === threeObj || threeObj.children?.includes(o))) return;
			all.push(o);
		});
		intersects = rc.intersectObjects(all, true);
	}

	// --- choose a spawn point ---
	let spawn = null;

	// 1) Prefer first geometry hit; nudge back toward camera by radius so it sits on top
	if (intersects && intersects.length) {
		spawn = intersects[0].point.clone();
		// offset back along ray direction so the object rests on the surface
		spawn.add(rc.ray.direction.clone().multiplyScalar(radius + 0.02));
	}

	// 2) If no mesh hit, try a ground plane at Y = groundY
	if (!spawn && useGroundFallback) {
		const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
		const hit = new THREE.Vector3();
		if (rc.ray.intersectPlane(plane, hit)) {
			spawn = hit.clone();
			// lift slightly by radius
			spawn.y += radius * 0.5;
		}
	}

	// 3) Fallback: put it in front of camera
	if (!spawn) {
		const camPos = new THREE.Vector3();
		camera.getWorldPosition(camPos);
		const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

		// keep away from near plane & account for object radius
		const near = camera.near || 0.1;
		const dist = Math.max(minDistance, near * 2 + radius * 1.5);
		spawn = camPos.clone().add(forward.multiplyScalar(dist));
	}
	
	if(_editor.mode == '2D') {
		spawn.z = _editor.focus.getNextHighestDepth(); // always 0 on spawn
	}

	// --- assign world position to the D3D object ---
	d3dobject.worldPosition = { x: spawn.x, y: spawn.y, z: spawn.z };

	// Optional: face the camera for convenience (comment out if not desired)
	// const lookAt = new THREE.Vector3();
	// camera.getWorldPosition(lookAt);
	// d3dobject.lookAt = { x: lookAt.x, y: lookAt.y, z: lookAt.z };
}
async function saveProject(projectURI) {
	if(!projectURI) {
		showError({
			message: 'Invalid project URI'
		});
		console.error('Invalid project URI', projectURI);
		return;
	}
	try {
		await _editor.__save(projectURI);
	}catch(e) {
		_editor.showError({
			message: `Error saving project. ${e}`
		});
	}
	
	_editor.setDirty(false);
}
async function saveProjectAndClose(projectURI) {
	await saveProject(projectURI);
	_editor.setDirty(false);
	_editor.closeEditor();
}
async function buildProject(buildURI, play = false) {
	console.log('Build URI', buildURI);
	try {
		await _editor.__build(buildURI, !play);
	}catch(e) {
		_editor.showError({
			message: `Error building project. ${e}`
		});
	}
	
	if(play) {
		D3D.openPlayer(buildURI);
		_events.invoke('clear-console');
	}
}

// Editor events
function onEditorFocusChanged() {
	const inFocusMode = _editor.focus != _root;
	
	_editor.grayPass.enabled = inFocusMode;
}
function onAssetsUpdated() {
	_editor.onAssetsUpdatedInspector?.();
	_root.updateAssetIndex();
}
function onAssetDeleted(path) {
	const ext = getExtension(path);
	
	if(ext == 'd3dsymbol') {
		const symbol = Object.values(_root.__symbols).find(s => s.file?.name == path);
		
		// Desymbolise all instances of this symbol file
		let desymbolised = 0;
		const objectsToDelete = [];
		for(let uuid in _root.superIndex) {
			const d3dobject = _root.superIndex[uuid];
			
			if(d3dobject.symbol == symbol) {
				desymbolised++;
				objectsToDelete.push(d3dobject);
			}
		}
		objectsToDelete.forEach(d3dobject => d3dobject.delete());
		
		delete _root.__symbols[symbol.symbolId];
		
		//console.log(`Desymbolised ${desymbolised} instance(s) of ${path}`);
		console.log(`Deleted ${desymbolised} instance(s) of ${path}`);
	}
}
async function onImportAssets(paths) {
	const files = await D3D.readAsFiles(paths);
	for(const f of files) {
		await _editor.importFile(f, 'assets');
	}
	onAssetsUpdated();
}
function addComponent(type) {
	const schema = D3DComponents[type];
	
	if(!schema) {
		_editor.showError({
			title: 'Add Component',
			message: `Component ${type} does not exist`
		});
		return;
	}
	if(!schema.is2Dand3D && schema.is2D && _editor.mode != '2D') {
		_editor.showError({
			title: 'Add Component',
			message: `${schema.name} is only for 2D objects`
		});
		return;
	}
	if(!schema.is2Dand3D && !schema.is2D && _editor.mode != '3D') {
		_editor.showError({
			title: 'Add Component',
			message: `${schema.name} is only for 3D objects`
		});
		return;
	}
	if(_editor.selectedObjects.length < 1) {
		_editor.showError({
			title: 'Add Component',
			message: 'No object(s) selected'
		});
		return;
	}
	_editor.selectedObjects.forEach(d3dobject => {
		if(d3dobject.hasComponent(type)) {
			_editor.showError({
				title: 'Add Component',
				message: `Component ${type} already exists on ${d3dobject.name}`
			});
			return;
		}
		
		d3dobject.addComponent(type);
	});
	_editor.updateInspector();
}
function onConsoleMessage({ level, message }) {
	if(level == 'clear') {
		_events.invoke('clear-console');
		return;
	}
	
	_editor.console.push({ level, message });

	const maxLog = 10000;
	
	if (_editor.console.length > maxLog) {
		_editor.console.splice(0, _editor.console.length - maxLog);
	}

	_events.invoke('editor-console', _editor.console);
}
function moveSelectionToView() {
	if(_editor.mode != '3D') {
		_editor.showError({
			title: '3D Mode',
			message: 'This operation is for 3D objects'
		});
		return;
	}
	
	const camerad3d = _editor.cameraD3D;
	const selectedObjects = [..._editor.selectedObjects];
	const camPos = camerad3d.position.clone();
	const camRot = camerad3d.rotation.clone();
	
	const doMove = (recordMstv = true) => {
		selectedObjects.forEach(d3dobject => {
			if(recordMstv) {
				d3dobject.__mstvOrigin = {
					position: d3dobject.position.clone(),
					rotation: d3dobject.rotation.clone()
				}
			}
			
			d3dobject.setPosition(camPos.clone());
			d3dobject.setRotation(camRot.clone());
		});
	}
	const undoMove = () => {
		selectedObjects.forEach(d3dobject => {
			d3dobject.setPosition(d3dobject.__mstvOrigin.position.clone());
			d3dobject.setRotation(d3dobject.__mstvOrigin.rotation.clone())
		});
	}
	
	doMove();
	
	_editor.addStep({
		name: 'Move selection to view',
		undo: () => undoMove(),
		redo: () => doMove(false)
	});
}
function alignSelectionToView() {
	if(_editor.mode != '3D') {
		_editor.showError({
			title: '3D Mode',
			message: 'This operation is for 3D objects'
		});
		return;
	}
	
	const camerad3d = _editor.cameraD3D;
	const selectedObjects = [..._editor.selectedObjects];
	
	const forwardMult = 1;
	const camFwd = camerad3d.forward.multiplyScalar(-1); // THREE.Vector3
	const camPos = camerad3d.position.clone().add(camFwd.multiplyScalar(forwardMult));
	const camRot = camerad3d.rotation.clone();
	
	const doMove = (recordMstv = true) => {
		selectedObjects.forEach(d3dobject => {
			if(recordMstv) {
				d3dobject.__mstvOrigin = {
					position: d3dobject.position.clone(),
					rotation: d3dobject.rotation.clone()
				}
			}
			
			d3dobject.setPosition(camPos.clone());
			d3dobject.setRotation(camRot.clone());
		});
	}
	const undoMove = () => {
		selectedObjects.forEach(d3dobject => {
			d3dobject.setPosition(d3dobject.__mstvOrigin.position.clone());
			d3dobject.setRotation(d3dobject.__mstvOrigin.rotation.clone());
		});
	}
	
	doMove();
	
	_editor.addStep({
		name: 'Move selection to view',
		undo: () => undoMove(),
		redo: () => doMove(false)
	});
}
function dropSelectionToGround() {
	if(_editor.mode != '3D') {
		_editor.showError({
			title: '3D Mode',
			message: 'This operation is for 3D objects'
		});
		return;
	}
	
	const selectedObjects = [..._editor.selectedObjects];
	
	const doMove = (recordDtg = true) => {
		selectedObjects.forEach(d3dobject => {
			if(recordDtg) {
				d3dobject.__dtgOrigin = {
					position: d3dobject.position.clone(),
					rotation: d3dobject.rotation.clone()
				}
			}
			
			dropToGroundIfPossible(d3dobject);
		});
	}
	const undoMove = () => {
		selectedObjects.forEach(d3dobject => {
			d3dobject.setPosition(d3dobject.__dtgOrigin.position.clone());
			d3dobject.setRotation(d3dobject.__dtgOrigin.rotation.clone())
		});
	}
	
	doMove();
	
	_editor.addStep({
		name: 'Drop selection to ground',
		undo: () => undoMove(),
		redo: () => doMove(false)
	});
}
function zoomIn2D() {
	_editor.renderer2d.gizmo._zoomStep(+1);
}
function zoomOut2D() {
	_editor.renderer2d.gizmo._zoomStep(-1);
}
function resetView2D() {
	_editor.renderer2d._editor.viewOffset = new THREE.Vector2();
	_editor.renderer2d._editor.viewScale = 1;
}
function resetView() {
	if(_editor.mode == '2D') {
		_editor.resetView2D();
	}else
	if(_editor.mode == '3D') {
		_editor.cameraD3D.position = new THREE.Vector3();
		_editor.cameraD3D.rotation = new THREE.Vector3();	
	}
}
function zoomStep(step) {
	if(step > 0)
		step = 1;
	else
		step = -1;
		
	if(_editor.mode == '2D') {
		_editor.renderer2d.gizmo._zoomStep(step);
	}else
	if(_editor.mode == '3D') {
		_editor.camera.translateZ(-step);
	}
}
function focusOnSelected() {
	if(_editor.selectedObjects.length < 1) {
		_editor.showError({
			title: 'Focus',
			message: 'Select object(s) to focus on'
		});
		return;
	}
	if(_editor.mode == '3D')
		_editor.focusOnSelectedObjects?.(); // editor camera managed
	else
	if(_editor.mode == '2D')
		_editor.renderer2d.gizmo.focusSelected2D();
}

// INTERNAL

_editor.onEditorFocusChanged = onEditorFocusChanged;
_editor.onAssetDroppedIntoGameView = onAssetDroppedIntoGameView;
_editor.onAssetDeleted = onAssetDeleted;
_editor.onAssetsUpdated = onAssetsUpdated;
_editor.addNewFile = addNewFile;
_editor.writeFile = writeFile;
_editor.readFile = readFile;
_editor.newAsset = newAsset;
_editor.clearDirectory = clearDirectory;
_editor.saveProject = saveProject;
_editor.moveObjectToCameraView = moveObjectToCameraView;
_editor.onConsoleMessage = onConsoleMessage;
_editor.buildProject = buildProject;
_editor.symboliseSelectedObject = symboliseSelectedObject;
_editor.desymboliseSelectedObject = desymboliseSelectedObject;
_editor.moveSelectionToView = moveSelectionToView;
_editor.alignSelectionToView = alignSelectionToView;
_editor.dropSelectionToGround = dropSelectionToGround;
_editor.zoomIn2D = zoomIn2D;
_editor.zoomOut2D = zoomOut2D;
_editor.zoomStep = zoomStep;
_editor.resetView = resetView;
_editor.resetView2D = resetView2D;

D3D.setEventListener('select-all', () => _editor.selectAll());
D3D.setEventListener('delete', () => _editor.delete());
D3D.setEventListener('undo', () => _editor.undo());
D3D.setEventListener('redo', () => _editor.redo());
D3D.setEventListener('dupe', () => _editor.dupe());
D3D.setEventListener('edit-code', () => _editor.editCode());
D3D.setEventListener('save-project', (uri) => saveProject(uri));
D3D.setEventListener('request-save-and-close', (uri) => saveProjectAndClose(uri));
D3D.setEventListener('build', (buildURI, play) => buildProject(buildURI, play));

D3D.setEventListener('add-object', (type) => addD3DObjectEditor(type));
D3D.setEventListener('symbolise-object', () => symboliseSelectedObject());
D3D.setEventListener('desymbolise-object', () => desymboliseSelectedObject());
D3D.setEventListener('focus-object', () => focusOnSelected());
D3D.setEventListener('set-tool', (type) => _editor.setTool(type));
D3D.setEventListener('set-transform-tool', (type) => _editor.setTransformTool(type));
D3D.setEventListener('new-asset', (extension) => _editor.newAsset(extension));
D3D.setEventListener('add-component', (type) => addComponent(type));
D3D.setEventListener('menu-import-assets', onImportAssets);
D3D.setEventListener('csm', onConsoleMessage);
D3D.setEventListener('copy-special', (type) => _editor.copySpecial(type));
D3D.setEventListener('paste-special', (type) => _editor.pasteSpecial(type));
D3D.setEventListener('group', () => _editor.groupObjects(_editor.selectedObjects));
D3D.setEventListener('ungroup', () => _editor.ungroupObjects(_editor.selectedObjects));
D3D.setEventListener('merge', () => _editor.mergeObjects(_editor.selectedObjects));
D3D.setEventListener('ctx-menu-action', (id) => _events.invoke('ctx-menu-action', id));
D3D.setEventListener('move-sel-view', () => _editor.moveSelectionToView());
D3D.setEventListener('align-sel-view', () => _editor.alignSelectionToView());
D3D.setEventListener('drop-to-ground', () => _editor.dropSelectionToGround());
D3D.setEventListener('zoom-step', (step) => _editor.zoomStep(step));
D3D.setEventListener('reset-view', () => _editor.resetView());