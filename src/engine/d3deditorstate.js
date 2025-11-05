import {
	handleImportFile
} from './d3deditorimporter.js';
import {
	getSelectionCenter
} from './d3dutility.js';
import {
	mergeGraphic2Ds
} from './d2ddraw.js';

// Tool enum
export const Tools = Object.freeze({
	Select: 'select',
	Orbit: 'orbit',
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
		this.onEditorFocusChanged();
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
		_events.invoke('editor-mode', value);
		_editor.updateInspector?.();
		_editor.setSelection([]);
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
		this.clipboard = null;
		this.animationDefaultFps = 60;
		this.console = [];
		this.lastSingleClick = 0;
		this._mode = '3D';
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
			closePolygon: false
		}
	}

	setMode(mode) {
		this.mode = mode;
	}
	setTool(tool) {
		if (Object.values(Tools).includes(tool)) {
			this.tool = tool;
		} else {
			console.warn(`Invalid tool: ${tool}. Falling back to default.`);
			this.tool = Tools.Select;
		}
		_events.invoke('editor-tool', tool);
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
			if(object.part || this.isPartOfFocus(object))
				objects.push(object);
		});
		
		addStep && this.addSelectionStep(
			[...this.selectedObjects],
			[...objects]
		);
		
		this.selectedObjects = objects;
		deselectAssets && this.selectNoAssets?.();
		this.probeSelection();
	}
	addSelection(selectObjects, addStep = true) {
		if(!selectObjects || !Array.isArray(selectObjects))
			selectObjects = [];
			
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
		this.selectNoAssets?.();
		this.probeSelection();
	}
	removeSelection(objects, addStep = true) {
		const oldSelection = [...this.selectedObjects];
		
		objects.forEach(object => {
			this.selectedObjects.splice(
				this.selectedObjects.indexOf(object),
				1
			);
		});
		
		addStep && this.addSelectionStep(
			oldSelection,
			[...this.selectedObjects]
		);
		
		this.probeSelection();
	}
	probeSelection() {
		_events.invoke('selected-objects', this.selectedObjects);
		_events.invoke('deselect-animation-editor');
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
		return await this.pasteFrom({clip: clipboard, action: 'Duplicate'});
	}
	
	setDirty(dirty) {
		D3D.setDirty(dirty);
	}
	
	async __save(projectURI) {
		const zip = _root?.zip;
		
		this.__doBuild(true);
		
		///////////////////////////////////
		// -- Save zip itself --
		const zipData = await zip.generateAsync({ type: 'uint8array' });
		
		await D3D.saveProjectFile(zipData, projectURI);
		
		console.log('Project saved!');
	}
	async __build(buildURI, openInFinder = true) {
		const zip = _root?.zip;
		
		this.__doBuild();
		
		///////////////////////////////////
		// -- Save zip itself --
		const zipData = await zip.generateAsync({ type: 'uint8array' });
		
		await D3D.saveProjectFile(zipData, buildURI, openInFinder);
		
		console.log('Project built!');
	}
	__doBuild(isEditorBuild = false) {
		const zip = _root?.zip;
		
		if(!zip)
			throw new Error('No project to build');
		
		const manifest = { ...(_root.manifest || {}) };
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
		}else{
			delete manifest.editorConfig;
		}
		
		// Save manifest
		this.writeFile({
			path: 'manifest.json',
			data: JSON.stringify(manifest)
		});
		
		// Save scene graph
		_root.scene.background = {
			isColor: _root.object3d.background?.isColor == true,
			color: _root.object3d.background?.isColor ? (`#${_root.object3d.background.getHexString()}`) : null
		}
		_root.scene.objects = [];
		
		_root.children.forEach(child => {
			if(child.editorOnly)
				return;
			
			_root.scene.objects.push(child.getSerializableObject());
		});
		
		const scenesData = JSON.stringify(_root.scenes);
		this.writeFile({
			path: 'scenes.json',
			data: scenesData
		});
		
		// Save asset index
		const assetIndexData = JSON.stringify(_root.assetIndex);
		this.writeFile({
			path: 'asset-index.json',
			data: assetIndexData
		});
		
		// Save symbols
		Object.values(_root.__symbols).forEach(symbol => {
			this.writeFile({
				path: symbol.file.name,
				data: JSON.stringify(symbol.objData)
			});
		});
		
		// Save scripts
		_editor.clearDirectory('scripts');
		if(_root.__script) {
			_editor.writeFile({
				path: 'scripts/_root.js', 
				data: _root.__script
			});
		}
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
	copy() {
		if(!this.gameOrInspectorActive()) {
			_events.invoke('copy');
			return;
		}
			
		this.clipboard = this.selectedObjects.map(
			d3dobject => d3dobject.getSerializableObject()
		);
	}
	cut() {
		if(!this.gameOrInspectorActive()) {
			_events.invoke('cut');
			return;
		}
		
		this.clipboard = this.selectedObjects.map(
			d3dobject => d3dobject.getSerializableObject()
		);
		this.deleteSelectedObjects({action: 'Cut'});
	}
	async paste() {
		if(!this.gameOrInspectorActive()) {
			_events.invoke('paste');
			return;
		}
		
		return await this.pasteFrom({clip: this.clipboard});
	}
	async pasteFrom({clip = [], action = 'Paste', addStep = true, selectResult = true}) {
		let pastedObjects = [];
		
		for(let objData of clip) {
			const d3dobject = await _editor.focus.createObject(objData);
			pastedObjects.push(d3dobject);
		}
		addStep && this.addStep({
			name: `${action} ${clip.length} object(s)`,
			undo: () => this.deleteObjects({objects: pastedObjects, addStep: false}),
			redo: async () => {
				pastedObjects = await this.pasteFrom({action, clip})
			}
		});
		selectResult && this.setSelection(pastedObjects, false);
		
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