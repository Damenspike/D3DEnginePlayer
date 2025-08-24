// Tool enum
export const Tools = Object.freeze({
	Select: 'select',
	Pan: 'pan',
	Transform: 'transform',
	Rotate: 'rotate',
	Scale: 'scale'
});

export default class D3DEditorState {
	constructor() {
		this.gui = {};
		this.project = null;
		this.camera = null;
		this.tool = Tools.Select;
		this.selectedObjects = [];
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

	getTool() {
		return this.tool;
	}
}