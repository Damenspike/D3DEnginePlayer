import {
	hitObject,
	hitObjectDeep
} from './d2dutility.js';

export default function Graphic2DManager(d3dobject, component) {
	
	this.updateComponent = () => {
		
	};
	this.hitTest = ({x, y}) => {
		const graphic2d = d3dobject.graphic2d;
		
		if(!graphic2d) {
			throw new Error(`${d3dobject.name} is not a graphic2d for hit test`);
		}
		
		return hitObject(d3dobject, x, y);
	}
	this.hitTestPoint = ({x, y}) => {
		const graphic2d = d3dobject.graphic2d;
		
		if(!graphic2d) {
			throw new Error(`${d3dobject.name} is not a graphic2d for hit test (point)`);
		}
		
		return hitObjectDeep(d3dobject, x, y);
	}
	
	d3dobject.hitTest = this.hitTest;
	d3dobject.hitTestPoint = this.hitTestPoint;
}