// d3deditor.js
const three = require('three');
const { EffectComposer } = require('three/examples/jsm/postprocessing/EffectComposer.js');
const { RenderPass } = require('three/examples/jsm/postprocessing/RenderPass.js');
const { OutlinePass } = require('three/examples/jsm/postprocessing/OutlinePass.js');
const { GammaCorrectionShader } = require('three/examples/jsm/shaders/GammaCorrectionShader.js');
const { ShaderPass } = require('three/examples/jsm/postprocessing/ShaderPass.js');
const { ipcRenderer } = require('electron');
import D3DObject from './d3dobject.js';
import D3DInput from './d3dinput.js';
import D3DTime from './d3dtime.js';
import D3DEditorState from './d3deditorstate.js';
import D3DInfiniteGrid from './d3dinfinitegrid.js';

let rootContext;

window.THREE = three;
window._container3d = document.getElementById('game-container');
window._input = new D3DInput();
window._time = new D3DTime();
window._editor = new D3DEditorState();

// Add convenience vectors
THREE.Vector3.right = new THREE.Vector3(1, 0, 0);
THREE.Vector3.up = new THREE.Vector3(0, 1, 0);
THREE.Vector3.forward = new THREE.Vector3(0, 0, 1);

// Error handling
function showError({title, message, closeEditorWhenDone}) {
	ipcRenderer.send('show-error', {title, message, closeEditorWhenDone});
}
function closeEditor() {
	ipcRenderer.send('close-editor');
}

// Main loader
async function loadD3DProj(uri) {
	// Init root
	await initRoot(uri);

	// Setup renderer
	const renderer = initRenderer();

	// Setup editor camera
	const camera = await initEditorCamera();

	// Setup composer and passes
	const { composer, outlinePass } = initComposer(renderer, camera);

	// Configure editor state
	initEditorConfig(camera);

	// Start update + render loop
	startAnimationLoop(composer, outlinePass);

	// Setup resize handling
	setupResize(renderer, camera);

	// Update editor window title
	ipcRenderer.send('update-editor-window', { title: _root.manifest.name });

	// Enable object selection via raycasting
	setupSelection(renderer, camera);
	
	// Setup inspector
	updateInspector();
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
		engineScript: 'd3deditorcamera.js',
		uuid: '',
		components: [{ type: 'Camera', properties: {} }]
	});
	return cameraD3DObj.object3d;
}

function initComposer(renderer, camera) {
	const scene = _root.object3d;
	const composer = new EffectComposer(renderer);

	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	const outlinePass = new OutlinePass(
		new THREE.Vector2(_container3d.clientWidth, _container3d.clientHeight),
		scene,
		camera
	);
	composer.addPass(outlinePass);

	const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
	composer.addPass(gammaCorrectionPass);

	// Outline styling
	outlinePass.edgeStrength = 6.0;
	outlinePass.edgeGlow = 0.0;
	outlinePass.edgeThickness = 4.0;
	outlinePass.pulsePeriod = 0;
	outlinePass.visibleEdgeColor.set('#0099ff');
	outlinePass.hiddenEdgeColor.set('#000000');

	return { composer, outlinePass };
}

function initEditorConfig(camera) {
	_editor.project = _root.manifest;
	_editor.config = _editor.project.editorConfig;
	_editor.camera = camera;
	_editor.gridHelper = addGridHelper();
	_editor.setTool('select'); // default tool

	if (!_editor.config) {
		throw new Error('Missing editor configuration');
	}
}

function updateObject(method, d3dobj) {
	d3dobj[method]?.();
	d3dobj.children.forEach(child => updateObject(method, child));
}

function startAnimationLoop(composer, outlinePass) {
	function animate() {
		updateObject('beforeEditorRenderFrame', _root);

		requestAnimationFrame(animate);
		updateInspector();

		_time.delta = _time.now - _time.lastRender;
		_time.lastRender = _time.now;

		outlinePass.selectedObjects = _editor.selectedObjects.map(d3dobj => d3dobj.object3d);
		composer.render();

		updateObject('afterEditorRenderFrame', _root);
		_input._afterRenderFrame?.();
	}

	_time.lastRender = _time.now;
	updateObject('onEditorStart', _root);
	updateObject('_onEditorStart', _root);
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
		if (!startPoint) return;
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
			_editor.selectedObjects.push(...selectedObjects);
		} else {
			_editor.selectedObjects = selectedObjects;
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
			if (selectedObject) {
				if (_input.getKeyDown('shift')) _editor.selectedObjects.push(selectedObject);
				else _editor.selectedObjects = [selectedObject];
			} else {
				_editor.selectedObjects = [];
			}
		}else{
			_editor.selectedObjects = [];
		}
	}
}

