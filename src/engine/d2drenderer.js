// d2drenderer.js
import D2DGizmo from './d2dgizmo.js';
import D2DEdit from './d2dedit.js';
import D2DDraw from './d2ddraw.js';
import {
	approx,
	hexToRgba
} from './d3dutility.js';

export default class D2DRenderer {
	constructor({width, height, pixelRatio, root, addGizmo = false} = {}) {
		this.pixelRatio = pixelRatio ?? (window.devicePixelRatio || 1);
		this.width = width ?? 760;
		this.height = height ?? 480;
		this.root = root;
		
		this.domElement = document.createElement('canvas');
		this.domElement.style.display = 'block';
		this.domElement.style.width = '100%';
		this.domElement.style.height = '100%';
		this.ctx = this.domElement.getContext('2d');
		
		this.setSize(this.width, this.height);
		
		if(addGizmo) {
			this.gizmo = new D2DGizmo(this);
			this.edit = new D2DEdit(this);
			this.drawer = new D2DDraw(this);
		}
	}
	
	refreshSize() {
		this.setSize(this.width, this.height);
	}
	setSize(width, height) {
		const projectWidth = _editor.project?.width || 760;
		const projectHeight = _editor.project?.height || 480;
		
		// Calculate scale to fit canvas within parent while preserving aspect ratio
		const scale = Math.min(width / Math.max(projectWidth, 1), height / Math.max(projectHeight, 1)) || 1;
		const displayWidth = Math.round(projectWidth * scale);
		const displayHeight = Math.round(projectHeight * scale);
	
		// Ensure canvas is positioned absolutely relative to the absolute parent
		this.domElement.style.position = 'absolute';
		this.domElement.style.width = `${displayWidth}px`;
		this.domElement.style.height = `${displayHeight}px`;
		this.domElement.style.left = `${(width - displayWidth) / 2}px`;
		this.domElement.style.top = `${(height - displayHeight) / 2}px`;
	
		// Set canvas backing store size (accounting for device pixel ratio)
		this.domElement.width = displayWidth * this.pixelRatio;
		this.domElement.height = displayHeight * this.pixelRatio;
		
		this.viewScale = scale;
		this.width = width;
		this.height = height;
	
		// Apply transform to context for proper scaling
		this.ctx.setTransform(
			this.pixelRatio * scale, 0,
			0, this.pixelRatio * scale,
			0, 0
		);
	}
	setPixelRatio(pixelRatio) {
		this.pixelRatio = Number(pixelRatio) || 1;
		this.setSize(this.width, this.height);
	}
	clear() {
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.clearRect(0, 0, this.domElement.width, this.domElement.height);
		
		this.ctx.setTransform(
			this.pixelRatio * this.viewScale, 0,
			0, this.pixelRatio * this.viewScale,
			0, 0
		);
	}
	render() {
		this.clear();
	
		const ctx = this.ctx;
	
		// ---- Apply view (pan+zoom) once for the whole scene ----
		const pr  = this.pixelRatio || 1;
		const vs  = this.viewScale  || 1;                 // >= 1
		const off = this.viewOffset || { x: 0, y: 0 };    // in device pixels
	
		ctx.save();
		// pan is in device pixels; then scale in device pixels
		ctx.translate(off.x, off.y);
		ctx.scale(pr * vs, pr * vs);
	
		// Draw objects in world units; per-object world matrices compose on top
		const d3dobjects = this
			.gather(this.root)
			.sort((a, b) => (a.position?.z || 0) - (b.position?.z || 0));
	
		for (const d3dobject of d3dobjects) this.draw(d3dobject);
	
		ctx.restore();
	}
	renderGizmos() {
		this.gizmo?.render();
		this.edit?.render();
		this.drawer?.render();
	}
	gather(root) {
		const objects = [];
		root.traverse(d3dobject => {
			if(!d3dobject.is2D)
				return;
			
			objects.push(d3dobject);
		});
		return objects;
	}
	draw(d3dobject) {
		const graphic = d3dobject.graphic2d;
		
		if(!graphic) 
			return;
			
		/*if(!graphic._test) {
			graphic._points = [
				{x: 0, y: -40},
				{x: 25, y: -65},
				{x: 50, y: -65},
				{x: 75, y: -40},
				{x: 75, y: 0},
				{x: 37, y: 40},
				{x: 0, y: 75},
				{x: -37, y: 40},
				{x: -75, y: 0},
				{x: -75, y: -40},
				{x: -50, y: -65},
				{x: -25, y: -65},
				{x: 0, y: -40}
			]
			graphic._test = true;
		}*/
			
		if(graphic._bitmap)
			return; // TODO: drawBitmap
		else
			this.drawVector(d3dobject);
	}
	drawVector(d3dobject) {
		const ctx = this.ctx;
		if (!d3dobject.visible) return;
	
		const alpha   = Number.isFinite(d3dobject.opacity) ? Math.max(0, Math.min(1, d3dobject.opacity)) : 1;
		const graphic = d3dobject.graphic2d;
		const points  = graphic?._points || [];
		if (points.length < 1) return;
	
		const gLineEnabled = graphic.line !== false;
		const gLineWidth   = Number(graphic.lineWidth ?? 1);
		const gLineColor   = graphic.lineColor ?? '#ffffff';
		const lineCap      = graphic.lineCap  ?? 'round';
		const lineJoin     = graphic.lineJoin ?? 'round';
		const miterLimit   = Number(graphic.miterLimit ?? 10);
	
		const fillEnabled  = graphic.fill !== false;
		const fillColor    = graphic.fillColor ?? '#ffffffff';
		const borderRadius = Math.max(0, Number(graphic.borderRadius ?? 0));
	
		const first = points[0];
		const last  = points[points.length - 1];
		const isClosed = points.length >= 3 && approx(first.x, last.x) && approx(first.y, last.y);
	
		const buildRawPath = () => {
			const p = new Path2D();
			p.moveTo(points[0].x, points[0].y);
			for (let i = 1; i < points.length; i++) p.lineTo(points[i].x, points[i].y);
			if (isClosed) p.closePath();
			return p;
		};
	
		const buildRoundedPath = () => {
			if (!isClosed || borderRadius <= 0 || points.length < 3) return null;
			const base = points.slice(0, -1);
			const count = base.length;
			if (count < 3) return null;
	
			const get = i => base[(i + count) % count];
			const p = new Path2D();
	
			for (let i = 0; i < count; i++) {
				const p0 = get(i - 1);
				const p1 = get(i);
				const p2 = get(i + 1);
	
				const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
				const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
	
				const len1 = Math.hypot(v1x, v1y) || 1;
				const len2 = Math.hypot(v2x, v2y) || 1;
	
				const r = Math.min(borderRadius, len1 / 2, len2 / 2);
	
				const inX  = p1.x - (v1x / len1) * r;
				const inY  = p1.y - (v1y / len1) * r;
				const outX = p1.x + (v2x / len2) * r;
				const outY = p1.y + (v2y / len2) * r;
	
				if (i === 0) p.moveTo(inX, inY);
				else p.lineTo(inX, inY);
	
				p.quadraticCurveTo(p1.x, p1.y, outX, outY);
			}
			p.closePath();
			return p;
		};
	
		const rawPath     = buildRawPath();
		const roundedPath = buildRoundedPath();
		const pathForFill = roundedPath || rawPath;
	
		const uniformStroke =
			gLineEnabled &&
			points.every(pt =>
				pt.line === undefined &&
				pt.lineWidth === undefined &&
				pt.lineColor === undefined &&
				pt.lineCap === undefined &&
				pt.lineJoin === undefined &&
				pt.miterLimit === undefined
			);
	
		let m = new DOMMatrix();
		const chain = [];
		let n = d3dobject;
		while (n) { chain.push(n); n = n.parent; }
		chain.reverse();
		for (let i = 0; i < chain.length; i++) {
			const o  = chain[i];
			const tx = Number(o.position?.x) || 0;
			const ty = Number(o.position?.y) || 0;
			const rz = Number(o.rotation?.z) || 0;
			const sx = Number(o.scale?.x) || 1;
			const sy = Number(o.scale?.y) || 1;
			// T * R * S  (right-multiplied → points see S→R→T in local order)
			m = m.translate(tx, ty).rotate(rz * 180 / Math.PI).scale(sx, sy);
		}
	
		const gs = (this.pixelRatio || 1) * (this.viewScale || 1);
		const isInFocus = _editor.focus == d3dobject || _editor.focus.containsChild(d3dobject);
		const masterAlpha = isInFocus ? 1 : 0.2;
	
		ctx.save();
		ctx.globalAlpha *= alpha * masterAlpha;
		ctx.setTransform(gs, 0, 0, gs, 0, 0);
		ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
	
		if (fillEnabled && pathForFill) {
			ctx.fillStyle = hexToRgba(fillColor);
			ctx.fill(pathForFill);
		}
	
		if (uniformStroke && pathForFill) {
			// BorderRadius affects stroke too (when stroke is uniform)
			ctx.lineWidth   = Math.max(0.001, gLineWidth);
			ctx.strokeStyle = hexToRgba(gLineColor);
			ctx.lineCap     = lineCap;
			ctx.lineJoin    = lineJoin;
			ctx.miterLimit  = miterLimit;
			ctx.stroke(pathForFill);
		} else {
			// Per-segment overrides → fall back to straight segments (no rounded joins)
			const segCount = points.length - 1;
			for (let i = 0; i < segCount; i++) {
				const a = points[i];
				const b = points[i + 1];
				const strokeOn =
					(a.line !== false && b.line !== false) && (a.line === true || b.line === true || gLineEnabled);
				if (!strokeOn) continue;
	
				const segWidth = Number(b.lineWidth ?? a.lineWidth ?? gLineWidth);
				const segColor = b.lineColor ?? a.lineColor ?? gLineColor;
				const segCap   = b.lineCap  ?? a.lineCap  ?? lineCap;
				const segJoin  = b.lineJoin ?? a.lineJoin ?? lineJoin;
				const segMiter = Number(b.miterLimit ?? a.miterLimit ?? miterLimit);
	
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.lineWidth   = Math.max(0.001, segWidth);
				ctx.strokeStyle = hexToRgba(segColor);
				ctx.lineCap     = segCap;
				ctx.lineJoin    = segJoin;
				ctx.miterLimit  = segMiter;
				ctx.stroke();
			}
		}
	
		ctx.restore();
	}
}