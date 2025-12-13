import * as THREE from 'three';
import D3DConsole from './d3dconsole.js';

import {
	handleImportFile
} from './d3deditorimporter.js';
import {
	getSelectionCenter
} from './d3dutility.js';
import {
	mergeGraphic2Ds
} from './d2ddraw.js';
import { 
	obfuscate 
} from './damenscript-obfuscate.js';
import {
	getExtension,
	cloneZip
} from './d3dutility.js';
import {
	createImageFromData
} from './d2dbitmapconvert.js';

// Tool enum
export const Tools = Object.freeze({
	Select: 'select',
	Look: 'look',
	Pan: 'pan',
	Transform: 'transform',
	Brush: 'brush',
	Pencil: 'pencil',
	Line: 'line',
	Square: 'square',
	Circle: 'circle',
	Polygon: 'polygon',
	Fill: 'fill',
	Text: 'text'
});
export const TransformTools = Object.freeze({
	Translate: 'translate',
	Rotate: 'rotate',
	Scale: 'scale'
});

// Undo/redo
const stepLimit = 100;

export default class D3DEditorState {
	get focus() {
		return this._focus ?? _root;
	}
	set focus(value) {
		this._focus = value ?? _root;
		this.onEditorFocusChanged?.();
		_events.invoke('editor-focus', value);
		_editor.updateInspector?.();
	}
	
	get mode() {
		if(this._mode != '2D' && this._mode != '3D')
			return '3D'; // default
		
		return this._mode;
	}
	set mode(value) {
		if(value != '2D' && value != '3D')
			value = '3D';
		
		this._mode = value;
		
		if(window._root)
			this.focus = null;
			
		if(this._mode == '3D' && this.tool == 'transform')
			this.tool = 'select';
		
		_input.clearKeyState();
		
		_events.invoke('editor-mode', value);
		_editor.updateInspector?.();
		_editor.setSelection([]);
	}
	
	get tool() {
		return this._tool ?? Tools.Select;
	}
	set tool(v) {
		if (Object.values(Tools).includes(v)) {
			this._tool = v;
		} else {
			console.warn(`Invalid tool: ${tool}. Falling back to default.`);
			this._tool = Tools.Select;
		}
		
		if(window._events) // sometimes not ready yet
			_events.invoke('editor-tool', this._tool);
	}
	
	get lightsEnabled() {
		return this._lightsEnabled && _editor.focus == _root;
	}
	set lightsEnabled(v) {
		this._lightsEnabled = !!v;
	}
	
	constructor() {
		this.gui = {};
		this.project = null;
		this.camera = null;
		this.tool = Tools.Select;
		this.transformTool = TransformTools.Translate;
		this.selectedObjects = [];
		this.renderer = null;
		this.gizmo = null;
		this.steps = [];
		this.currentStep = -1;
		this.animationDefaultFps = 60;
		this.console = [];
		this.lastSingleClick = 0;
		this._mode = '3D';
		this._lightsEnabled = false;
		this.pastes = 0;
		this.draw2d = {
			fill: true,
			line: true,
			fillColor: '#FFFFFFFF',
			lineColor: '#000000FF', 
			brushRadius: 1, 
			borderRadius: 0,
			lineWidth: 5, // stroke
			snapToPoints: true,
			snapToObjects: true,
			subtract: false,
			closePolygon: true
		}
	}

	setMode(mode) {
		this.mode = mode;
	}
	setTool(tool) {
		this.tool = tool;
	}
	
	setTransformTool(tool) {
		if (Object.values(TransformTools).includes(tool)) {
			this.transformTool = tool;
		} else {
			console.warn(`Invalid transform tool: ${tool}. Falling back to default.`);
			this.transformTool = TransformTools.Translate;
		}
		
		_events.invoke('editor-transform-tool', tool);
		
		if(this.gizmo) {
			switch(this.transformTool) {
				case TransformTools.Translate:
					this.gizmo.setMode('translate');
				break;
				case TransformTools.Rotate:
					this.gizmo.setMode('rotate');
				break;
				case TransformTools.Scale:
					this.gizmo.setMode('scale');
				break;
			}
		}
	}

	getTool() {
		return this.tool;
	}
	getTransformTool() {
		return this.transformTool;
	}
	
