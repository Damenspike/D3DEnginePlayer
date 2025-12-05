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
	
	refresh() {
		this.d3dobject.invalidateGraphic2D();
	}

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
	
	// Pivot
	get pivotPoint() {
		return this.component.properties._pivotPoint;
	}
	set pivotPoint(v) {
		this.component.properties._pivotPoint = v;
		this.refresh();
	}
	
	// Fill
	get fill() {
		return this.component.properties.fill;
	}
	set fill(v) {
		this.component.properties.fill = v;
		this.refresh();
	}
	
	get fillColor() {
		return this.component.properties.fillColor;
	}
	set fillColor(v) {
		this.component.properties.fillColor = v;
		this.refresh();
	}
	
	// Line
	get line() {
		return this.component.properties.line;
	}
	set line(v) {
		this.component.properties.line = v;
		this.refresh();
	}
	
	get lineWidth() {
		return this.component.properties.lineWidth;
	}
	set lineWidth(v) {
		this.component.properties.lineWidth = v;
		this.refresh();
	}
	
	get lineColor() {
		return this.component.properties.lineColor;
	}
	set lineColor(v) {
		this.component.properties.lineColor = v;
		this.refresh();
	}
	
	get lineCap() {
		return this.component.properties.lineCap;
	}
	set lineCap(v) {
		this.component.properties.lineCap = v;
		this.refresh();
	}
	
	get lineJoin() {
		return this.component.properties.lineJoin;
	}
	set lineJoin(v) {
		this.component.properties.lineJoin = v;
		this.refresh();
	}
	
	get miterLimit() {
		return this.component.properties.miterLimit;
	}
	set miterLimit(v) {
		this.component.properties.miterLimit = v;
		this.refresh();
	}
	
	// Outline
	get outline() {
		return this.component.properties.outline;
	}
	set outline(v) {
		this.component.properties.outline = v;
		this.refresh();
	}
	
	get outlineWidth() {
		return this.component.properties.outlineWidth;
	}
	set outlineWidth(v) {
		this.component.properties.outlineWidth = v;
		this.refresh();
	}
	
	get outlineColor() {
		return this.component.properties.outlineColor;
	}
	set outlineColor(v) {
		this.component.properties.outlineColor = v;
		this.refresh();
	}
	
	// Border radius
	get borderRadius() {
		return this.component.properties.borderRadius;
	}
	set borderRadius(v) {
		this.component.properties.borderRadius = v;
		this.refresh();
	}
	
	// Subtract (erase parent)
	get subtract() {
		return this.component.properties.subtract;
	}
	set subtract(v) {
		this.component.properties.subtract = v;
		this.refresh();
	}
	
	// Mask
	get mask() {
		return this.component.properties.mask;
	}
	set mask(v) {
		this.component.properties.mask = v;
		this.refresh();
	}
	
	// Blocks
	get blocks() {
		return this.component.properties.blocks;
	}
	set blocks(v) {
		this.component.properties.blocks = v;
		this.refresh();
	}
	
	get lineStyle() {
		return this.component.properties.lineStyle ?? 'solid';
	}
	set lineStyle(v) {
		this.component.properties.lineStyle = v;
		this.refresh();
	}
	
	get lineDashLength() {
		return this.component.properties.lineDashLength ?? 12;
	}
	set lineDashLength(v) {
		this.component.properties.lineDashLength = v;
		this.refresh();
	}
	
	get lineDashGap() {
		return this.component.properties.lineDashGap ?? 8;
	}
	set lineDashGap(v) {
		this.component.properties.lineDashGap = v;
		this.refresh();
	}
	
	get lineDotGap() {
		return this.component.properties.lineDotGap ?? 4;
	}
	set lineDotGap(v) {
		this.component.properties.lineDotGap = v;
		this.refresh();
	}
	
	get lineDashOffset() {
		return this.component.properties.lineDashOffset ?? 0;
	}
	set lineDashOffset(v) {
		this.component.properties.lineDashOffset = v;
		this.refresh();
	}

	hitTest({ x, y }) {
		return hitObject(this.d3dobject, x, y);
	}
	hitTestPoint({ x, y }) {
		return hitObjectDeep(this.d3dobject, x, y);
	}
}