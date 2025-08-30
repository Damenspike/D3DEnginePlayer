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
	get parent() {
		return this._parent ?? _root;
	}
	set parent(value) {
		this._parent = value;
		_editor.updateInspector();
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
	
	setSelection(objects) {
		if(!objects || !Array.isArray(objects))
			objects = [];
		
		this.selectedObjects = objects;
		this.onObjectSelected?.(this.selectedObjects);
	}
	addSelection(objects) {
		if(!objects || !Array.isArray(objects))
			objects = [];
		
		this.selectedObjects.push(...objects);
		this.onObjectSelected?.(this.selectedObjects);
	}
	removeSelection(objects) {
		objects.forEach(object => {
			this.selectedObjects.splice(
				this.selectedObjects.indexOf(object),
				1
			);
		});
		
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
}