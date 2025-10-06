// Pseudo code
// Pseudo code
// Pseudo code
// Pseudo code
// Pseudo code
// Pseudo code
// Pseudo code
// Pseudo code
export default class D2DGraphic {
	constructor(obj = {}) {
		// Graphical
		this.points = obj.points || [];
		this.lineWidth = obj.lineWidth || 0.1;
		this.lineColor = obj.lineColor || '#00000000';
		this.fillColor = obj.fillColor || '#00000000';
		this.borderRadius = obj.borderRadius || [0, 0, 0, 0];
		
		// Text
		this.text = obj.text || '';
		this.font = obj.font || 'sans-serif';
		this.fontSize = obj.fontSize || 14;
		this.fontColor = obj.fontColor || '#00000000';
		this.fontWeight = obj.fontWeight || 'normal';
		this.fontStyle = obj.fontStyle || 'normal';
		
		// Transformational
		this.pivotPoint = obj.pivotPoint || {x: 0, y: 0};
	}
}