	isPartOfFocus(object) {
		let parent = object.parent;
		
		if(object == this.focus)
			return true;
		
		while(parent) {
			if(parent == this.focus)
				return true;
			parent = parent.parent;
		}
		
		return false;
	}
	addSelectionStep(oldSelection, newSelection) {
		this.addStep({
			name: 'Selection',
			undo: () => this.setSelection(oldSelection, false),
			redo: () => this.setSelection(newSelection, false)
		});
	}
	setSelection(selectObjects, addStep = true, deselectAssets = true) {
		if(!selectObjects || !Array.isArray(selectObjects))
			selectObjects = [];
			
		const objects = [];
		
		selectObjects.forEach(object => {
			if(objects.includes(object))
				return;
			
			if(object.part || this.isPartOfFocus(object))
				objects.push(object);
		});
		
		addStep && this.addSelectionStep(
			[...this.selectedObjects],
			[...objects]
		);
		
		this.selectedObjects = objects;
		this.selectedObjects = this.selectedObjects.filter(o => o != _root);
		deselectAssets && this.selectNoAssets?.();
		this.probeSelection();
	}
	addSelection(selectObjects, addStep = true) {
		if(!selectObjects || !Array.isArray(selectObjects))
			selectObjects = [];
			
		selectObjects = selectObjects.filter(object => !this.selectedObjects.includes(object));
			
		const objects = [];
		
		selectObjects.forEach(object => {
			if(object.part || this.isPartOfFocus(object))
				objects.push(object);
		});
			
		addStep && this.addSelectionStep(
			[...this.selectedObjects],
			[...this.selectedObjects, ...objects]
		);
		
		this.selectedObjects.push(...objects);
		this.selectedObjects = this.selectedObjects.filter(o => o != _root);
		this.selectNoAssets?.();
		this.probeSelection();
	}
	removeSelection(objects, addStep = true) {
		const oldSelection = [...this.selectedObjects];
		
		objects.forEach(object => {
			if(!this.selectedObjects.includes(object))
				return;
			
			this.selectedObjects.splice(
				this.selectedObjects.indexOf(object),
				1
			);
		});
		
		addStep && this.addSelectionStep(
			oldSelection,
			[...this.selectedObjects]
		);
		
		this.selectedObjects = this.selectedObjects.filter(o => o != _root);
		this.probeSelection();
	}
	probeSelection() {
		_events.invoke('selected-objects', this.selectedObjects);
		_events.invoke('deselect-animation-editor');
		_events.invoke('deselect-2dpoints');
	}
	isSelected(object) {
		return this.selectedObjects.includes(object);
	}
	
	addStep({ name, undo, redo }) {
		if (this._isReplaying) return; // don't record steps caused by undo/redo
	
		// drop future steps if we've undone
		if (this.currentStep < this.steps.length - 1) {
			this.steps = this.steps.slice(0, this.currentStep + 1);
		}
	
		this.steps.push({ name, undo, redo });
		this.currentStep = this.steps.length - 1;
	
		// enforce limit
		if (this.steps.length > stepLimit) {
			const drop = this.steps.length - stepLimit;
			this.steps.splice(0, drop);
			this.currentStep -= drop;
			if (this.currentStep < -1) this.currentStep = -1;
		}
	}
	
	async undo() {
		if (!this.canUndo()) {
			console.log('Nothing to undo');
			return;
		}
		const step = this.steps[this.currentStep];
		this._isReplaying = true;
		this.currentStep--;
		try {
			await step.undo?.();
		} catch (e) {
			console.error('D3DEditor error executing undo', e);
		} finally {
			this._isReplaying = false;
		}
		
		this.updateInspector?.();
	}
	
	async redo() {
		if (!this.canRedo()) {
			console.log('Nothing to redo');
			return;
		}
		const step = this.steps[this.currentStep + 1];
		this._isReplaying = true;
		this.currentStep++;
		try {
			await step.redo?.();
		} catch (e) {
			console.error('D3DEditor error executing redo', e);
		} finally {
			this._isReplaying = false;
		}
		
		this.updateInspector?.();
	}
	
	canUndo() { return this.currentStep >= 0; }
	canRedo() { return this.currentStep < this.steps.length - 1; }
	
