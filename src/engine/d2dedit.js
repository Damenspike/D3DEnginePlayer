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
		this.dragObj = null;
		this.grabLIndex = null;
		this.grabLocal = null;
		this.lastLocal = null;
		this.hasMoved = false;
		this.undoSnapshot = null;
		this.redoSnapshot = null;

		// snapping session (borrow drawer)
		this._snapSession = null; // { oldHost, host, using: true }

		this._onMouseDown = this._onMouseDown.bind(this);
		this._onMouseMove = this._onMouseMove.bind(this);
		this._onMouseUp = this._onMouseUp.bind(this);
		this._onBlur = this._onBlur.bind(this);
		this._onDelete = this._onDelete.bind(this);
		this._onKeyDown = this._onKeyDown.bind(this);

		this._attach();
	}

	destroy() { this._detach(); }

	_attach() {
		if (!this.canvas) return;
		this.canvas.addEventListener('mousedown', this._onMouseDown, { passive: false });
		window.addEventListener('mousemove', this._onMouseMove, { passive: false });
		window.addEventListener('mouseup', this._onMouseUp, { passive: false });
		window.addEventListener('blur', this._onBlur, { passive: false });
		window.addEventListener('keydown', this._onKeyDown, { passive: false });
		_events.on('delete-action', this._onDelete);
	}

	_detach() {
		if (!this.canvas) return;
		this.canvas.removeEventListener('mousedown', this._onMouseDown);
		window.removeEventListener('mousemove', this._onMouseMove);
		window.removeEventListener('mouseup', this._onMouseUp);
		window.removeEventListener('blur', this._onBlur);
		window.removeEventListener('keydown', this._onKeyDown);
		_events.un('delete-action', this._onDelete);
	}

	// ---------------- overlay render (points) ----------------
	render() {
		if (_editor.mode != '2D') return;
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

	// ---------------- mouse ----------------
	_onMouseDown(e) {
		if (_editor.mode != '2D') return;
		if (!_editor || _editor.tool !== 'select') return;

		// Alt = insert new vertex
		if (e.altKey) {
			this._onAltInsert(e);
			e.preventDefault();
			return;
		}

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

		// prep transforms
		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
		const world = this._worldDOMMatrix(hit.obj);
		const screen = new DOMMatrix().scale(gs, gs).multiply(world);
		const inv = screen.inverse();

		// mouse → canvas → local (initial grab position)
		const m = this._mouseToCanvas(e);
		const cursorLocal = this._applyDOM(inv, m.x, m.y);

		// start vertex drag
		this.dragging = true;
		this.dragObj = hit.obj;
		this.grabLIndex = hit.lindex;
		this.grabLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.lastLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.hasMoved = false;

		// start snapping session (use obj.parent as host so snap hostLocal is parent-local)
		this._beginSnapSession(hit.obj?.parent || null);

		// history snapshot
		this.undoSnapshot = this._snapshot(this.dragObj, this._selectedLogicalLIsFor(this.dragObj));
		this.redoSnapshot = null;

		this.canvas.style.cursor = 'grabbing';
		e.preventDefault();
	}

	_onMouseMove(e) {
		if (_editor.mode != '2D') return;
		if (!_editor || _editor.tool !== 'select') return;

		// vertex drag with snapping
		if (this.dragging && this.dragObj) {
			const obj = this.dragObj;
			const g = obj?.graphic2d;
			const pts = g?._points || [];
			if (pts.length === 0) return;

			const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
			const world = this._worldDOMMatrix(obj);
			const screen = new DOMMatrix().scale(gs, gs).multiply(world);
			const inv = screen.inverse();

			// raw local from inverse (fallback)
			const m = this._mouseToCanvas(e);
			let targetLocal = this._applyDOM(inv, m.x, m.y);

			// try snap via drawer (returns hostLocal; convert host→obj local)
			const drawer = this.d2drenderer?.drawer;
			const snappingOn = !!_editor?.draw2d?.snapEnabled && !!drawer;
			if (snappingOn) {
				// ensure session host is correct
				if (!this._snapSession) this._beginSnapSession(obj?.parent || null);
				if (this._snapSession) {
					// rebuild cache as drawer does when host/focus changes
					if (!drawer._snapCache || drawer._lastFocus !== (_editor?.focus || null)) {
						drawer._rebuildSnapCache?.();
					}
					const hit = drawer._snap?.(m);
					// (optional) show their gizmo if their overlay is active
					if (hit) drawer._snapHit = hit;

					if (hit?.hostLocal) {
						// convert hostLocal (host = obj.parent) → obj local
						const hostNode = this._snapSession.hostNode;
						const conv = this._hostToChildLocal(hostNode, obj, hit.hostLocal);
						targetLocal = { x: conv.x, y: conv.y };
					}
				}
			}

			// delta since last frame — moves all selected logical points for this object
			const dx = targetLocal.x - this.lastLocal.x;
			const dy = targetLocal.y - this.lastLocal.y;

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
				this.lastLocal = targetLocal;
			}

			this.canvas.style.cursor = 'grabbing';
			e.preventDefault();
			return;
		}

		// hover
		const hit = this._pickPoint(e);
		this.hoverPoint = hit ? { obj: hit.obj, lindex: hit.lindex } : null;
		this.canvas.style.cursor = 'default';
	}

	_onMouseUp() { this._endDrag(true); }
	_onBlur()    { this._endDrag(false); }

	_endDrag(commit) {
		if (!this.dragging) return;

		this.dragging = false;
		this.canvas.style.cursor = 'default';

		// commit history
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

		// end snap session
		this._endSnapSession();

		this.dragObj = null;
		this.grabLIndex = null;
		this.grabLocal = null;
		this.lastLocal = null;
		this.hasMoved = false;
		this.undoSnapshot = null;
		this.redoSnapshot = null;
	}

	// ---------------- snapping glue ----------------
	_beginSnapSession(hostNode) {
		const drawer = this.d2drenderer?.drawer;
		if (!drawer) return;
		this._snapSession = {
			oldHost: drawer.host,
			hostNode: hostNode || null,
			using: true
		};
		drawer.host = hostNode || drawer.host || _editor?.focus || _root;
		// force cache rebuild for reliable results
		drawer._snapCache = null;
	}

	_endSnapSession() {
		const drawer = this.d2drenderer?.drawer;
		if (!drawer || !this._snapSession) { this._snapSession = null; return; }
		// restore previous drawer state
		drawer.host = this._snapSession.oldHost;
		drawer._snapHit = null;
		drawer._snapCache = null;
		this._snapSession = null;
	}

	// Convert a point in host local space → child (obj) local space
	_hostToChildLocal(hostNode, childNode, pHost) {
		const W_host  = this._worldDOMMatrix(hostNode || _root);
		const W_child = this._worldDOMMatrix(childNode);
		// p_child = W_child^{-1} * W_host * p_host
		const M = W_child.inverse().multiply(W_host);
		const q = new DOMPoint(pHost.x, pHost.y).matrixTransform(M);
		return { x: q.x, y: q.y };
	}

	// ---------------- keyboard (objects only; unchanged) ----------------
	_onKeyDown(e) {
		if (_editor.mode !== '2D') return;
		if (!(_editor.tool === 'select' || _editor.tool === 'transform')) return;

		let dx = 0, dy = 0;
		switch (e.key) {
			case 'ArrowLeft':  dx = -1; break;
			case 'ArrowRight': dx =  1; break;
			case 'ArrowUp':    dy = -1; break;
			case 'ArrowDown':  dy =  1; break;
			default: return;
		}
		const step = e.shiftKey ? 25 : 1;
		dx *= step; dy *= step;
		e.preventDefault();

		const objsArr = Array.isArray(_editor.selectedObjects) ? _editor.selectedObjects : [];
		if (objsArr.length === 0) return;
		const objs = Array.from(new Set(objsArr));

		const before = objs.map(obj => ({
			obj,
			pos: { x: obj.position?.x || 0, y: obj.position?.y || 0, z: obj.position?.z || 0 }
		}));

		for (const o of objs) {
			if (!o.position) o.position = { x: 0, y: 0, z: 0 };
			o.position.x = (o.position.x || 0) + dx;
			o.position.y = (o.position.y || 0) + dy;
		}

		const after = objs.map(obj => ({
			obj,
			pos: { x: obj.position?.x || 0, y: obj.position?.y || 0, z: obj.position?.z || 0 }
		}));

		_editor?.addStep?.({
			name: 'Nudge Object(s)',
			undo: () => { for (const s of before) { s.obj.position.x = s.pos.x; s.obj.position.y = s.pos.y; s.obj.position.z = s.pos.z; } },
			redo: () => { for (const s of after)  { s.obj.position.x = s.pos.x; s.obj.position.y = s.pos.y; s.obj.position.z = s.pos.z; } }
		});
	}

	// ---------------- insert vertex (unchanged) ----------------
	_onAltInsert(e) {
		const objs = Array.isArray(_editor?.selectedObjects) ? _editor.selectedObjects : [];
		if (objs.length === 0) return;

		const mouse = this._mouseToCanvas(e);
		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);

		let best = null;

		for (const obj of objs) {
			const g = obj?.graphic2d;
			const pts = g?._points || [];
			if (pts.length < 2) continue;

			const world = this._worldDOMMatrix(obj);
			const screen = new DOMMatrix().scale(gs, gs).multiply(world);
			const inv = screen.inverse();
			const local = this._applyDOM(inv, mouse.x, mouse.y);

			const logical = this._logicalPoints(pts);
			const closed = this._isClosed(pts);

			const segCount = closed ? logical.length : Math.max(0, logical.length - 1);
			for (let i = 0; i < segCount; i++) {
				const a = logical[i];
				const b = logical[(i + 1) % logical.length];
				const { d2, t } = this._pointSegDist2(local, a, b);
				if (best == null || d2 < best.d2) {
					best = { obj, pts, local, liA: i, t, d2, closed };
				}
			}
		}

		if (!best) return;

		const { obj, pts, local, liA, closed } = best;

		const before = this._clonePoints(pts);

		// physical insert index
		const logicalLen = this._logicalPoints(pts).length;
		const insertAt = (closed && liA === logicalLen - 1) ? (pts.length - 1) : (liA + 1);

		pts.splice(insertAt, 0, { x: local.x, y: local.y });

		// keep closure
		if (closed) {
			const a = pts[0], b = pts[pts.length - 1];
			if (!this._approx(a.x, b.x) || !this._approx(a.y, b.y)) {
				pts[pts.length - 1] = { x: a.x, y: a.y };
			}
		}

		const after = this._clonePoints(pts);

		_editor?.addStep?.({
			name: 'Insert 2D Point',
			undo: () => { obj.graphic2d._points = this._clonePoints(before); },
			redo: () => { obj.graphic2d._points = this._clonePoints(after); }
		});

		// select the new logical point and start drag immediately
		const newLogicalIndex = (closed && liA === logicalLen - 1) ? logicalLen : (liA + 1);
		this.selectedPoints = [{ obj, lindex: newLogicalIndex }];

		// initialize drag state so the user can drag right away while holding mouse
		this.dragging = true;
		this.dragObj = obj;
		this.grabLIndex = newLogicalIndex;
		this.grabLocal = { x: local.x, y: local.y };
		this.lastLocal = { x: local.x, y: local.y };
		this.hasMoved = false;
		this.undoSnapshot = this._snapshot(this.dragObj, this._selectedLogicalLIsFor(this.dragObj));
		this.redoSnapshot = null;

		this.canvas.style.cursor = 'grabbing';
	}

	// ---------------- picking & helpers ----------------
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
			const rz = Number(o.rotation?.z) || 0;
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

	_isClosed(pts) {
		if (pts.length < 2) return false;
		const a = pts[0], b = pts[pts.length - 1];
		return this._approx(a.x, b.x) && this._approx(a.y, b.y);
	}

	_clonePoints(pts) { return pts.map(p => ({ x: p.x, y: p.y })); }

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

	_pointSegDist2(p, a, b) {
		const vx = b.x - a.x, vy = b.y - a.y;
		const wx = p.x - a.x, wy = p.y - a.y;
		const vv = vx * vx + vy * vy || 1e-12;
		let t = (wx * vx + wy * vy) / vv;
		if (t < 0) t = 0; else if (t > 1) t = 1;
		const px = a.x + t * vx;
		const py = a.y + t * vy;
		const dx = p.x - px, dy = p.y - py;
		return { d2: dx * dx + dy * dy, t };
	}

	_onDelete() {
		const doDelete = () => {
			if (this.selectedPoints.length < 1) return;

			const byObj = new Map();
			for (const sp of this.selectedPoints) {
				if (!sp?.obj?.graphic2d?._points) continue;
				if (!byObj.has(sp.obj)) byObj.set(sp.obj, new Set());
				byObj.get(sp.obj).add(sp.lindex);
			}
			if (byObj.size === 0) return;

			const clonePoints = (pts) => pts.map(p => ({ x: p.x, y: p.y }));
			const isClosed = (pts) => {
				if (pts.length < 2) return false;
				const a = pts[0], b = pts[pts.length - 1];
				return this._approx(a.x, b.x) && this._approx(a.y, b.y);
			};
			const ensureClosed = (pts, wasClosed) => {
				if (!wasClosed) return pts;
				if (pts.length < 2) return pts;
				const a = pts[0], b = pts[pts.length - 1];
				if (!this._approx(a.x, b.x) || !this._approx(a.y, b.y)) {
					pts.push({ x: a.x, y: a.y });
				}
				return pts;
			};

			const before = [];
			for (const [obj] of byObj) {
				const pts = obj.graphic2d._points || [];
				before.push({ obj, points: clonePoints(pts) });
			}

			for (const [obj, lset] of byObj) {
				const g = obj.graphic2d;
				const pts = g._points || [];
				if (pts.length === 0) continue;

				const wasClosed = isClosed(pts);

				const toRemove = new Set();
				for (const li of lset) {
					const mapped = this._logicalMap(pts, li);
					for (const pi of mapped) toRemove.add(pi);
				}

				const sorted = Array.from(toRemove).sort((a, b) => b - a);
				for (const idx of sorted) {
					if (idx >= 0 && idx < pts.length) pts.splice(idx, 1);
				}

				ensureClosed(pts, wasClosed);
			}

			const after = [];
			for (const [obj] of byObj) {
				const pts = obj.graphic2d._points || [];
				after.push({ obj, points: clonePoints(pts) });
			}

			this.selectedPoints = [];

			_editor?.addStep?.({
				name: 'Delete 2D Points',
				undo: () => {
					for (const s of before) {
						if (!s?.obj?.graphic2d) continue;
						s.obj.graphic2d._points = clonePoints(s.points);
					}
				},
				redo: () => {
					for (const s of after) {
						if (!s?.obj?.graphic2d) continue;
						s.obj.graphic2d._points = clonePoints(s.points);
					}
				}
			});
		};
		setTimeout(doDelete, 10);
	}

	_approx(a, b) {
		const e = 1e-6;
		return Math.abs(a - b) <= e;
	}
}