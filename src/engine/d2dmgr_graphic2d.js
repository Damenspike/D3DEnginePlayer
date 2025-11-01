import {
	hitObject,
	hitObjectDeep
} from './d2dutility.js';

export default class Graphic2DManager {
	
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
	}
	
	updateComponent() {
		
	}
	hitTest({x, y}) {
		return hitObject(this.d3dobject, x, y);
	}
	hitTestPoint({x, y}) {
		return hitObjectDeep(this.d3dobject, x, y);
	}
}