	resetSteps() {
		this.steps = [];
		this.currentStep = -1;
	}
	
	async dupe(addStep = true) {
		if(this.selectedObjects.length < 1) {
			_editor.__dupeInspector?.(); // inspector handle possible asset duplication
			return;
		}
		const clipboard = [];
		this.selectedObjects.forEach(d3dobject => {
			clipboard.push(d3dobject.getSerializableObject());
		});
		
		await this.pasteFrom({clip: clipboard, action: 'Duplicate'});
		
		// dont return anything for some reason the event listener in d3deditor.js freezes the whole app for 3 secs if something gets returned here?!
	}
	
	setDirty(dirty) {
		D3D.setDirty(dirty);
	}
	
	// .d3dproj
	async __save(projectURI) {
		if(this.__saving) {
			console.warn('Project is already saving');
			return;
		}
		
		const zip = _root?.zip;
		
		this.__saving = true;
		_events.invoke('editor-building', true);
		D3DConsole.clear();
		D3DConsole.log('Saving...');
		
		D3DConsole.log('[1/3] Making...');
		await this.__doBuild(zip, {
			isEditorBuild: true
		});
		
		D3DConsole.log('[2/3] Storing...');
		///////////////////////////////////
		// -- Save zip itself --
		const t = _time.now;
		const zipData = await zip.generateAsync({ 
			type: 'arraybuffer',
			compression: 'STORE' // d3dproj no compression
		});
		
		D3DConsole.log('[3/3] Writing...');
		
		await D3D.saveProjectFile(zipData, projectURI);
		
		this.__saving = false;
		_events.invoke('editor-building', false);
		
		D3DConsole.log(`Project saved. Time elapsed ${Number(_time.now - t).toFixed(2)}s.`);
	}
	
