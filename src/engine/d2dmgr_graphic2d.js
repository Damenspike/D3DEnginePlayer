import {
	hitObject,
	hitObjectDeep
} from './d2dutility.js';

export default function Graphic2DManager(d3dobject, component) {
	
	this.updateComponent = () => {
		
	};
	this.hitTest = ({x, y}) => {
		return hitObject(d3dobject, x, y);
	}
	this.hitTestPoint = ({x, y}) => {
		return hitObjectDeep(d3dobject, x, y);
	}
}