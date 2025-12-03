export default class Filter2DManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component  = component;
	}

	updateComponent() {}

	refresh() {
		this.d3dobject.invalidateGraphic2D();
	}
	
	// Brightness (-1..1)
	get brightness() {
		return this.component.properties.brightness;
	}
	set brightness(v) {
		this.component.properties.brightness = v;
		this.refresh();
	}

	// Tint (RGBA, alpha = strength)
	get tint() {
		return this.component.properties.tint;
	}
	set tint(v) {
		this.component.properties.tint = v;
		this.refresh();
	}

	// Extra opacity (0..1) stacked on top of normal opacity
	get filterOpacity() {
		return this.component.properties.filterOpacity;
	}
	set filterOpacity(v) {
		this.component.properties.filterOpacity = v;
		this.refresh();
	}

	// Blend mode
	get blend() {
		return this.component.properties.blend;
	}
	set blend(v) {
		this.component.properties.blend = v;
		this.refresh();
	}
}