export default class D2DFill {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;
		this.host = null;
		this.cursor = null;
		this._onDown = this._onDown.bind(this);
		this._onMove = this._onMove.bind(this);
		this._onBlur = this._onBlur.bind(this);
		this._attach();
	}
	
	destroy() { this._detach(); }
	
	_attach() {
		if (!this.canvas) return;
		this.canvas.addEventListener('mousedown', this._onDown, { passive: false });
		window.addEventListener('mousemove', this._onMove, { passive: true });
		window.addEventListener('blur', this._onBlur, { passive: false });
	}
	
	_detach() {
		if (!this.canvas) return;
		this.canvas.removeEventListener('mousedown', this._onDown);
		window.removeEventListener('mousemove', this._onMove);
		window.removeEventListener('blur', this._onBlur);
	}
	
	_isActive() { return _editor?.tool === 'fill'; }
	
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
	
	_screenMatrixFor(obj) {
		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
		return new DOMMatrix().scale(gs, gs).multiply(this._worldDOMMatrix(obj));
	}
	
	_all2D(root) {
		const out = [];
		const st = [root];
		while (st.length) {
			const n = st.pop();
			if (!n) continue;
			if (n.is2D) out.push(n);
			const ch = n.children || [];
			for (let i = 0; i < ch.length; i++) st.push(ch[i]);
		}
		return out;
	}
	
	_isClosed(points) {
		if (!points || points.length < 3) return false;
		const a = points[0], b = points[points.length - 1];
		return Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) <= 1e-6;
	}
	
	_pointInPoly(px, py, poly) {
		let inside = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const xi = poly[i].x, yi = poly[i].y;
			const xj = poly[j].x, yj = poly[j].y;
			const inter = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-12) + xi);
			if (inter) inside = !inside;
		}
		return inside;
	}
	
	_rayCrossings(px, py, poly) {
		let c = 0;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const xi = poly[i].x, yi = poly[i].y;
			const xj = poly[j].x, yj = poly[j].y;
			if ((yi > py) !== (yj > py)) {
				const x = xi + (py - yi) * (xj - xi) / ((yj - yi) || 1e-12);
				if (x >= px) c++;
			}
		}
		return c;
	}
	
	_pickTarget(mouse) {
		const host = _editor?.active2DHost || _root;
		const objs = this._all2D(host);
		const px = mouse.x, py = mouse.y;
		for (let i = objs.length - 1; i >= 0; i--) {
			const obj = objs[i];
			const g = obj?.graphic2d;
			const pts = Array.isArray(g?._points) ? g._points : [];
			if (pts.length < 2) continue;
			const sm = this._screenMatrixFor(obj);
			const sp = pts.map(p => {
				const t = new DOMPoint(p.x, p.y).matrixTransform(sm);
				return { x: t.x, y: t.y };
			});
			if (sp.length >= 3 && this._pointInPoly(px, py, sp)) return { obj, how: 'inside' };
			const crossings = this._rayCrossings(px, py, sp);
			if (crossings >= 2) return { obj, how: 'enclosed' };
		}
		return null;
	}
	
	_applyFillOnObject(obj, color) {
		const g = obj.graphic2d || (obj.graphic2d = {});
		const before = { fill: !!g.fill, fillColor: g.fillColor, line: !!g.line };
		g.fill = true;
		g.fillColor = color || g.fillColor || '#000000ff';
		obj.invalidateGraphic2D?.();
		if (_editor?.addStep) {
			const after = { fill: !!g.fill, fillColor: g.fillColor, line: !!g.line };
			_editor.addStep({
				label: 'Fill Shape',
				undo: () => { g.fill = before.fill; g.fillColor = before.fillColor; g.line = before.line; obj.invalidateGraphic2D?.(); },
				redo: () => { g.fill = after.fill;  g.fillColor = after.fillColor;  g.line = after.line;  obj.invalidateGraphic2D?.(); }
			});
		}
		_editor?.selectObjects?.([obj]);
	}
	
	async _fillByTracingRegion(mouse, color) {
		const host = _editor?.active2DHost || _root;
		const W = Math.max(32, Math.min(2048, Math.round(this.canvas.width)));
		const H = Math.max(32, Math.min(2048, Math.round(this.canvas.height)));
		const s = document.createElement('canvas');
		s.width = W; s.height = H;
		const sx = s.getContext('2d');
		sx.setTransform(1,0,0,1,0,0);
		sx.clearRect(0,0,W,H);
		
		const objs = this._all2D(host);
		for (const obj of objs) {
			const g = obj?.graphic2d;
			const pts = Array.isArray(g?._points) ? g._points : [];
			if (pts.length < 2) continue;
			const M = this._screenMatrixFor(obj);
			const path = new Path2D();
			let first = true;
			for (let i = 0; i < pts.length; i++) {
				const p = new DOMPoint(pts[i].x, pts[i].y).matrixTransform(M);
				if (first) { path.moveTo(p.x, p.y); first = false; }
				else path.lineTo(p.x, p.y);
			}
			if (pts.length >= 3) path.closePath();
			sx.fillStyle = '#000';
			sx.strokeStyle = '#000';
			if (g.fill) sx.fill(path);
			if (g.line) {
				sx.lineCap = g.lineCap || 'butt';
				sx.lineJoin = g.lineJoin || 'miter';
				sx.lineWidth = Math.max(1, Number(g.lineWidth || 1)) * (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
				sx.stroke(path);
			}
		}
		
		const mx = Math.max(0, Math.min(W-1, Math.round(mouse.x)));
		const my = Math.max(0, Math.min(H-1, Math.round(mouse.y)));
		const img = sx.getImageData(0,0,W,H);
		const data = img.data;
		const idx = (x,y) => ((y*W + x) << 2);
		const isBlocked = (x,y) => data[idx(x,y)] > 0; // any black pixel = boundary/filled
		
		const target = idx(mx,my);
		if (data[target] > 0) return null;
		
		const stack = [[mx,my]];
		const mark = new Uint8Array(W*H);
		mark[my*W + mx] = 1;
		while (stack.length) {
			const [x,y] = stack.pop();
			const k = idx(x,y);
			data[k] = 255; data[k+1] = 255; data[k+2] = 255; data[k+3] = 255;
			if (x>0 && !mark[y*W + (x-1)] && !isBlocked(x-1,y)) { mark[y*W + (x-1)] = 1; stack.push([x-1,y]); }
			if (x<W-1 && !mark[y*W + (x+1)] && !isBlocked(x+1,y)) { mark[y*W + (x+1)] = 1; stack.push([x+1,y]); }
			if (y>0 && !mark[(y-1)*W + x] && !isBlocked(x,y-1)) { mark[(y-1)*W + x] = 1; stack.push([x,y-1]); }
			if (y<H-1 && !mark[(y+1)*W + x] && !isBlocked(x,y+1)) { mark[(y+1)*W + x] = 1; stack.push([x,y+1]); }
		}
		sx.putImageData(img,0,0);
		
		const outline = [];
		for (let y = 0; y < H; y++) {
			let run = null;
			for (let x = 0; x < W; x++) {
				const k = idx(x,y);
				const filled = data[k] === 255 && data[k+1] === 255 && data[k+2] === 255;
				if (filled && run == null) run = x;
				if ((!filled || x === W-1) && run != null) {
					const rx = (x === W-1 && filled) ? x : x-1;
					const cx = (run + rx) * 0.5;
					outline.push({ x: cx, y });
					run = null;
				}
			}
		}
		if (outline.length < 3) return null;
		
		const invHostScreen = (new DOMMatrix().scale((this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1), (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1)).multiply(this._worldDOMMatrix(host))).inverse();
		const localPts = outline.map(p => {
			const tp = new DOMPoint(p.x, p.y).matrixTransform(invHostScreen);
			return { x: tp.x, y: tp.y };
		});
		
		const simp = this._simplify(localPts, 0.75);
		if (simp.length < 3) return null;
		const a = simp[0], b = simp[simp.length-1];
		if (a.x !== b.x || a.y !== b.y) simp.push({ x: a.x, y: a.y });
		
		const components = [{ type: 'Graphic2D', properties: { fill: true, line: false, fillColor: color || '#000000ff', _points: simp } }];
		const obj = await host.createObject({ name: 'Fill Region', components });
		return obj;
	}
	
	_simplify(pts, tol = 0.5) {
		if (!pts || pts.length < 3) return pts ? pts.slice() : [];
		const out = [pts[0]];
		let prev = pts[0];
		const t2 = tol * tol;
		for (let i = 1; i < pts.length - 1; i++) {
			const p = pts[i];
			const dx = p.x - prev.x, dy = p.y - prev.y;
			if (dx*dx + dy*dy > t2) { out.push(p); prev = p; }
		}
		out.push(pts[pts.length-1]);
		return out;
	}
	
	_onDown(e) {
		if (!this._isActive()) return;
		e.preventDefault();
		this.host = _editor?.active2DHost || _root;
		const m = this._mouseToCanvas(e);
		this.cursor = m;
		const color = _editor.draw2d?.fillColor || '#000000ff';
		
		const pick = this._pickTarget(m);
		if (pick && pick.how === 'inside') {
			this._applyFillOnObject(pick.obj, color);
			_editor?.requestRender?.();
			return;
		}
		
		const after = () => _editor?.requestRender?.();
		this._fillByTracingRegion(m, color).then(obj => {
			if (!obj) {
				if (pick && pick.obj) this._applyFillOnObject(pick.obj, color);
			} else {
				if (_editor?.addStep) {
					const host = obj.parent || this.host || _root;
					const props = { ...(obj.graphic2d || {}) };
					props._points = (obj.graphic2d?._points || []).map(p => ({ x:p.x, y:p.y }));
					const comps = [{ type: 'Graphic2D', properties: props }];
					let keep = obj;
					_editor.addStep({
						label: 'Fill Region',
						undo: async () => { await keep?.delete?.(); },
						redo: async () => {
							if (keep && keep.parent) return;
							keep = await host.createObject({ name: 'Fill Region', components: comps });
						}
					});
				}
				_editor?.selectObjects?.([obj]);
			}
			after();
		});
	}
	
	_onMove(e) {
		if (!this._isActive()) return;
		this.cursor = this._mouseToCanvas(e);
	}
	
	_onBlur() { this.cursor = null; }
	
	render() {}
}