function addGridHelper() {
	const grid = new D3DInfiniteGrid();
	const scene = _root.object3d;
	scene.add(grid);
	return grid;
}

function updateInspector(updateAll = false) {
	function bindInputField(element, value, onChange) {
		element.val(value);
		
		if(element._blurAdded)
			return;
			
		element.on('blur', function() {
			const val = $(this).val();
			
			onChange(val, element);
		})
		.on('keypress', function(e) {
			if (e.which === 13) 
				$(this).blur();
		});
		
		element._blurAdded = true;
	}
	const gui = _editor.gui;
	const project = _editor.project;
	const selectedObject = _editor.selectedObjects.length > 0 ? _editor.selectedObjects[0] : null;
	
	if(selectedObject !== gui.selectedObject || updateAll) {
		
		if(selectedObject) {
			$('#insp-cell-object').show();
			
			bindInputField(
				$("#insp-object-name"), 
				selectedObject.name,
				(val, element) => {
					if(val && selectedObject.isNameAllowed(val)) {
						selectedObject.name = val;
					} else {
						element.val(selectedObject.name);
						showError({
							message: `Invalid object name`
						});
					}
				}
			);
			bindInputField(
				$("#insp-object-pos-x"), 
				selectedObject.position.x,
				(val, element) => {
					selectedObject.position.x = Number(val) || 0;
				}
			);
			bindInputField(
				$("#insp-object-pos-y"), 
				selectedObject.position.y,
				(val, element) => {
					selectedObject.position.y = Number(val) || 0;
				}
			);
			bindInputField(
				$("#insp-object-pos-z"), 
				selectedObject.position.z,
				(val, element) => {
					selectedObject.position.z = Number(val) || 0;
				}
			);
			
			bindInputField(
				$("#insp-object-rot-x"), 
				selectedObject.rotation.x,
				(val, element) => {
					selectedObject.rotation.x = Number(val) || 0;
				}
			);
			bindInputField(
				$("#insp-object-rot-y"), 
				selectedObject.rotation.y,
				(val, element) => {
					selectedObject.rotation.y = Number(val) || 0;
				}
			);
			bindInputField(
				$("#insp-object-rot-z"), 
				selectedObject.rotation.z,
				(val, element) => {
					selectedObject.rotation.z = Number(val) || 0;
				}
			);
			
			bindInputField(
				$("#insp-object-scale-x"), 
				selectedObject.scale.x,
				(val, element) => {
					selectedObject.scale.x = Number(val) || 0;
				}
			);
			bindInputField(
				$("#insp-object-scale-y"), 
				selectedObject.scale.y,
				(val, element) => {
					selectedObject.scale.y = Number(val) || 0;
				}
			);
			bindInputField(
				$("#insp-object-scale-z"), 
				selectedObject.scale.z,
				(val, element) => {
					selectedObject.scale.z = Number(val) || 0;
				}
			);
		}else{
			$('#insp-cell-object').hide();
		}
		
		gui.selectedObject = selectedObject;
	}
	if(project !== gui.project || updateAll) {
		
		bindInputField(
			$("#insp-project-name"), 
			_editor.project.name,
			(val, element) => {
				if(val) {
					_editor.project.name = val;
				} else {
					element.val(_editor.project.name);
					showError({
						message: `Invalid project name`
					});
				}
			}
		);
		bindInputField(
			$("#insp-project-author"), 
			_editor.project.author,
			(val, element) => {
				_editor.project.author = val;
			}
		);
		bindInputField(
			$("#insp-project-dimensions-width"), 
			_editor.project.width,
			(val, element) => {
				const width = Math.max(10, Math.min(3000, Number(val)));
				_editor.project.width = width;
				element.val(width);
			}
		);
		bindInputField(
			$("#insp-project-dimensions-height"), 
			_editor.project.height,
			(val, element) => {
				const height = Math.max(10, Math.min(3000, Number(val)));
				_editor.project.height = height;
				element.val(height);
			}
		);
		
		gui.project = project;
	}
}

ipcRenderer.on('d3dproj-load', async (_, uri) => {
	try {
		await loadD3DProj(uri);
	}catch(e) {
		throw e;
		showError({
			title: 'Could not open project',
			message: `There was an error trying to open this project. ${e}`,
			closeEditorWhenDone: true
		});
	}
});
ipcRenderer.once('show-error-closed', (_, closeEditorWhenDone) => {
	if(closeEditorWhenDone)
		closeEditor();
});