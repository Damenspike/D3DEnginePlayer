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
	readLocalTRSFromZip
} from './d3dutility.js';

import $ from 'jquery';
import D3DObject from './d3dobject.js';
import D3DInput from './d3dinput.js';
import D3DTime from './d3dtime.js';
import D3DEditorState from './d3deditorstate.js';
import D3DInfiniteGrid from './d3dinfinitegrid.js';
import D3DTransformGizmo from './d3dtransformgizmo.js';
import D3DComponents from './d3dcomponents.js';

window.THREE = THREE;
window._input = new D3DInput();
window._time = new D3DTime();
window._editor = new D3DEditorState();

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
	
	// Step clipboard
	setupClipboard();

	// Update editor window title
	D3D.updateEditorWindow({ title: _root.manifest.name });

	// Enable object selection via raycasting
	setupSelection(renderer, camera);
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
		no3DGizmos: true,
		editorAlwaysVisible: true,
		engineScript: 'd3deditorcamera.js',
		uuid: '',
		components: [{ type: 'Camera', properties: {clipNear: 0.0001} }]
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
		
		d3dobject.__visible = d3dobject.__wasVisible;
		d3dobject.__wasVisible = undefined;
	});
}
function afterRenderHideObjects() {
	_root.children.forEach(d3dobject => {
		if(d3dobject == _editor.focus || d3dobject.isLight || d3dobject.editorAlwaysVisible)
			return;
		
		if(d3dobject.__wasVisible === undefined)
			d3dobject.__wasVisible = d3dobject.__visible;
		
		d3dobject.__visible = false;
	});
}

