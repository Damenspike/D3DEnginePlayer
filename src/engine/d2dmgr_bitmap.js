export default class BitmapManager {
	
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
	}
	
	get source() {
		return this.component.properties.source;
	}
	set source(v) {
		this.component.properties.source = v;
	}
	
	get fit() {
		return this.component.properties.fit;
	}
	set fit(v) {
		this.component.properties.fit = v;
	}
	
	get alignX() {
		return this.component.properties.alignX;
	}
	set alignX(v) {
		this.component.properties.alignX = v;
	}
	
	get alignY() {
		return this.component.properties.alignY;
	}
	set alignY(v) {
		this.component.properties.alignY = v;
	}
	
	get smoothing() {
		return !!this.component.properties.imageSmoothing;
	}
	set smoothing(v) {
		this.component.properties.imageSmoothing = !!v;
	}
	
	updateComponent() {
		if(!this.__setup)
			this.setup();
		else
			this.update();
	}
	setup() {
		this.d3dobject.__simpleHit = true;
		this.__setup = true;
	}
	update() {
		
	}
}