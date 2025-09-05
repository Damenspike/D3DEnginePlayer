const fs = window.require('fs');
const path = window.require('path');

const { ipcRenderer } = window.electron;

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
	}
	isSelected(object) {
		return this.selectedObjects.includes(object);
	}
	
	addStep({ name, undo, redo }) {
		// drop future steps if we've undone
		if(this.currentStep < this.steps.length - 1) {
			this.steps = this.steps.slice(0, this.currentStep + 1);
		}
	
		this.steps.push({ name, undo, redo });
		this.currentStep++;
	
		// enforce limit
		if(this.steps.length > stepLimit) {
			// drop oldest
			this.steps.shift();
			this.currentStep--; // adjust index since we removed one at the start
		}
	}
	
	undo() {
		if(this.currentStep < 0 || this.steps.length < 1) {
			console.log('Nothing to undo');
			return;
		}
	
		const step = this.steps[this.currentStep];
		this.currentStep--;
		
		try {
			step.undo();
		}catch(e) {
			console.error('D3DEditor error executing undo', e);
		}
	}
	
	redo() {
		if(this.steps.length < 1 || this.currentStep >= this.steps.length - 1) {
			console.log('Nothing to redo');
			return;
		}
	
		const step = this.steps[this.currentStep + 1];
		this.currentStep++;
		
		try {
			step.redo();
		}catch(e) {
			console.error('D3DEditor error executing redo', e);
		}
	}
	
	resetSteps() {
		this.steps = [];
		this.currentStep = -1;
	}
	
	setDirty(dirty) {
		ipcRenderer.send('set-dirty', dirty);
	}
	
	async save() {
		const zip = _root?.zip;
		
		if(!zip)
			throw new Error("No project to save");
		
		// Save manifest
		_editor.writeFile({
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
		_editor.writeFile({
			path: 'scenes.json',
			data: scenesData
		});
		
		// Save symbols
		Object.values(_root.__symbols).forEach(symbol => {
			_editor.writeFile({
				path: symbol.file.name,
				data: JSON.stringify(symbol.objData)
			});
		});
		
		// Save to the zip location
		const targetPath = _root.__origin;
		const zipdata = await zip.generateAsync({ type: 'nodebuffer' });
		
		const dir = path.dirname(targetPath);
		const exists = fs.existsSync(dir);
		if (!exists) {
			throw new Error(`Save failed: directory does not exist: ${dir}`);
		}
		
		fs.writeFileSync(targetPath, zipdata);
		
		console.log('Project saved!');
	}
}