	// .d3d
	async __build(buildURI, opts = {}) {
		if(this.__saving) {
			console.warn('Project is already saving');
			return;
		}
		
		this.__saving = true;
		_events.invoke('editor-building', true);
		
		D3DConsole.clear();
		D3DConsole.log('Building...');
		
		D3DConsole.log('[1/4] Cloning...');
		const zip = await cloneZip(_root?.zip);
		
		D3DConsole.log('[2/4] Making...');
		await this.__doBuild(zip, {
			obfuscateCode: opts?.obfuscateCode !== false
		});
		
		D3DConsole.log('[3/4] Compressing...');
		///////////////////////////////////
		// -- Save zip itself --
		const t = _time.now;
		const zipData = await zip.generateAsync({ 
			type: 'arraybuffer',
			compression: 'DEFLATE', // d3d file compression enabled
			compressionOptions: {
				level: opts?.compressionLevel || 6
			}
		});
		
		D3DConsole.log('[4/4] Writing...');
		await D3D.saveProjectFile(zipData, buildURI, opts?.openInFinder === true);
		
		this.__saving = false;
		_events.invoke('editor-building', false);
		
		D3DConsole.log(`Project built. Time elapsed ${Number(_time.now - t).toFixed(2)}s.`);
	}
	// .d3d
	async __publish(publishURI, buildURI, opts) {
		D3DConsole.clear();
		
		const t = _time.now;
		await this.__build(buildURI, opts);
		
		opts.manifest = _root.manifest;
		
		await D3D.publishProject(publishURI, buildURI, opts);
		
		D3DConsole.log(`Project published. Time elapsed ${Number(_time.now - t).toFixed(2)}s`);
	}
	async __doBuild(zip, opts = {}) {
		if(!zip)
			throw new Error('No project to build');
		
		const isEditorBuild = !!opts?.isEditorBuild;
		const manifest = { ...(_root.manifest || {}) };
		
		// Delete old values
		{
			if(manifest.engine !== undefined)
				delete manifest.engine;
				
			if(manifest.description !== undefined)
				delete manifest.description;
				
			if(manifest.version !== undefined)
				delete manifest.version;
		}
		
		// Always store editor version
		manifest.editorVersion = await D3D.getEditorVersion();
		
		if(isEditorBuild) {
			manifest.editorConfig.lastCameraPosition = {
				x: _editor.camera.position.x,
				y: _editor.camera.position.y,
				z: _editor.camera.position.z
			};
			manifest.editorConfig.lastCameraRotation = {
				x: _editor.camera.rotation.x,
				y: _editor.camera.rotation.y,
				z: _editor.camera.rotation.z
			};
			manifest.editorConfig.lastScene = _root.scenes.indexOf(_root.scene);
			manifest.editorConfig.objectStates = this.getCleanObjectStates(
				manifest.editorConfig.objectStates
			);
			manifest.editorConfig.lastMode = _editor.mode;
		}else{
			delete manifest.editorConfig;
		}
		
		// Save manifest
		this.writeFile({
			zip,
			path: 'manifest.json',
			data: JSON.stringify(manifest)
		});
		
		// Save LOD geometry
		this.saveLODGeometry(zip);
		
		// Save scene graph
		_root.scene.objects = [];
		
		_root.children.forEach(child => {
			if(child.editorOnly)
				return;
			
			_root.scene.objects.push(child.getSerializableObject());
		});
		
		let scenes = _root.scenes;
		
		if(opts.obfuscateCode) {
			// Player build only. Must be undone afterwards by doing a project editor build.
			scenes = structuredClone(_root.scenes);
			scenes.forEach(scene => {
				const obfs = (obj, doSelf) => {
					if(doSelf && obj.script)
						obj.script = obfuscate(obj.script);
					
					obj.children.forEach(child => {
						if(child.script)
							child.script = obfuscate(child.script);
						
						obfs(child, false);
					});
				}
				scene.objects.forEach(obj => {
					obfs(obj, true);
				});
			});
		}
		
		const scenesData = JSON.stringify(scenes);
		this.writeFile({
			zip,
			path: 'scenes.json',
			data: scenesData
		});
		
		// Save asset index
		const assetIndexData = JSON.stringify(_root.assetIndex);
		this.writeFile({
			zip,
			path: 'asset-index.json',
			data: assetIndexData
		});
		
		// Save symbols
		Object.values(_root.__symbols).forEach(symbol => {
			this.writeFile({
				zip,
				path: symbol.file.name,
				data: JSON.stringify(symbol.objData)
			});
		});
		
		// Save scripts
		_editor.clearDirectory('scripts');
		if(_root.__script) {
			let rootScript = _root.__script;
			
			if(!isEditorBuild)
				rootScript = obfuscate(rootScript);
			
			this.writeFile({
				zip,
				path: 'scripts/_root.js', 
				data: rootScript
			});
		}
	}
	saveLODGeometry(zip) {
		if(!zip)
			throw new Error('Invalid zip');
		
		if(!_root.__lodGeoms) {
			console.log('Skipping save LOD geometry');
			return;
		}
		
		// Clear the unused geometry
		const sigsToDelete = [];
		for(const sig in _root.__lodGeoms) {
			let isUsed = false;
			
			_root.traverse(o => {
				const autoLOD = o.getComponent('AutoLOD');
				if(autoLOD && autoLOD.sigsInUse.includes(sig)) {
					isUsed = true;
					return false;
				}
			});
			
			if(!isUsed)
				sigsToDelete.push(sig);
		}
		
		sigsToDelete.forEach(sig => {
			_root.__lodGeoms[sig] = null;
			delete _root.__lodGeoms[sig];
		});
		
		// Serialize the geometry
		const serializedLODs = {};
		for(const sig in _root.__lodGeoms) {
			const lodGeom = _root.__lodGeoms[sig];
			if(!lodGeom)
				continue;
			
			serializedLODs[sig] = lodGeom.toJSON();
		}
		
		const serializedData = JSON.stringify(serializedLODs);
		
		this.writeFile({
			zip,
			path: 'lodgeoms.json',
			data: serializedData
		});
	}
	
