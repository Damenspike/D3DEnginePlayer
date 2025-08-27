// Tool enum
export const Tools = Object.freeze({
	Select: 'select',
	Pan: 'pan'
});
export const TransformTools = Object.freeze({
	Translate: 'translate',
	Rotate: 'rotate',
	Scale: 'scale'
})

export default class D3DEditorState {
	constructor() {
		this.gui = {};
		this.project = null;
		this.camera = null;
		this.tool = Tools.Select;
		this.transformTool = TransformTools.Translate;
		this.selectedObjects = [];
		this.renderer = null;
		this.gizmo = null;
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
}