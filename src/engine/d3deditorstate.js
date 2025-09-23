import {
	handleImportFile
} from './d3deditorimporter.js';

// Tool enum
export const Tools = Object.freeze({
	Select: 'select',
	Pan: 'pan'
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
		this._focus = value;
		this.onEditorFocusChanged();
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
		this.animationEditorInFocus = false;
	}

	setTool(tool) {
		if (Object.values(Tools).includes(tool)) {
			this.tool = tool;
		} else {
			console.warn(`Invalid tool: ${tool}. Falling back to default.`);
			this.tool = Tools.Select;
		}
	
		// Remove active class from all tools
		Object.values(Tools).forEach(t => {
			const el = document.getElementById(`tool-${t}`);
			if (el) el.classList.remove('tool-option--active');
		});
	
		// Add active class to selected tool
		const activeEl = document.getElementById(`tool-${this.tool}`);
		if (activeEl) activeEl.classList.add('tool-option--active');
	}
	
	setTransformTool(tool) {
		if (Object.values(TransformTools).includes(tool)) {
			this.transformTool = tool;
		} else {
			console.warn(`Invalid transform tool: ${tool}. Falling back to default.`);
			this.transformTool = TransformTools.Translate;
		}
		
		// Remove active class from all tools
		Object.values(TransformTools).forEach(t => {
			const el = document.getElementById(`ttool-${t}`);
			if (el) el.classList.remove('tool-option--active');
		});
		
		// Add active class to selected tool
		const activeEl = document.getElementById(`ttool-${this.transformTool}`);
		if (activeEl) activeEl.classList.add('tool-option--active');
		
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
	setSelection(selectObjects, addStep = true) {
		if(!selectObjects || !Array.isArray(selectObjects))
			selectObjects = [];
			
		const objects = [];
		
		selectObjects.forEach(object => {
			if(this.isPartOfFocus(object))
				objects.push(object);
		});
		
		addStep && this.addSelectionStep(
			[...this.selectedObjects],
			[...objects]
		);
		
		this.selectedObjects = objects;
		this.onObjectSelected?.(this.selectedObjects);
		this.selectNoAssets?.();
		this.probeSelection();
	}
	addSelection(selectObjects, addStep = true) {
		if(!selectObjects || !Array.isArray(selectObjects))
			selectObjects = [];
			
		const objects = [];
		
		selectObjects.forEach(object => {
			if(this.isPartOfFocus(object))
				objects.push(object);
		});
			
		addStep && this.addSelectionStep(
			[...this.selectedObjects],
			[...this.selectedObjects, ...objects]
		);
		
		this.selectedObjects.push(...objects);
		this.onObjectSelected?.(this.selectedObjects);
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
		
		this.onObjectSelected?.(this.selectedObjects);
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
		return await this.pasteFrom({clip: this.selectedObjects, action: 'Duplicate'});
	}
	
	setDirty(dirty) {
		D3D.setDirty(dirty);
	}
	
	async __save() {
		const zip = _root?.zip;
		
		if(!zip)
			throw new Error("No project to save");
		
		// Save manifest
		this.writeFile({
			path: 'manifest.json',
			data: JSON.stringify(_root.manifest)
		});
		
		// Save scene graph
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
		
		
		///////////////////////////////////
		// -- Save zip itself --
		const zipData = await zip.generateAsync({ type: 'uint8array' });
		
		await D3D.saveProjectFile(zipData);
		
		console.log('Project saved!');
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
	copy() {
		this.clipboard = this.selectedObjects.map(
			d3dobject => d3dobject.getSerializableObject()
		);
	}
	cut() {
		this.clipboard = this.selectedObjects.map(
			d3dobject => d3dobject.getSerializableObject()
		);
		this.deleteSelectedObjects({action: 'Cut'});
	}
	async paste() {
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
	
	editCode() {
		if(this.selectedObjects.length > 1) {
			this.showError('Just select one object to open the code editor');
			return;
		}
		
		this.openCodeEditor(this.selectedObjects[0] ?? _editor.focus);
	}
	
	delete() {
		_events.invoke('delete-action');
	}
	
	async importFile(file, destDir) {
		return await handleImportFile(file, destDir);
	}
}