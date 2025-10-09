export default class D2DEdit {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;

		this.pointRadius = 5;
		this.hitRadius = 8;

		this.selectedPoints = []; // [{ obj, lindex }]
		this.hoverPoint = null;   // { obj, lindex }

		this.dragging = false;
		this.dragObj = null;          // object being dragged
		this.grabLIndex = null;       // logical index we grabbed
		this.grabLocal = null;        // local pos under cursor at mousedown
		this.lastLocal = null;        // last local cursor pos (for delta)
		this.hasMoved = false;        // only create history step if moved
		this.undoSnapshot = null;     // { obj, items:[{i,x,y}] }
		this.redoSnapshot = null;

		this._onMouseDown = this._onMouseDown.bind(this);
		this._onMouseMove = this._onMouseMove.bind(this);
		this._onMouseUp = this._onMouseUp.bind(this);
		this._onBlur = this._onBlur.bind(this);

		this._attach();
	}

	destroy() { this._detach(); }

	_attach() {
		if (!this.canvas) return;
		this.canvas.addEventListener('mousedown', this._onMouseDown, { passive: false });
		window.addEventListener('mousemove', this._onMouseMove, { passive: false });
		window.addEventListener('mouseup', this._onMouseUp, { passive: false });
		window.addEventListener('blur', this._onBlur, { passive: false });
	}

	_detach() {
		if (!this.canvas) return;
		this.canvas.removeEventListener('mousedown', this._onMouseDown);
		window.removeEventListener('mousemove', this._onMouseMove);
		window.removeEventListener('mouseup', this._onMouseUp);
		window.removeEventListener('blur', this._onBlur);
	}

	render() {
		if (!_editor || _editor.tool !== 'select') return;
		const ctx = this.ctx;
		if (!ctx) return;

		const objs = Array.isArray(_editor.selectedObjects) ? _editor.selectedObjects : [];
		if (objs.length === 0) return;

		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);

		for (const obj of objs) {
			const g = obj?.graphic2d;
			const pts = g?._points || [];
			if (pts.length === 0) continue;

			const world = this._worldDOMMatrix(obj);
			const screen = new DOMMatrix().scale(gs, gs).multiply(world);

			const logical = this._logicalPoints(pts);
			for (let li = 0; li < logical.length; li++) {
				const p = logical[li];
				const sp = this._applyDOM(screen, p.x, p.y);

				const sel = this._isSelected(obj, li);
				const hov = this._isHover(obj, li);
				const r = sel ? this.pointRadius * 1.5 : (hov ? this.pointRadius * 1.2 : this.pointRadius);

				ctx.beginPath();
				ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
				ctx.fillStyle = sel ? '#ffffff' : (hov ? '#ffffff' : '#00ff88');
				ctx.fill();
				ctx.lineWidth = 1;
				ctx.strokeStyle = sel ? '#003844' : '#00442a';
				ctx.stroke();
			}
		}

		ctx.restore();
	}

	_onMouseDown(e) {
		if (!_editor || _editor.tool !== 'select') return;
		const hit = this._pickPoint(e);

		if (!hit) {
			this.selectedPoints = [];
			this._endDrag(false);
			return;
		}

		const mod = (e.metaKey || e.ctrlKey);
		const add = e.shiftKey;

		if (add) {
			if (!this._isSelected(hit.obj, hit.lindex)) this.selectedPoints.push(hit);
		} else if (mod) {
			if (this._isSelected(hit.obj, hit.lindex)) this._removeSelected(hit.obj, hit.lindex);
			else this.selectedPoints.push(hit);
		} else {
			this.selectedPoints = [hit];
		}

		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
		const world = this._worldDOMMatrix(hit.obj);
		const screen = new DOMMatrix().scale(gs, gs).multiply(world);
		const inv = screen.inverse();

		const m = this._mouseToCanvas(e);
		const cursorLocal = this._applyDOM(inv, m.x, m.y);

		this.dragging = true;
		this.dragObj = hit.obj;
		this.grabLIndex = hit.lindex;
		this.grabLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.lastLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.hasMoved = false;

		// snapshot selected points (same object only) for undo
		this.undoSnapshot = this._snapshot(this.dragObj, this._selectedLogicalLIsFor(this.dragObj));
		this.redoSnapshot = null;

		this.canvas.style.cursor = 'grabbing';
		e.preventDefault();
	}

	_onMouseMove(e) {
		if (!_editor || _editor.tool !== 'select') return;

		if (this.dragging && this.dragObj) {
			const obj = this.dragObj;
			const g = obj?.graphic2d;
			const pts = g?._points || [];
			if (pts.length === 0) return;

			const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
			const world = this._worldDOMMatrix(obj);
			const screen = new DOMMatrix().scale(gs, gs).multiply(world);
			const inv = screen.inverse();

			const m = this._mouseToCanvas(e);
			const cursorLocal = this._applyDOM(inv, m.x, m.y);

			// delta since last frame — moves all selected logical points for this object
			const dx = cursorLocal.x - this.lastLocal.x;
			const dy = cursorLocal.y - this.lastLocal.y;

			if (dx !== 0 || dy !== 0) {
				this.hasMoved = true;
				const lis = this._selectedLogicalLIsFor(obj);
				for (const li of lis) {
					const map = this._logicalMap(pts, li);
					for (const pi of map) {
						pts[pi].x += dx;
						pts[pi].y += dy;
					}
				}
				this.lastLocal = cursorLocal;
			}

			this.canvas.style.cursor = 'grabbing';
			e.preventDefault();
			return;
		}

		const hit = this._pickPoint(e);
		this.hoverPoint = hit ? { obj: hit.obj, lindex: hit.lindex } : null;
		this.canvas.style.cursor = 'default';
	}

	_onMouseUp() { this._endDrag(true); }
	_onBlur() { this._endDrag(false); }

	_endDrag(commit) {
		if (!this.dragging) return;

		this.dragging = false;
		this.canvas.style.cursor = 'default';

		if (commit && this.hasMoved && this.dragObj && this.undoSnapshot) {
			this.redoSnapshot = this._snapshot(this.dragObj, this._selectedLogicalLIsFor(this.dragObj));

			const obj = this.dragObj;
			const before = this.undoSnapshot;
			const after = this.redoSnapshot;

			_editor?.addStep?.({
				name: 'Edit 2D Points',
				undo: () => this._applySnapshot(obj, before),
				redo: () => this._applySnapshot(obj, after)
			});
		}

		this.dragObj = null;
		this.grabLIndex = null;
		this.grabLocal = null;
		this.lastLocal = null;
		this.hasMoved = false;
		this.undoSnapshot = null;
		this.redoSnapshot = null;
	}

	_pickPoint(e) {
		const mouse = this._mouseToCanvas(e);
		const objs = Array.isArray(_editor?.selectedObjects) ? _editor.selectedObjects : [];
		if (objs.length === 0) return null;

		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);

		let best = null;
		let bestD2 = Infinity;

		for (const obj of objs) {
			const g = obj?.graphic2d;
			const pts = g?._points || [];
			if (pts.length === 0) continue;

			const world = this._worldDOMMatrix(obj);
			const screen = new DOMMatrix().scale(gs, gs).multiply(world);

			const logical = this._logicalPoints(pts);
			for (let li = 0; li < logical.length; li++) {
				const p = logical[li];
				const sp = this._applyDOM(screen, p.x, p.y);
				const dx = sp.x - mouse.x;
				const dy = sp.y - mouse.y;
				const d2 = dx * dx + dy * dy;

				if (d2 <= this.hitRadius * this.hitRadius && d2 < bestD2) {
					bestD2 = d2;
					best = { obj, lindex: li };
				}
			}
		}
		return best;
	}

	_mouseToCanvas(e) {
		const rect = this.canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
		const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
		return { x, y };
	}

	_isSelected(obj, lindex) { return this.selectedPoints.some(sp => sp.obj === obj && sp.lindex === lindex); }
	_isHover(obj, lindex) { return !!(this.hoverPoint && this.hoverPoint.obj === obj && this.hoverPoint.lindex === lindex); }
	_removeSelected(obj, lindex) { this.selectedPoints = this.selectedPoints.filter(sp => !(sp.obj === obj && sp.lindex === lindex)); }

	_selectedLogicalLIsFor(obj) {
		const lis = [];
		for (const sp of this.selectedPoints) if (sp.obj === obj) lis.push(sp.lindex);
		// if none selected on this object, drag the grabbed one
		if (lis.length === 0 && this.grabLIndex != null) lis.push(this.grabLIndex);
		return lis;
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
			const rz = Number(o.rotation?.z) || 0; // radians
			const sx = Number(o.scale?.x) || 1;
			const sy = Number(o.scale?.y) || 1;
			m = m.translate(tx, ty).rotate(rz * 180 / Math.PI).scale(sx, sy);
		}
		return m;
	}

	_applyDOM(M, x, y) {
		const p = new DOMPoint(x, y).matrixTransform(M);
		return { x: p.x, y: p.y };
	}

	_logicalPoints(points) {
		if (points.length < 2) return points.slice();
		const a = points[0], b = points[points.length - 1];
		if (this._approx(a.x, b.x) && this._approx(a.y, b.y)) return points.slice(0, -1);
		return points.slice();
	}

	_logicalMap(points, lindex) {
		const last = points.length - 1;
		if (points.length >= 2) {
			const a = points[0], b = points[last];
			if (this._approx(a.x, b.x) && this._approx(a.y, b.y)) {
				if (lindex === 0) return [0, last];
			}
		}
		return [lindex];
	}

	_snapshot(obj, logicalIndexes) {
		const g = obj?.graphic2d;
		const pts = g?._points || [];
		const items = [];
		for (const li of logicalIndexes) {
			const map = this._logicalMap(pts, li);
			for (const pi of map) {
				const p = pts[pi];
				items.push({ i: pi, x: p.x, y: p.y });
			}
		}
		return { obj, items };
	}

	_applySnapshot(obj, snap) {
		if (!snap || snap.obj !== obj) return;
		const pts = obj?.graphic2d?._points || [];
		for (const it of snap.items) {
			if (pts[it.i]) { pts[it.i].x = it.x; pts[it.i].y = it.y; }
		}
	}

	_approx(a, b) {
		const e = 1e-6;
		return Math.abs(a - b) <= e;
	}
}