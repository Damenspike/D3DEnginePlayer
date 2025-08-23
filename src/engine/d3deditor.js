// d3deditor.js
const three = require('three');
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
	// Create a new root context
	rootContext = new D3DObject('_root', null);
	window._root = rootContext;
	await rootContext.load(uri);
	
	// Rendering setup
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(_container3d.clientWidth, _container3d.clientHeight);
	
	_container3d.appendChild(renderer.domElement);
	
	/*
		Add editor camera
	*/
	const cameraD3DObj = await _root.createObject({
		name: '__EDITOR_CAMERA',
		position: {x: 0, y: 0, z: 0},
		rotation: {x: 0, y: 0, z: 0},
		scale: {x: 1, y: 1, z: 1},
		editorOnly: true,
		engineScript: 'd3deditorcamera.js',
		uuid: '',
		components: [
			{
				type: 'Camera',
				properties: {}
			}
		]
	});
	const camera = cameraD3DObj.object3d;
	
	/*
		Configure editor
	*/
	_editor.project = _root.manifest;
	_editor.config = _editor.project.editorConfig;
	_editor.camera = camera;
	_editor.gridHelper = addGridHelper();
	
	if(!_editor.config) {
		throw new Error('Missing editor configuration');
	}
	
	function updateObject(method, d3dobj) {
		d3dobj[method]?.();
		d3dobj.children.forEach(child => updateObject(method, child));
	}

	function animate() {
		updateObject('beforeEditorRenderFrame', _root);
		
		requestAnimationFrame(animate);
		if (camera) renderer.render(_root.object3d, camera);
		else console.warn('No camera found for rendering');
		
		_time.delta = _time.now - _time.lastRender;
		_time.lastRender = _time.now;

		updateObject('afterEditorRenderFrame', _root);
		_input._afterRenderFrame?.();
	}

	_time.lastRender = _time.now;
	updateObject('onEditorStart', _root);
	updateObject('_onEditorStart', _root);
	animate();
	
	const resizeUpdate = () => {
		const width = _container3d.clientWidth;
		const height = _container3d.clientHeight;
		renderer.setSize(width, height);
		if (camera) {
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		}
	}
	
	const resizeObserver = new ResizeObserver(resizeUpdate);
	window.addEventListener('resize', resizeUpdate);
	resizeObserver.observe(_container3d);
	
	// Update editor window
	ipcRenderer.send('update-editor-window', {
		title: _root.manifest.name
	});
}
function addGridHelper() {
	const grid = new D3DInfiniteGrid();
	
	_root.object3d.add(grid);
	
	return grid;
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