	deleteSelectedObjects(opts) {
		this.deleteObjects({objects: this.selectedObjects, ...opts});
	}
	deleteObjects({objects = [], action = 'Delete', addStep = true} = {}) {
		if(objects.length < 1)
			return;
		
		const restorableObjects = [];
		const deleteUUIDs = [];
		
		objects.forEach(d3dobject => {
			const d3dobjectRestore = d3dobject.getSerializableObject();
			d3dobjectRestore.__parent = d3dobject.parent;
			
			restorableObjects.push(d3dobjectRestore);
			deleteUUIDs.push(d3dobject.uuid);
			
			d3dobject.delete();
		});
		
		this.setSelection([], false);
		
		addStep && this.addStep({
			name: `${action} object(s)`,
			undo: async () => {
				const restoredObjs = [];
				
				for(let i in restorableObjects) {
					const objData = {...restorableObjects[i]};
					const parent = objData.__parent;
					delete objData.__parent;
					
					if(!parent)
						continue;
					
					const restoredd3dobj = await parent.createObject(objData);
					restoredObjs.push(restoredd3dobj);
				}
				
				this.setSelection(restoredObjs, false);
			},
			redo: () => {
				// re-delete them by UUID
				deleteUUIDs.forEach(uuid => _root.superIndex[uuid]?.delete?.());
				this.setSelection([], false);
			}
		});
	}
	gameOrInspectorActive() {
		return _editor.game3dRef.current.contains(document.activeElement) || _editor.game2dRef.current.contains(document.activeElement) || _editor.inspRef.current.contains(document.activeElement);
	}
	doCopySelectedObjects() {
		this.pastes = 0;
		
		SystemClipboard.writeText(JSON.stringify(
			this.selectedObjects.map(
				d3dobject => d3dobject.getSerializableObject()
			)
		));
		
		// Copy image
		if(this.selectedObjects.length === 1) {
			const theObject = this.selectedObjects[0];
			
			if(!theObject)
				return;
			
			if(theObject.hasComponent('Bitmap2D')) {
				const bitmap2d = theObject.getComponent('Bitmap2D');
				
				if(!bitmap2d.source)
					return;
				
				const rel = _root.resolvePath(bitmap2d.source);
				const data = _editor.readFileData(rel);
				
				if(!data)
					return;
				
				SystemClipboard.writeImage(data);
			}
		}
	}
	
