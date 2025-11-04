import {
	hitObject,
	hitObjectDeep,
	localBoundsOfGraphic,
	scaleGraphicPathsLocalFromEdge,
	getGraphicPivotLocal
} from './d2dutility.js';

export default class Graphic2DManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
	}

	updateComponent() {}

	get width() {
		const g = this.d3dobject?.graphic2d;
		if (!g || !Array.isArray(g._paths) || g._paths.length === 0) 
			return 0;
	
		const b = localBoundsOfGraphic(this.d3dobject);
		if (!b) 
			return 0;
	
		return b.maxX - b.minX; // game/world local units
	}
	set width(newWidth) {
		const b = localBoundsOfGraphic(this.d3dobject);
		if (!b) return;
	
		const curW = b.maxX - b.minX;
		if (!(curW > 0) || !Number.isFinite(newWidth)) return;
	
		const sx = Number(newWidth) / curW;
		const pivot = getGraphicPivotLocal(this.d3dobject); // <-- pivot in LOCAL coords
		scaleGraphicPathsLocalFromEdge(this.d3dobject, sx, 1, pivot.x, pivot.y);
	
		this.d3dobject.checkSymbols?.();
		this.d3dobject.invalidateGraphic2D?.();
		this.updateComponent?.();
	}
	
	get height() {
		const g = this.d3dobject?.graphic2d;
		if (!g || !Array.isArray(g._paths) || g._paths.length === 0) 
			return 0;
	
		const b = localBoundsOfGraphic(this.d3dobject);
		if (!b) 
			return 0;
	
		return b.maxY - b.minY; // game/world local units
	}
	set height(newHeight) {
		const b = localBoundsOfGraphic(this.d3dobject);
		if (!b) return;
	
		const curH = b.maxY - b.minY;
		if (!(curH > 0) || !Number.isFinite(newHeight)) return;
	
		const sy = Number(newHeight) / curH;
		const pivot = getGraphicPivotLocal(this.d3dobject); // <-- pivot in LOCAL coords
		scaleGraphicPathsLocalFromEdge(this.d3dobject, 1, sy, pivot.x, pivot.y);
	
		this.d3dobject.checkSymbols?.();
		this.d3dobject.invalidateGraphic2D?.();
		this.updateComponent?.();
	}

	hitTest({ x, y }) {
		return hitObject(this.d3dobject, x, y);
	}
	hitTestPoint({ x, y }) {
		return hitObjectDeep(this.d3dobject, x, y);
	}
}