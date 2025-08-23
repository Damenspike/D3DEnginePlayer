// Tool enum
export const Tools = Object.freeze({
	Select: 'select',
	Pan: 'pan'
});

export default class D3DEditorState {
	constructor() {
		this.project = null;
		this.camera = null;
		this.tool = Tools.Select;
	}

	setTool(tool) {
		if (Object.values(Tools).includes(tool)) {
			this.tool = tool;
		} else {
			console.warn(`Invalid tool: ${tool}. Falling back to default.`);
			this.tool = Tools.Select;
		}
	}

	getTool() {
		return this.tool;
	}
}