	copy() {
		if(!this.gameOrInspectorActive()) {
			_events.invoke('copy');
			return;
		}
		
		this.doCopySelectedObjects();
	}
	cut() {
		if(!this.gameOrInspectorActive()) {
			_events.invoke('cut');
			return;
		}
		
		this.doCopySelectedObjects();
		this.deleteSelectedObjects({action: 'Cut'});
	}
	async pasteInPlace() {
		return await this.paste({posStep: false});
	}
	async paste(opts = {}) {
		if(!this.gameOrInspectorActive()) {
			_events.invoke('paste');
			return;
		}
		
		const json = SystemClipboard.readText();
		const imageData = SystemClipboard.readImage();
		
		if(json) {
			try {
				const clipboard = JSON.parse(json);
				
				return await this.pasteFrom({clip: clipboard, posStep: opts.posStep !== false});
			}catch(e) {
				console.error('Paste error', e);
			}
		}
		if(imageData) {
			const newObj = await createImageFromData({
				baseName: 'Pasted Image',
				pngData: imageData
			});
			
			newObj.depth = newObj.parent.getNextHighestDepth();
			
			return [newObj];
		}
	}
	async pasteFrom({clip = [], action = 'Paste', addStep = true, selectResult = true, posStep = false}) {
		let pastedObjects = [];
		
		for(let objData of clip) {
			const d3dobject = await _editor.focus.createObject(objData, {
				updateComponents: false
			});
			
			let containsSymbol = false;
			
			d3dobject.traverse(o => {
				if(o.symbol) {
					containsSymbol = true;
					return false;
				}
			});
			
			if(_editor.mode == '3D' && d3dobject.hasComponent('Container2D')) {
				if(!containsSymbol) {
					d3dobject.traverse(o => o.removeComponent('Container2D'));
				}else
					_editor.mode = '2D';
			}else
			if(_editor.mode == '2D' && !d3dobject.is2D) {
				if(!containsSymbol)
					d3dobject.traverse(o => !o.is2D && o.addComponent('Container2D'));
				else
					_editor.mode = '3D';
			}
			
			if(posStep && _editor.mode == '2D') {
				d3dobject.position.add(new THREE.Vector3(10, 10, 0).multiplyScalar(this.pastes + 1));
				this.pastes++;
			}
			
			pastedObjects.push(d3dobject);
		}
		addStep && this.addStep({
			name: `${action} ${clip.length} object(s)`,
			undo: () => this.deleteObjects({objects: pastedObjects, addStep: false}),
			redo: async () => {
				pastedObjects = await this.pasteFrom({action, clip, posStep})
			}
		});
		selectResult && this.setSelection(pastedObjects, false);
		
		for(let o of pastedObjects) {
			await o.updateComponents(true);
		}
		
		return pastedObjects;
	}
	copySpecial(type) {
		const d3dobj = this.selectedObjects[0];
		
		if(!d3dobj) {
			this.showError({
				title: 'Copy Special',
				message: 'Please select an object first'
			})
			return;
		}
		
		switch(type) {
			case 'all': 
				this.clipboardSpecial = {
					position: d3dobj.position.clone(),
					rotation: d3dobj.rotation.clone(),
					scale: d3dobj.scale.clone()
				};
			break;
		}
	}
	pasteSpecial(type) {
		const d3dobj = this.selectedObjects[0];
		
		if(!d3dobj) {
			this.showError({
				title: 'Paste Special',
				message: 'Please select an object first'
			})
			return;
		}
		if(!this.clipboardSpecial) {
			this.showError({
				title: 'Paste Special',
				message: 'There is nothing to paste'
			})
			return;
		}
		
		const originTransform = {
			position: d3dobj.position.clone(),
			rotation: d3dobj.rotation.clone(),
			scale: d3dobj.scale.clone()
		}
		const clip = {...this.clipboardSpecial};
		const revPaste = () => {
			switch(type) {
				case 'all': 
					d3dobj.position = originTransform.position;
					d3dobj.rotation = originTransform.rotation;
					d3dobj.scale = originTransform.scale;
				break;
				case 'position': 
					d3dobj.position = originTransform.position;
				break;
				case 'rotation': 
					d3dobj.rotation = originTransform.rotation;
				break;
				case 'scale': 
					d3dobj.scale = originTransform.scale;
				break;
			}
		}
		const doPaste = () => {
			switch(type) {
				case 'all': 
					d3dobj.position = clip.position;
					d3dobj.rotation = clip.rotation;
					d3dobj.scale = clip.scale;
				break;
				case 'position': 
					d3dobj.position = clip.position;
				break;
				case 'rotation': 
					d3dobj.rotation = clip.rotation;
				break;
				case 'scale': 
					d3dobj.scale = clip.scale;
				break;
			}
		}
		
		this.addStep({
			name: 'Paste Transform',
			undo: revPaste,
			redo: doPaste
		});
		
		doPaste();
	}
	
	editCode() {
		if(this.selectedObjects.length > 1) {
			this.showError('Just select one object to open the code editor');
			return;
		}
		if(!_root?.__loaded)
			return;
		
		this.openCodeEditor(this.selectedObjects[0] ?? _editor.focus);
	}
	openCode(d3dobj) {
		if(!d3dobj)
			return;
		
		this.openCodeEditor(d3dobj);
	}
	
