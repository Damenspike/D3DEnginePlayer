import {
	hitObject,
	hitObjectDeep,
	objBoundsCanvas,
	canvasToLocal,
	scaleGraphicPathsLocalAround
} from './d2dutility.js';

export default class Graphic2DManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
	}

	updateComponent() {
		// no-op for now
	}

	_getRenderer() {
		return _host.renderer2d;
	}
	
	get width() {
		const d2dr = this._getRenderer();
		if (!d2dr) 
			return 0;
		const b = objBoundsCanvas(d2dr, this.d3dobject);
		if (!b) 
			return 0;
		return b.r - b.l;
	}
	set width(newWidthPx) {
		const d2dr = this._getRenderer();
		if (!d2dr) 
			return;
		const b = objBoundsCanvas(d2dr, this.d3dobject);
		if (!b) 
			return;
		const curW = b.r - b.l;
		if (!(curW > 0) || !Number.isFinite(newWidthPx)) 
			return;
			
		const sx = Number(newWidthPx) / curW;
		const sy = 1;
		
		const originLocal = canvasToLocal(d2dr, this.d3dobject, { x: b.l, y: b.t });
		scaleGraphicPathsLocalAround(this.d3dobject, sx, sy, originLocal.x, originLocal.y);
		
		this.d3dobject.invalidateGraphic2D?.();
		this.updateComponent();
	}
	
	get height() {
		const d2dr = this._getRenderer();
		if (!d2dr) 
			return 0;
		const b = objBoundsCanvas(d2dr, this.d3dobject);
		if (!b) 
			return 0;
		return b.b - b.t;
	}
	set height(newHeightPx) {
		const d2dr = this._getRenderer();
		if (!d2dr) 
			return;
		const b = objBoundsCanvas(d2dr, this.d3dobject);
		if (!b) 
			return;
		const curH = b.b - b.t;
		if (!(curH > 0) || !Number.isFinite(newHeightPx)) 
			return;
			
		const sx = 1;
		const sy = Number(newHeightPx) / curH;
		
		const originLocal = canvasToLocal(d2dr, this.d3dobject, { x: b.l, y: b.t });
		scaleGraphicPathsLocalAround(this.d3dobject, sx, sy, originLocal.x, originLocal.y);
		
		this.d3dobject.invalidateGraphic2D?.();
		this.updateComponent();
	}
	
	hitTest({ x, y }) {
		return hitObject(this.d3dobject, x, y);
	}
	hitTestPoint({ x, y }) {
		return hitObjectDeep(this.d3dobject, x, y);
	}
}