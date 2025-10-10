export default class D2DDraw {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;
		this.drawing = false;
		this.tool = null;
		this.localPoints = [];
		this.tempObj = null;
		this.cursor = null;
		this.cursorLocal = null;
		this.host = null;
		this._onDown = this._onDown.bind(this);
		this._onMove = this._onMove.bind(this);
		this._onUp = this._onUp.bind(this);
		this._onBlur = this._onBlur.bind(this);
		this._onDbl = this._onDbl.bind(this);
		this._attach();
	}
	
	destroy() { this._detach(); }
	
	_attach() {
		if (!this.canvas) return;
		this.canvas.addEventListener('mousedown', this._onDown, { passive: false });
		this.canvas.addEventListener('dblclick', this._onDbl, { passive: false });
		window.addEventListener('mousemove', this._onMove, { passive: false });
		window.addEventListener('mouseup', this._onUp, { passive: false });
		window.addEventListener('blur', this._onBlur, { passive: false });
	}
	
	_detach() {
		if (!this.canvas) return;
		this.canvas.removeEventListener('mousedown', this._onDown);
		this.canvas.removeEventListener('dblclick', this._onDbl);
		window.removeEventListener('mousemove', this._onMove);
		window.removeEventListener('mouseup', this._onUp);
		window.removeEventListener('blur', this._onBlur);
	}
	
	_isActive() {
		const tools = new Set(['brush','pencil','line','square','circle','polygon']);
		const t = _editor?.tool;
		return tools.has(t);
	}
	
	_mouseToCanvas(e) {
		const r = this.canvas.getBoundingClientRect();
		const x = (e.clientX - r.left) * (this.canvas.width / r.width);
		const y = (e.clientY - r.top) * (this.canvas.height / r.height);
		return { x, y };
	}
	
	_worldDOMMatrix(d3dobject) {
		let m = new DOMMatrix();
		const chain = [];
		let n = d3dobject;
		while (n) { chain.push(n); n = n.parent; }
		chain.reverse();
		for (let i = 0; i < chain.length; i++) {
			const o = chain[i];
			const tx = Number(o.position?.x) || 0;
			const ty = Number(o.position?.y) || 0;
			const rz = Number(o.rotation?.z) || 0;
			const sx = Number(o.scale?.x) || 1;
			const sy = Number(o.scale?.y) || 1;
			m = m.translate(tx, ty).rotate(rz * 180 / Math.PI).scale(sx, sy);
		}
		return m;
	}
	
	_hostScreenMatrix() {
		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
		return new DOMMatrix().scale(gs, gs).multiply(this._worldDOMMatrix(this.host || _root));
	}
	
	_canvasToLocal(pt) {
		const inv = this._hostScreenMatrix().inverse();
		const p = new DOMPoint(pt.x, pt.y).matrixTransform(inv);
		return { x: p.x, y: p.y };
	}
	
	_localToCanvas(pt) {
		const M = this._hostScreenMatrix();
		const p = new DOMPoint(pt.x, pt.y).matrixTransform(M);
		return { x: p.x, y: p.y };
	}
	
	_distance(a, b) {
		const dx = a.x - b.x;
		const dy = a.y - b.y;
		return Math.sqrt(dx*dx + dy*dy);
	}
	
	_onDown(e) {
		if (!this._isActive()) return;
		e.preventDefault();
		this.tool = _editor.tool;
		this.host = _editor?.active2DHost || _root;
		const c = this._mouseToCanvas(e);
		this.cursor = c;
		const p = this._canvasToLocal(c);
		this.cursorLocal = p;
		
		if (this.tool === 'polygon') {
			if (!this.drawing) {
				this.drawing = true;
				this.localPoints = [{ x: p.x, y: p.y }];
				this._ensureTemp().then(() => { if (this.tempObj) this.tempObj.visible = false; this._updateTempGraphic(true); this._request(); });
			} else {
				this.localPoints.push({ x: p.x, y: p.y });
				this._updateTempGraphic();
				this._request();
			}
			return;
		}
		
		this.drawing = true;
		this.localPoints = [{ x: p.x, y: p.y }];
		if (this.tool === 'line' || this.tool === 'square' || this.tool === 'circle') this.localPoints.push({ x: p.x, y: p.y });
		this._ensureTemp().then(() => { if (this.tempObj) this.tempObj.visible = false; this._updateTempGraphic(true); this._request(); });
	}
	
	_onMove(e) {
		const c = this._mouseToCanvas(e);
		this.cursor = c;
		const p = this._canvasToLocal(c);
		this.cursorLocal = p;
		if (!this.drawing) { this._request(); return; }
		
		if (this.tool === 'polygon') {
			this._updateTempGraphic();
			this._request();
			return;
		}
		
		if (this.tool === 'line' || this.tool === 'square' || this.tool === 'circle') {
			this.localPoints[1] = { x: p.x, y: p.y };
		} else {
			const last = this.localPoints[this.localPoints.length - 1];
			if (!last || this._distance(last, p) >= 0.75) this.localPoints.push({ x: p.x, y: p.y });
		}
		this._updateTempGraphic();
		this._request();
	}
	
	_onUp() {
		if (!this.drawing) return;
		if (this.tool === 'polygon') { this._request(); return; }
		this._finalizeShape();
	}
	
	_onDbl(e) {
		if (!this.drawing) return;
		if (this.tool !== 'polygon') return;
		e.preventDefault();
		if (this.localPoints.length >= 3) {
			const a = this.localPoints[0];
			const b = this.localPoints[this.localPoints.length - 1];
			if (a && b && (a.x !== b.x || a.y !== b.y)) this.localPoints.push({ x: a.x, y: a.y });
		}
		this._finalizeShape();
	}
	
	_onBlur() {
		if (this.drawing && this.tool !== 'polygon') this._finalizeShape();
	}
	
	async _ensureTemp() {
		const host = this.host || _editor?.active2DHost || _root;
		let name = 'Draw 2D';
		if (this.tool === 'brush') name = 'Brush Stroke';
		else if (this.tool === 'pencil') name = 'Pencil Stroke';
		else if (this.tool === 'line') name = 'Line';
		else if (this.tool === 'square') name = 'Rectangle';
		else if (this.tool === 'circle') name = 'Ellipse';
		else if (this.tool === 'polygon') name = 'Polygon';
		
		const props = { _points: [] };
		if (this.tool === 'brush' || this.tool === 'square' || this.tool === 'circle' || this.tool === 'polygon') {
			props.fill = true;
			props.line = false;
			props.fillColor = _editor.draw2d?.fillColor || '#000000ff';
		} else {
			props.fill = false;
			props.line = true;
			props.lineWidth = Math.max(1, Number(_editor.draw2d?.lineWidth ?? 1));
			props.lineColor = _editor.draw2d?.lineColor || '#ffffffff';
			props.lineCap = 'round';
			props.lineJoin = 'round';
		}
		const components = [{ type: 'Graphic2D', properties: props }];
		this.tempObj = await host.createObject({ name, components });
	}
	
	_updateTempGraphic(initial = false) {
		const obj = this.tempObj;
		if (!obj) return;
		if (this.tool === 'brush') {
			const r = Math.max(0.1, Number(_editor.draw2d?.brushRadius ?? 1));
			obj.graphic2d._points = this._strokeToPolygon(this.localPoints, r, initial);
			obj.graphic2d.fillColor = _editor.draw2d?.fillColor || obj.graphic2d.fillColor;
		} else if (this.tool === 'pencil') {
			obj.graphic2d._points = this.localPoints.map(p => ({ x: p.x, y: p.y }));
			obj.graphic2d.lineWidth = Math.max(1, Number(_editor.draw2d?.lineWidth ?? obj.graphic2d.lineWidth ?? 1));
			obj.graphic2d.lineColor = _editor.draw2d?.lineColor || obj.graphic2d.lineColor;
		} else if (this.tool === 'line') {
			obj.graphic2d._points = this.localPoints.slice(0, 2).map(p => ({ x: p.x, y: p.y }));
			obj.graphic2d.lineWidth = Math.max(1, Number(_editor.draw2d?.lineWidth ?? obj.graphic2d.lineWidth ?? 1));
			obj.graphic2d.lineColor = _editor.draw2d?.lineColor || obj.graphic2d.lineColor;
		} else if (this.tool === 'square') {
			if (this.localPoints.length >= 2) {
				const a = this.localPoints[0], b = this.localPoints[1];
				obj.graphic2d._points = this._makeRectPoints(a, b);
				obj.graphic2d.fill = true;
				obj.graphic2d.line = false;
				obj.graphic2d.fillColor = _editor.draw2d?.fillColor || obj.graphic2d.fillColor;
			}
		} else if (this.tool === 'circle') {
			if (this.localPoints.length >= 2) {
				const a = this.localPoints[0], b = this.localPoints[1];
				obj.graphic2d._points = this._makeEllipsePoints(a, b, 64);
				obj.graphic2d.fill = true;
				obj.graphic2d.line = false;
				obj.graphic2d.fillColor = _editor.draw2d?.fillColor || obj.graphic2d.fillColor;
			}
		} else if (this.tool === 'polygon') {
			const pts = this.localPoints.slice();
			if (this.cursorLocal) pts.push({ x: this.cursorLocal.x, y: this.cursorLocal.y });
			obj.graphic2d._points = pts;
			obj.graphic2d.fill = true;
			obj.graphic2d.line = false;
			obj.graphic2d.fillColor = _editor.draw2d?.fillColor || obj.graphic2d.fillColor;
		}
		obj.invalidateGraphic2D?.();
	}
	
	_finalizeShape() {
		this.drawing = false;
		let obj = this.tempObj;
		this.tempObj = null;
		if (!obj) return;
		obj.visible = true;
		
		if (this.tool === 'brush' && this.localPoints.length > 2) this.localPoints = this._simplify(this.localPoints);
		if (this.tool === 'pencil' && this.localPoints.length > 2) this.localPoints = this._simplify(this.localPoints);
		
		if (this.tool === 'square' && this.localPoints.length >= 2) obj.graphic2d._points = this._makeRectPoints(this.localPoints[0], this.localPoints[1]);
		if (this.tool === 'circle' && this.localPoints.length >= 2) obj.graphic2d._points = this._makeEllipsePoints(this.localPoints[0], this.localPoints[1], 64);
		if (this.tool === 'polygon') obj.graphic2d._points = this._cleanAndClose(this.localPoints);
		if (obj.graphic2d.fill) obj.graphic2d._points = this._cleanAndClose(obj.graphic2d._points);
		
		obj.invalidateGraphic2D?.();
		const pts = obj?.graphic2d?._points || [];
		if (pts.length === 0) { obj.delete?.(); this._request(); return; }
		
		this._centerObject(obj);
		
		if (_editor?.addStep) {
			const host = obj.parent || this.host || _root;
			const name = obj.name || 'Draw 2D';
			const props = { ...(obj.graphic2d || {}) };
			props._points = (obj.graphic2d?._points || []).map(p => ({ x: p.x, y: p.y }));
			const components = [{ type: 'Graphic2D', properties: props }];
			let keep = obj;
			const undo = async () => { keep?.delete?.(); };
			const redo = async () => {
				if (keep && keep.parent) return;
				keep = await host.createObject({ name, components });
				keep.position = { x: obj.position.x, y: obj.position.y, z: obj.position.z || 0 };
				keep.invalidateGraphic2D?.();
				_editor?.selectObjects?.([keep]);
			};
			_editor.addStep({ label: 'Draw 2D', undo, redo });
		}
		
		_editor?.selectObjects?.([obj]);
		this._request();
	}
	
	_makeRectPoints(a, b) {
		const p1 = { x: a.x, y: a.y };
		const p2 = { x: b.x, y: a.y };
		const p3 = { x: b.x, y: b.y };
		const p4 = { x: a.x, y: b.y };
		return [p1, p2, p3, p4, { x: p1.x, y: p1.y }];
	}
	
	_makeEllipsePoints(a, b, segs = 64) {
		const cx = (a.x + b.x) * 0.5;
		const cy = (a.y + b.y) * 0.5;
		const rx = Math.max(0.1, Math.abs(b.x - a.x) * 0.5);
		const ry = Math.max(0.1, Math.abs(b.y - a.y) * 0.5);
		const out = [];
		for (let i = 0; i < segs; i++) {
			const t = (i / segs) * Math.PI * 2;
			out.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
		}
		out.push({ x: out[0].x, y: out[0].y });
		return out;
	}
	
	_cleanAndClose(points) {
		const pts = (points || []).filter(p => isFinite(p?.x) && isFinite(p?.y)).map(p => ({ x: +p.x, y: +p.y }));
		if (pts.length === 0) return pts;
		const a = pts[0], b = pts[pts.length - 1];
		if (a.x !== b.x || a.y !== b.y) pts.push({ x: a.x, y: a.y });
		return pts;
	}
	
	_normals(a, b) {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.sqrt(dx*dx + dy*dy) || 1;
		return { x: -dy/len, y: dx/len };
	}
	
	_circlePoly(center, radius, segs = 24) {
		const out = [];
		for (let i = 0; i < segs; i++) {
			const t = (i / segs) * Math.PI * 2;
			out.push({ x: center.x + Math.cos(t) * radius, y: center.y + Math.sin(t) * radius });
		}
		out.push({ x: out[0].x, y: out[0].y });
		return out;
	}
	
	_strokeToPolygon(pts, radius, allowCircle) {
		if (!pts || pts.length < 2) {
			if (allowCircle && pts && pts.length === 1) return this._circlePoly(pts[0], radius);
			return pts ? pts.map(p => ({ x: p.x, y: p.y })) : [];
		}
		const simp = this._simplify(pts);
		const left = [];
		const right = [];
		const n = simp.length;
		for (let i = 0; i < n; i++) {
			const p = simp[i];
			let nrm;
			if (i === 0) nrm = this._normals(simp[i], simp[i+1]);
			else if (i === n-1) nrm = this._normals(simp[i-1], simp[i]);
			else {
				const n1 = this._normals(simp[i-1], simp[i]);
				const n2 = this._normals(simp[i], simp[i+1]);
				const nx = n1.x + n2.x;
				const ny = n1.y + n2.y;
				const l = Math.sqrt(nx*nx + ny*ny) || 1;
				nrm = { x: nx/l, y: ny/l };
			}
			left.push({ x: p.x + nrm.x*radius, y: p.y + nrm.y*radius });
			right.push({ x: p.x - nrm.x*radius, y: p.y - nrm.y*radius });
		}
		right.reverse();
		const poly = left.concat(right);
		if (poly.length > 0) poly.push({ x: poly[0].x, y: poly[0].y });
		return poly;
	}
	
	_simplify(pts, tolerance = 0.2) {
		if (!pts || pts.length < 3) return pts.slice();
		const sqTol = tolerance * tolerance;
		const simplified = [pts[0]];
		let prev = pts[0];
		for (let i = 1; i < pts.length - 1; i++) {
			const p = pts[i];
			const dx = p.x - prev.x;
			const dy = p.y - prev.y;
			if (dx*dx + dy*dy > sqTol) {
				simplified.push(p);
				prev = p;
			}
		}
		simplified.push(pts[pts.length - 1]);
		return simplified;
	}
	
	_centerObject(obj) {
		const pts = Array.isArray(obj?.graphic2d?._points) ? obj.graphic2d._points : [];
		if (pts.length === 0) return;
		let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
		for (const p of pts) {
			const x = Number(p.x) || 0;
			const y = Number(p.y) || 0;
			if (x < minx) minx = x;
			if (y < miny) miny = y;
			if (x > maxx) maxx = x;
			if (y > maxy) maxy = y;
		}
		if (!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) return;
		const cx = (minx + maxx) * 0.5;
		const cy = (miny + maxy) * 0.5;
		for (const p of pts) { p.x -= cx; p.y -= cy; }
		obj.position = { x: (Number(obj.position?.x) || 0) + cx, y: (Number(obj.position?.y) || 0) + cy, z: Number(obj.position?.z) || 0 };
		obj.invalidateGraphic2D?.();
	}
	
	hex8(v, fallback) {
		if (!v || typeof v !== 'string') return fallback || 'rgba(255,255,255,1)';
		if (v.startsWith('#') && (v.length === 9 || v.length === 7)) {
			if (v.length === 7) return v;
			const r = parseInt(v.slice(1,3),16);
			const g = parseInt(v.slice(3,5),16);
			const b = parseInt(v.slice(5,7),16);
			const a = parseInt(v.slice(7,9),16) / 255;
			return `rgba(${r},${g},${b},${a})`;
		}
		if (v.startsWith('0x')) {
			const n = Number(v);
			const r = (n >> 24) & 0xff;
			const g = (n >> 16) & 0xff;
			const b = (n >> 8) & 0xff;
			const a = (n & 0xff) / 255;
			return `rgba(${r},${g},${b},${a})`;
		}
		return v;
	}
	
	_request() {
		if (_editor?.requestRender) _editor.requestRender(); else if (this.d2drenderer?.render) this.d2drenderer.render();
	}
	
	render() {
		if (!this._isActive()) return;
		const ctx = this.ctx;
		if (!ctx) return;
		const tool = _editor.tool;
		const fc = this.hex8(_editor.draw2d?.fillColor || '#000000ff', 'rgba(0,0,0,1)');
		const lc = this.hex8(_editor.draw2d?.lineColor || '#ffffffff', 'rgba(255,255,255,1)');
		const radius = Math.max(0.1, Number(_editor.draw2d?.brushRadius ?? 1));
		const lw = Math.max(1, Number(_editor.draw2d?.lineWidth ?? 1));
		
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		
		if (this.drawing && this.localPoints.length > 0) {
			if (tool === 'brush') {
				const poly = this._strokeToPolygon(this.localPoints, radius, true).map(p => this._localToCanvas(p));
				if (poly.length > 1) {
					ctx.beginPath();
					ctx.moveTo(poly[0].x, poly[0].y);
					for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
					ctx.closePath();
					ctx.fillStyle = fc;
					ctx.fill();
				}
			} else if (tool === 'pencil') {
				if (this.localPoints.length > 1) {
					const spts = this.localPoints.map(p => this._localToCanvas(p));
					ctx.beginPath();
					ctx.moveTo(spts[0].x, spts[0].y);
					for (let i = 1; i < spts.length; i++) ctx.lineTo(spts[i].x, spts[i].y);
					ctx.lineCap = 'round';
					ctx.lineJoin = 'round';
					ctx.lineWidth = lw * (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
					ctx.strokeStyle = lc;
					ctx.stroke();
				}
			} else if (tool === 'line') {
				if (this.localPoints.length >= 2) {
					const a = this._localToCanvas(this.localPoints[0]);
					const b = this._localToCanvas(this.localPoints[1]);
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.lineCap = 'round';
					ctx.lineJoin = 'round';
					ctx.lineWidth = lw * (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
					ctx.strokeStyle = lc;
					ctx.stroke();
				}
			} else if (tool === 'square') {
				if (this.localPoints.length >= 2) {
					const rpts = this._makeRectPoints(this.localPoints[0], this.localPoints[1]).map(p => this._localToCanvas(p));
					ctx.beginPath();
					ctx.moveTo(rpts[0].x, rpts[0].y);
					for (let i = 1; i < rpts.length; i++) ctx.lineTo(rpts[i].x, rpts[i].y);
					ctx.closePath();
					ctx.fillStyle = fc;
					ctx.fill();
				}
			} else if (tool === 'circle') {
				if (this.localPoints.length >= 2) {
					const ep = this._makeEllipsePoints(this.localPoints[0], this.localPoints[1], 48).map(p => this._localToCanvas(p));
					ctx.beginPath();
					ctx.moveTo(ep[0].x, ep[0].y);
					for (let i = 1; i < ep.length; i++) ctx.lineTo(ep[i].x, ep[i].y);
					ctx.closePath();
					ctx.fillStyle = fc;
					ctx.fill();
				}
			} else if (tool === 'polygon') {
				const pts = this.localPoints.slice();
				if (this.cursorLocal) pts.push({ x: this.cursorLocal.x, y: this.cursorLocal.y });
				if (pts.length > 1) {
					const spts = pts.map(p => this._localToCanvas(p));
					ctx.beginPath();
					ctx.moveTo(spts[0].x, spts[0].y);
					for (let i = 1; i < spts.length; i++) ctx.lineTo(spts[i].x, spts[i].y);
					ctx.lineWidth = 1;
					ctx.strokeStyle = fc;
					ctx.stroke();
				}
			}
		}
		
		if (this.cursor) {
			const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
			const r = tool === 'brush' ? radius * gs : Math.max(1, lw) * 0.5 * gs;
			ctx.beginPath();
			ctx.arc(this.cursor.x, this.cursor.y, r, 0, Math.PI * 2);
			ctx.lineWidth = 1;
			ctx.strokeStyle = tool === 'brush' ? fc : lc;
			ctx.stroke();
		}
		
		ctx.restore();
	}
}
export function mergeGraphic2Ds(graphics) {
	if (!Array.isArray(graphics) || graphics.length === 0) return null;
	const items = graphics.filter(g => g && Array.isArray(g._points));
	if (items.length === 0) return null;

	const clone = g => ({
		...g,
		_points: g._points.map(p => ({ x: p.x, y: p.y }))
	});

	const pick = (a, b, k) => (b?.[k] !== undefined ? b[k] : a?.[k]);

	const mergePair = (A, B) => {
		if (!A) return clone(B);
		if (!B) return clone(A);
		const a = clone(A);
		const b = clone(B);
		const aFill = !!a.fill;
		const bFill = !!b.fill;
		const aLine = !!a.line;
		const bLine = !!b.line;

		if (aFill && bFill) {
			const pts = mergePolygons(a._points, b._points);
			return {
				fill: true,
				line: a.line || b.line || false,
				fillColor: pick(a, b, 'fillColor'),
				lineColor: pick(a, b, 'lineColor'),
				lineWidth: pick(a, b, 'lineWidth'),
				lineCap: pick(a, b, 'lineCap'),
				lineJoin: pick(a, b, 'lineJoin'),
				_points: pts
			};
		}

		if ((aFill && bLine) || (aLine && bFill)) {
			return {
				fill: true,
				line: true,
				fillColor: pick(a, b, 'fillColor'),
				lineColor: pick(a, b, 'lineColor'),
				lineWidth: pick(a, b, 'lineWidth'),
				lineCap: pick(a, b, 'lineCap'),
				lineJoin: pick(a, b, 'lineJoin'),
				_points: aFill ? a._points.concat(b._points) : b._points.concat(a._points)
			};
		}

		const pts = a._points.concat(b._points);
		return {
			fill: false,
			line: true,
			lineColor: pick(a, b, 'lineColor'),
			lineWidth: pick(a, b, 'lineWidth'),
			lineCap: pick(a, b, 'lineCap'),
			lineJoin: pick(a, b, 'lineJoin'),
			_points: pts
		};
	};

	const result = items.reduce((acc, g) => mergePair(acc, g), null);
	return result;
}

function mergePolygons(p1, p2) {
	if (!p1.length) return p2.map(p => ({ x: p.x, y: p.y }));
	if (!p2.length) return p1.map(p => ({ x: p.x, y: p.y }));
	const a = p1[p1.length - 1];
	const b = p2[0];
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	const d2 = dx*dx + dy*dy;
	const out = p1.slice();
	if (d2 < 1e-6) out.push(...p2.slice(1).map(p => ({ x: p.x, y: p.y })));
	else out.push(...p2.map(p => ({ x: p.x, y: p.y })));
	return out;
}
export function centerGraphic2DObject(obj) {
	if (!obj || !obj.graphic2d) return null;
	const pts = Array.isArray(obj.graphic2d._points) ? obj.graphic2d._points : [];
	if (pts.length === 0) return null;

	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (const p of pts) {
		if (!p) continue;
		const x = Number(p.x) || 0;
		const y = Number(p.y) || 0;
		if (x < minx) minx = x;
		if (y < miny) miny = y;
		if (x > maxx) maxx = x;
		if (y > maxy) maxy = y;
	}
	if (!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) return null;

	const cx = (minx + maxx) * 0.5;
	const cy = (miny + maxy) * 0.5;

	for (const p of pts) {
		p.x = (Number(p.x) || 0) - cx;
		p.y = (Number(p.y) || 0) - cy;
	}

	obj.position = {
		x: (Number(obj.position?.x) || 0) + cx,
		y: (Number(obj.position?.y) || 0) + cy,
		z: Number(obj.position?.z) || 0
	};

	obj.invalidateGraphic2D?.();

	return { cx, cy, bounds: { minx, miny, maxx, maxy, width: maxx - minx, height: maxy - miny } };
}