	selectAll() {
		const el = document.activeElement;
	
		if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
			el.select();
		}else
		if (el.isContentEditable) {
			const r = document.createRange();
			r.selectNodeContents(el);
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(r);
		}else{
			_events.invoke('select-all');
		}
	}
	
	delete() {
		_events.invoke('delete-action');
	}
	
	group() {
		this.groupObjects(this.selectedObjects);
	}
	ungroup() {
		this.ungroupObjects(this.selectedObjects);
	}
	
	async groupObjects(d3dobjects, containingParent, addStep = true) {
		if(d3dobjects.length < 1) {
			this.showError({
				title: 'Group',
				message: 'Select object(s) to group'
			})
			return;
		}
		if(!containingParent)
			containingParent = this.focus;
		
		const center = getSelectionCenter(d3dobjects);
		const d3dcontainer = await containingParent.createObject({
			name: 'Group',
			position: {x: center.x, y: center.y, z: center.z}
		});
		
		if(this.mode == '2D')
			d3dcontainer.addComponent('Container2D', {}); // make it visible in 2d
		
		d3dobjects.forEach(d3dobj => {
			d3dobj.setParent(d3dcontainer);
		});
		
		this.setSelection([d3dcontainer], false);
		this.updateInspector?.();
		
		addStep && this.addStep({
			name: 'Group',
			undo: () => this.ungroupObjects([d3dcontainer], false),
			redo: () => this.groupObjects(d3dobjects, containingParent, false)
		});
	}
	ungroupObjects(d3dobjects, addStep = true) {
		const undoables = [];
		const ungrouped = [];
		
		d3dobjects.forEach(d3dobj => {
			const children = [...d3dobj.children];
			
			if(children.length < 1)
				return;
			
			const parent = d3dobj.parent;
			
			children.forEach(child => {
				child.setParent(d3dobj.parent);
				ungrouped.push(child);
			});
			d3dobj.delete();
			
			addStep && undoables.push(() => this.groupObjects(children, parent, false));
		});
		
		if(ungrouped.length < 1) {
			this.showError({
				title: 'Ungroup',
				message: 'Nothing to ungroup'
			})
			return;
		}
		
		this.setSelection(ungrouped, false);
		this.updateInspector?.();
		
		addStep && this.addStep({
			name: 'Ungroup',
			undo: () => undoables.forEach(u => u()),
			redo: () => this.ungroupObjects(d3dobjects, false)
		});
	}
	async mergeObjects(d3dobjects, containingParent, addStep = true) {
		if(_editor.mode != '2D') {
			_editor.showError({
				title: '2D Mode',
				message: 'This operation is for 2D objects'
			});
			return;
		}
		if(d3dobjects.length <= 1) {
			this.showError({
				title: 'Merge',
				message: 'Multiple objects required'
			})
			return;
		}
		
		let toMerge = d3dobjects.filter(o => o.is2D);
		
		if(toMerge.length != d3dobjects.length) {
			this.showError({
				title: 'Merge',
				message: 'All objects must be 2D'
			})
			return;
		}
		
		if(!containingParent)
			containingParent = this.focus;
		
		const center = getSelectionCenter(d3dobjects);
		let d3dmerged = await containingParent.createObject({
			name: 'Merged',
			position: {x: center.x, y: center.y, z: center.z}
		});
		const mergedGraphic2D = mergeGraphic2Ds(toMerge.map(o => o.graphic2d));
		let restorableObjDatas = toMerge.map(o => o.getSerializableObject());
		
		// Assign graphic2D to merged container
		d3dmerged.addComponent('Graphic2D', mergedGraphic2D);
		
		// Delete originals
		toMerge.forEach(d3dobj => d3dobj.delete());
		
		this.setSelection([d3dmerged], false);
		this.updateInspector?.();
		
		addStep && this.addStep({
			name: 'Merge',
			undo: async () => {
				const newToMerge = [];
				
				d3dmerged.delete();
				
				for(let objData of restorableObjDatas) {
					const restoredD3DObject = await containingParent.createObject(objData);
					newToMerge.push(restoredD3DObject);
				}
				
				toMerge = newToMerge;
				this.setSelection(newToMerge, false);
			},
			redo: async () => {
				const result = await this.mergeObjects(toMerge, containingParent, false);
				restorableObjDatas = result.restorableObjDatas;
				d3dmerged = result.d3dmerged;
			}
		});
		
		return {d3dmerged, restorableObjDatas};
	}
	
	async importFile(file, destDir) {
		return await handleImportFile(file, destDir);
	}
	
	getCleanObjectStates(states) {
		const newStates = {};
		
		for(let uuid in states) {
			const s = states[uuid];
			if(!s || !Object.keys(s).length || !_root.superIndex[uuid])
				continue;
			
			newStates[uuid] = s;
		}
		
		return newStates;
	}
	bringObjectsToFront() {
		const newDepth = this.focus.getNextHighestDepth();
		this.selectedObjects.forEach(d3dobject => {
			d3dobject.position.z = newDepth;
		});
	}
	sendObjectsToBack() {
		const newDepth = this.focus.getNextLowestDepth();
		this.selectedObjects.forEach(d3dobject => {
			d3dobject.position.z = newDepth;
		});
	}
	bringObjectsForwards() {
		this.selectedObjects.forEach(d3dobject => {
			d3dobject.position.z += 1;
		});
	}
	sendObjectsBackwards() {
		this.selectedObjects.forEach(d3dobject => {
			d3dobject.position.z -= 1;
		});
	}
}