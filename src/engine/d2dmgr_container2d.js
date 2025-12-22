export default class Container2DManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		
		this.d3dobject.container2d = this.component.properties;
	}
	
	updateComponent(force = false) {
		
	}
	
	dispose() {
		this.d3dobject.container2d = null;
	}
}