function startAnimationLoop(composer, outlinePass) {
	function animate() {
		updateObject('onEditorEnterFrame', _root);
		updateObject('__onEditorEnterFrame', _root);

		requestAnimationFrame(animate);

		_time.delta = _time.now - _time.lastRender;
		_time.lastRender = _time.now;

		outlinePass.selectedObjects = _editor.selectedObjects.map(d3dobj => d3dobj.object3d);
		composer.render();
		
		if(_editor.gizmo)
			_editor.gizmo.update();
		
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
		
		updateObject('onEditorExitFrame', _root);
		updateObject('__onEditorExitFrame', _root);
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
				
				if(!d3dobjects.includes(d3dobj))
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
			newObject.name = 'camera';
			newObject.components.push({
				type: 'Camera', 
				properties: {}
			});
		break;
		case 'dirlight':
			newObject.name = 'directional light';
			newObject.components.push({
				type: 'DirectionalLight', 
				properties: {}
			});
		break;
		case 'pntlight':
			newObject.name = 'point light';
			newObject.components.push({
				type: 'PointLight', 
				properties: {}
			});
		break;
		case 'html':
			newObject.name = 'html overlay';
			newObject.components.push({
				type: 'HTML', 
				properties: {}
			});
		break;
		case 'cube':
			newObject.name = 'cube';
			newObject.components.push({
				type: 'Mesh', 
				properties: {
					mesh: _root.resolveAssetId(
						'Standard/Models/Cube.glb'
					),
					materials: [
						_root.resolveAssetId(
							'Standard/Materials/Default.mat'
						)
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
	
	newObject.components.forEach(component => {
		const schema = D3DComponents[component.type];
		
		if(!schema) {
			console.warn('Unknown schema for ', component.type);
			return;
		}
		
		for(let prop in schema.fields) {
			if(component.properties[prop] !== undefined)
				continue;
			
			component.properties[prop] = schema.fields[prop].def;
		}
	});
	
	const newd3dobj = await _editor.focus.createObject(newObject);
	
	_editor.setSelection([newd3dobj]);
}
function newAsset(extension) {
	const ext = !!extension ? `.${extension}` : '';
	let name = 'File';
	switch(extension) {
		case 'mat':
			name = 'Material';
		break;
		case 'html':
			name = 'HTML';
		break;
	}
	
	addNewFile({
		name: `${name}${ext}`
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
function moveObjectToCameraView(d3dobject, distance = 1) {
	const cameraWorldPos = new THREE.Vector3();
	_editor.camera.getWorldPosition(cameraWorldPos);
	
	const forward = new THREE.Vector3(0, 0, -1)
		.applyQuaternion(_editor.camera.quaternion).normalize();
	const spawnPos = cameraWorldPos.clone().add(forward.multiplyScalar(distance));
	
	d3dobject.worldPosition = { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z };
}
async function saveProject() {
	try {
		await _editor.__save();
	}catch(e) {
		_editor.showError({
			message: `Error saving project. ${e}`
		});
	}
	
	_editor.setDirty(false);
}
async function saveProjectAndClose() {
	await saveProject();
	_editor.setDirty(false);
	_editor.closeEditor();
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
async function onAssetDroppedIntoGameView(path, screenPos) {
	const { sx, sy } = screenPos;
	const zip = _root.zip;
	const ext = getExtension(path);

	switch (ext) {
		case 'd3dsymbol': {
			const symbol = Object.values(_root.__symbols)
				.find(symbol => symbol.file.name === path);

			if (!symbol) {
				console.warn('Could not find symbol by path', path);
				break;
			}

			const d3dobject = await _editor.focus.createObject({
				symbolId: symbol.symbolId
			});
			moveObjectToCameraView(d3dobject);
			_editor.setSelection([d3dobject]);
			break;
		}
		case 'glbmodel':
		case 'glbtfmodel': {
			const listSubmeshGLBs = (folderPath) => {
				const dir = folderPath.endsWith('/') ? folderPath : (folderPath + '/');
				const list = [];
				zip.forEach((rel, f) => {
					if (!f.dir && rel.startsWith(dir) && rel.toLowerCase().endsWith('.glb')) {
						list.push(rel);
					}
				});
				list.sort((a,b) => a.localeCompare(b));
				return list;
			};
			
			const meshes = listSubmeshGLBs(path);
			const parent = await _editor.focus.createObject({
				name: fileNameNoExt(path.endsWith('/') ? path.slice(0, -1) : path)
			});
			
			moveObjectToCameraView(parent);
			
			for (const meshPath of meshes) {
				const trs = await readLocalTRSFromZip(zip, meshPath);
				await parent.createObject({
					name: fileNameNoExt(meshPath),
					position: trs.position,
					rotation: trs.rotation,
					scale: trs.scale,
					components: [{ type: 'Mesh', properties: { mesh: _root.resolveAssetId(meshPath), materials: [] } }]
				});
			}
			
			_editor.setSelection([parent]);
			break;
		}
		case 'glb':
		case 'gltf': {
			const trs = await readLocalTRSFromZip(zip, path);
			const d3dobject = await _editor.focus.createObject({
				name: fileNameNoExt(path),
				position: trs.position,
				rotation: trs.rotation,
				scale: trs.scale,
				components: [{ type: 'Mesh', properties: { mesh: _root.resolveAssetId(path), materials: [] } }]
			});
			moveObjectToCameraView(d3dobject);
			_editor.setSelection([d3dobject]);
			break;
		}
	}
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

D3D.setEventListener('delete', () => _editor.onDeleteKey());
D3D.setEventListener('undo', () => _editor.undo());
D3D.setEventListener('redo', () => _editor.redo());
D3D.setEventListener('dupe', () => _editor.dupe());
D3D.setEventListener('edit-code', () => _editor.editCode());
D3D.setEventListener('save-project', () => saveProject());
D3D.setEventListener('request-save-and-close', () => saveProjectAndClose());
D3D.setEventListener('import-asset', () => null); // idk how to do this yet

D3D.setEventListener('add-object', (type) => addD3DObjectEditor(type));
D3D.setEventListener('symbolise-object', (type) => symboliseSelectedObject(type));
D3D.setEventListener('desymbolise-object', (type) => desymboliseSelectedObject(type));
D3D.setEventListener('focus-object', (type) => _editor.focusOnSelectedObjects?.());
D3D.setEventListener('set-tool', (type) => _editor.setTool(type));
D3D.setEventListener('set-transform-tool', (type) => _editor.setTransformTool(type));
D3D.setEventListener('new-asset', (extension) => _editor.newAsset(extension));