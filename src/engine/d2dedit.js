export default class D2DEdit {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;

		this.pointRadius = 5;
		this.hitRadius = 8;

		// [{ obj, pidx, lindex }]
		this.selectedPoints = [];
		this.hoverPoint = null;

		this.dragging = false;
		this.dragObj = null;
		this.grabPath = null;     // path index
		this.grabLIndex = null;   // logical index in that path
		this.grabLocal = null;
		this.lastLocal = null;
		this.hasMoved = false;

		this.undoSnapshot = null; // points snapshot for normal shapes
		this.redoSnapshot = null;

		// text-rect mode snapshots (entire path)
		this._pathSnapshotBefore = null;
		this._pathSnapshotAfter  = null;

		// text-rect drag metadata
		this._textDrag = null; // { active, pidx, moveXIdx:int[], moveYIdx:int[], wasClosed:boolean }

		// snapping session (borrow drawer)
		this._snapSession = null;

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

	/* ---------------- overlay render (points) ---------------- */

	render() {
		if (_editor.mode != '2D') return;
		if (_editor.tool !== 'select') return;
		const ctx = this.ctx;
		if (!ctx) return;

		const objs = Array.isArray(_editor.selectedObjects) ? _editor.selectedObjects : [];
		if (objs.length === 0) return;

		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);

		for (const obj of objs) {
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if (paths.length === 0) continue;

			const world = this._worldDOMMatrix(obj);
			const screen = new DOMMatrix().scale(gs, gs).multiply(world);

			for (let pidx = 0; pidx < paths.length; pidx++) {
				const path = paths[pidx] || [];
				if (path.length === 0) continue;

				const logical = this._logicalPoints(path);
				for (let li = 0; li < logical.length; li++) {
					const p = logical[li];
					const sp = this._applyDOM(screen, p.x, p.y);

					const sel = this._isSelected(obj, pidx, li);
					const hov = this._isHover(obj, pidx, li);
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
		}

		ctx.restore();
	}

	/* ---------------- mouse ---------------- */

	_onMouseDown(e) {
		if (_editor.mode != '2D') return;
		if (_editor.tool !== 'select') return;

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
			if (!this._isSelected(hit.obj, hit.pidx, hit.lindex)) this.selectedPoints.push(hit);
		} else if (mod) {
			if (this._isSelected(hit.obj, hit.pidx, hit.lindex)) this._removeSelected(hit.obj, hit.pidx, hit.lindex);
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
		this.grabPath = hit.pidx;
		this.grabLIndex = hit.lindex;
		this.grabLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.lastLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.hasMoved = false;

		this._beginSnapSession(hit.obj?.parent || null);

		// Decide snapshot mode
		if (this._isText2D(this.dragObj)) {
			// Build text-rect drag metadata from the grabbed corner
			this._textDrag = this._buildTextDragMeta(this.dragObj, this.grabPath, this.grabLIndex);
			this._pathSnapshotBefore = this._clonePaths(this.dragObj.graphic2d._paths);
			this._pathSnapshotAfter  = null;
			this.undoSnapshot = null; // not used in text mode
			this.redoSnapshot = null;
		} else {
			this._textDrag = null;
			this.undoSnapshot = this._snapshotAllSelectedFor(this.dragObj);
			this.redoSnapshot = null;
			this._pathSnapshotBefore = null;
			this._pathSnapshotAfter  = null;
		}

		this.canvas.style.cursor = 'grabbing';
		e.preventDefault();
	}

	_onMouseMove(e) {
		if (_editor.mode != '2D') return;
		if (_editor.tool !== 'select') return;

		if (this.dragging && this.dragObj) {
			const obj = this.dragObj;
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if (paths.length === 0) return;

			const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
			const world = this._worldDOMMatrix(obj);
			const screen = new DOMMatrix().scale(gs, gs).multiply(world);
			const inv = screen.inverse();

			const m = this._mouseToCanvas(e);
			let targetLocal = this._applyDOM(inv, m.x, m.y);

			// snapping
			const drawer = this.d2drenderer?.drawer;
			const snappingOn = !!_editor?.draw2d?.snapEnabled && !!drawer;
			if (snappingOn) {
				if (!this._snapSession) this._beginSnapSession(obj?.parent || null);
				if (!drawer._snapCache || drawer._lastFocus !== (_editor?.focus || null)) {
					drawer._rebuildSnapCache();
				}
				const hit = drawer._snap?.(m);
				if (hit) drawer._snapHit = hit;

				if (hit?.hostLocal) {
					const hostNode = this._snapSession?.hostNode || null;
					const conv = this._hostToChildLocal(hostNode, obj, hit.hostLocal);
					targetLocal = { x: conv.x, y: conv.y };
				}
			}

			if (this._textDrag?.active) {
				// Text mode: set edges to target (no per-vertex deltas)
				const pidx = this._textDrag.pidx;
				const path = paths[pidx] || [];
				if (path.length) {
					const { moveXIdx, moveYIdx, wasClosed } = this._textDrag;

					for (const i of moveXIdx) if (path[i]) path[i].x = targetLocal.x;
					for (const i of moveYIdx) if (path[i]) path[i].y = targetLocal.y;

					// keep closed if was closed
					if (wasClosed && path.length >= 2) {
						const a = path[0], b = path[path.length - 1];
						if (!this._approx(a.x, b.x) || !this._approx(a.y, b.y)) {
							path[path.length - 1] = { x: a.x, y: a.y };
						}
					}
					this.hasMoved = true;
					this.lastLocal = targetLocal;
				}
			} else {
				// Normal mode: delta-based move of selected logicals
				const dx = targetLocal.x - this.lastLocal.x;
				const dy = targetLocal.y - this.lastLocal.y;

				if (dx !== 0 || dy !== 0) {
					this.hasMoved = true;

					const byPath = this._selectedLogicalByPathFor(obj);
					for (const [pidx, lis] of byPath.entries()) {
						const path = paths[pidx] || [];
						for (const li of lis) {
							const map = this._logicalMap(path, li);
							for (const pi of map) {
								path[pi].x += dx;
								path[pi].y += dy;
							}
						}
					}
					this.lastLocal = targetLocal;
				}
			}

			this.canvas.style.cursor = 'grabbing';
			e.preventDefault();
			return;
		}

		const hit = this._pickPoint(e);
		this.hoverPoint = hit ? { obj: hit.obj, pidx: hit.pidx, lindex: hit.lindex } : null;
		this.canvas.style.cursor = 'default';
	}

	_onMouseUp() { this._endDrag(true); }
	_onBlur()    { this._endDrag(false); }

	_endDrag(commit) {
		if (!this.dragging) return;

		this.dragging = false;
		this.canvas.style.cursor = 'default';

		if (commit && this.hasMoved && this.dragObj) {
			const obj = this.dragObj;

			if (this._textDrag?.active) {
				// snapshot entire paths (since we mutated extra verts)
				this._pathSnapshotAfter = this._clonePaths(obj.graphic2d._paths);

				const before = this._pathSnapshotBefore;
				const after  = this._pathSnapshotAfter;

				if (before && after) {
					_editor?.addStep?.({
						name: 'Edit Text Rect',
						undo: () => { obj.graphic2d._paths = this._clonePaths(before); obj.checkSymbols?.(); },
						redo: () => { obj.graphic2d._paths = this._clonePaths(after);  obj.checkSymbols?.(); }
					});
				}
			} else if (this.undoSnapshot) {
				this.redoSnapshot = this._snapshotAllSelectedFor(obj);
				const before = this.undoSnapshot;
				const after  = this.redoSnapshot;
				_editor?.addStep?.({
					name: 'Edit 2D Points',
					undo: () => this._applySnapshot(obj, before),
					redo: () => this._applySnapshot(obj, after)
				});
				obj.checkSymbols?.();
			}
		}

		this._endSnapSession();

		this.dragObj = null;
		this.grabPath = null;
		this.grabLIndex = null;
		this.grabLocal = null;
		this.lastLocal = null;
		this.hasMoved = false;
		this.undoSnapshot = null;
		this.redoSnapshot = null;
		this._pathSnapshotBefore = null;
		this._pathSnapshotAfter  = null;
		this._textDrag = null;
	}

	/* ---------------- snapping glue ---------------- */

	_beginSnapSession(hostNode) {
		const drawer = this.d2drenderer?.drawer;
		if (!drawer) return;
		this._snapSession = { oldHost: drawer.host, hostNode: hostNode || null, using: true };
		drawer.host = hostNode || drawer.host || _editor?.focus || _root;
		drawer._snapCache = null;
	}

	_endSnapSession() {
		const drawer = this.d2drenderer?.drawer;
		if (!drawer || !this._snapSession) { this._snapSession = null; return; }
		drawer.host = this._snapSession.oldHost;
		drawer._snapHit = null;
		drawer._snapCache = null;
		this._snapSession = null;
	}

	_hostToChildLocal(hostNode, childNode, pHost) {
		const W_host  = this._worldDOMMatrix(hostNode || _root);
		const W_child = this._worldDOMMatrix(childNode);
		const M = W_child.inverse().multiply(W_host);
		const q = new DOMPoint(pHost.x, pHost.y).matrixTransform(M);
		return { x: q.x, y: q.y };
	}

	/* ---------------- keyboard (objects only) ---------------- */

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

	/* ---------------- insert vertex (Alt+Click) ---------------- */

	_onAltInsert(e) {
		const objs = Array.isArray(_editor?.selectedObjects) ? _editor.selectedObjects : [];
		if (objs.length === 0) return;

		const mouse = this._mouseToCanvas(e);
		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);

		let best = null;

		for (const obj of objs) {
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if (paths.length === 0) continue;

			const world = this._worldDOMMatrix(obj);
			const screen = new DOMMatrix().scale(gs, gs).multiply(world);
			const inv = screen.inverse();
			const local = this._applyDOM(inv, mouse.x, mouse.y);

			for (let pidx = 0; pidx < paths.length; pidx++) {
				const path = paths[pidx] || [];
				if (path.length < 2) continue;

				const logical = this._logicalPoints(path);
				const closed = this._isClosed(path);
				const segCount = closed ? logical.length : Math.max(0, logical.length - 1);

				for (let i = 0; i < segCount; i++) {
					const a = logical[i];
					const b = logical[(i + 1) % logical.length];
					const { d2, t } = this._pointSegDist2(local, a, b);
					if (best == null || d2 < best.d2) {
						best = { obj, pidx, local, liA: i, t, d2, closed, logicalLen: logical.length };
					}
				}
			}
		}

		if (!best) return;

		const { obj, pidx, local, liA, closed, logicalLen } = best;
		const paths = obj.graphic2d._paths;
		const path = paths[pidx];

		const before = this._clonePaths(paths);

		const insertAt = (closed && liA === logicalLen - 1) ? (path.length - 1) : (liA + 1);
		path.splice(insertAt, 0, { x: local.x, y: local.y });

		if (closed) {
			const a = path[0], b = path[path.length - 1];
			if (!this._approx(a.x, b.x) || !this._approx(a.y, b.y)) {
				path[path.length - 1] = { x: a.x, y: a.y };
			}
		}

		const after = this._clonePaths(paths);

		_editor?.addStep?.({
			name: 'Insert 2D Point',
			undo: () => { obj.graphic2d._paths = this._clonePaths(before); },
			redo: () => { obj.graphic2d._paths = this._clonePaths(after); }
		});

		const newLogicalIndex = (closed && liA === logicalLen - 1) ? logicalLen : (liA + 1);
		this.selectedPoints = [{ obj, pidx, lindex: newLogicalIndex }];

		this.dragging = true;
		this.dragObj = obj;
		this.grabPath = pidx;
		this.grabLIndex = newLogicalIndex;
		this.grabLocal = { x: local.x, y: local.y };
		this.lastLocal = { x: local.x, y: local.y };
		this.hasMoved = false;
		this.undoSnapshot = this._snapshotAllSelectedFor(this.dragObj);
		this.redoSnapshot = null;

		this.canvas.style.cursor = 'grabbing';
	}

	/* ---------------- picking & helpers ---------------- */

	_pickPoint(e) {
		const mouse = this._mouseToCanvas(e);
		const objs = Array.isArray(_editor?.selectedObjects) ? _editor.selectedObjects : [];
		if (objs.length === 0) return null;

		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
		let best = null;
		let bestD2 = Infinity;

		for (const obj of objs) {
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if (paths.length === 0) continue;

			const world = this._worldDOMMatrix(obj);
			const screen = new DOMMatrix().scale(gs, gs).multiply(world);

			for (let pidx = 0; pidx < paths.length; pidx++) {
				const path = paths[pidx] || [];
				if (path.length === 0) continue;

				const logical = this._logicalPoints(path);
				for (let li = 0; li < logical.length; li++) {
					const p = logical[li];
					const sp = this._applyDOM(screen, p.x, p.y);
					const dx = sp.x - mouse.x;
					const dy = sp.y - mouse.y;
					const d2 = dx * dx + dy * dy;

					if (d2 <= this.hitRadius * this.hitRadius && d2 < bestD2) {
						bestD2 = d2;
						best = { obj, pidx, lindex: li };
					}
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

	_isSelected(obj, pidx, lindex) {
		return this.selectedPoints.some(sp => sp.obj === obj && sp.pidx === pidx && sp.lindex === lindex);
	}
	_isHover(obj, pidx, lindex) {
		return !!(this.hoverPoint && this.hoverPoint.obj === obj && this.hoverPoint.pidx === pidx && this.hoverPoint.lindex === lindex);
	}
	_removeSelected(obj, pidx, lindex) {
		this.selectedPoints = this.selectedPoints.filter(sp => !(sp.obj === obj && sp.pidx === pidx && sp.lindex === lindex));
	}

	_selectedLogicalByPathFor(obj) {
		const map = new Map(); // pidx -> [lindex...]
		for (const sp of this.selectedPoints) {
			if (sp.obj !== obj) continue;
			if (!map.has(sp.pidx)) map.set(sp.pidx, []);
			map.get(sp.pidx).push(sp.lindex);
		}
		if (map.size === 0 && this.grabPath != null && this.grabLIndex != null) {
			map.set(this.grabPath, [this.grabLIndex]);
		}
		return map;
	}

	/* -------- text2d helpers (build edge groups based on grabbed corner) -------- */

	_isText2D(obj) {
		// Adjust this predicate to however text is tagged in your scene graph
		return obj.hasComponent('Text2D');
	}

	_buildTextDragMeta(obj, pidx, lindex) {
		const paths = obj?.graphic2d?._paths || [];
		const path  = paths[pidx] || [];
		if (path.length < 4) return { active:false };

		// Work on full path; determine closure
		const wasClosed = this._isClosed(path);

		// Convert lindex (logical, ignores duplicate last) to physical indices we can compare
		const logical = this._logicalPoints(path);
		const grabP   = logical[lindex];
		if (!grabP) return { active:false };

		// Find all indices that share the same X (vertical edge) and same Y (horizontal edge)
		const eps = 1e-6;
		const sameX = [];
		const sameY = [];
		for (let i = 0; i < path.length; i++) {
			const p = path[i];
			if (Math.abs(p.x - grabP.x) <= eps) sameX.push(i);
			if (Math.abs(p.y - grabP.y) <= eps) sameY.push(i);
		}

		// If last equals first, ensure both included
		if (wasClosed) {
			const a = path[0], b = path[path.length - 1];
			if (Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps) {
				// nothing special; both are already captured by comparisons above
			}
		}

		return {
			active: true,
			pidx,
			moveXIdx: Array.from(new Set(sameX)),
			moveYIdx: Array.from(new Set(sameY)),
			wasClosed
		};
	}

	/* ---------------- matrix & misc helpers ---------------- */

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

	_clonePaths(paths) {
		return paths.map(path => path.map(p => ({ x: p.x, y: p.y })));
	}

	_snapshotAllSelectedFor(obj) {
		const g = obj?.graphic2d;
		const paths = Array.isArray(g?._paths) ? g._paths : [];
		const items = [];
		const byPath = this._selectedLogicalByPathFor(obj);
		for (const [pidx, lis] of byPath.entries()) {
			const path = paths[pidx] || [];
			for (const li of lis) {
				const map = this._logicalMap(path, li);
				for (const pi of map) {
					const p = path[pi];
					items.push({ pidx, i: pi, x: p.x, y: p.y });
				}
			}
		}
		return { obj, items };
	}

	_applySnapshot(obj, snap) {
		if (!snap || snap.obj !== obj) return;
		const paths = obj?.graphic2d?._paths || [];
		for (const it of snap.items) {
			const path = paths[it.pidx];
			if (path && path[it.i]) {
				path[it.i].x = it.x;
				path[it.i].y = it.y;
			}
		}
		obj.checkSymbols?.();
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

	/* ---------------- delete selected vertices ---------------- */

	_onDelete() {
		const drawer = this.d2drenderer.drawer;

		const doDelete = () => {
			if (this.selectedPoints.length < 1) return;

			const byObjPath = new Map(); // obj -> Map(pidx -> Set(lindex))
			for (const sp of this.selectedPoints) {
				if (!sp?.obj?.graphic2d?._paths) continue;
				if (!byObjPath.has(sp.obj)) byObjPath.set(sp.obj, new Map());
				const pm = byObjPath.get(sp.obj);
				if (!pm.has(sp.pidx)) pm.set(sp.pidx, new Set());
				pm.get(sp.pidx).add(sp.lindex);
			}
			if (byObjPath.size === 0) return;

			const before = [];
			for (const [obj] of byObjPath) before.push({ obj, paths: this._clonePaths(obj.graphic2d._paths) });

			for (const [obj, pmap] of byObjPath) {
				const paths = obj.graphic2d._paths;
				for (const [pidx, lset] of pmap) {
					const path = paths[pidx] || [];
					if (path.length === 0) continue;

					const wasClosed = this._isClosed(path);

					const toRemove = new Set();
					for (const li of lset) {
						const map = this._logicalMap(path, li);
						for (const pi of map) toRemove.add(pi);
					}

					const sorted = Array.from(toRemove).sort((a, b) => b - a);
					for (const idx of sorted) {
						if (idx >= 0 && idx < path.length) path.splice(idx, 1);
					}

					if (wasClosed && path.length >= 2) {
						const a = path[0], b = path[path.length - 1];
						if (!this._approx(a.x, b.x) || !this._approx(a.y, b.y)) {
							path.push({ x: a.x, y: a.y });
						}
					}
				}
			}

			const after = [];
			for (const [obj] of byObjPath) after.push({ obj, paths: this._clonePaths(obj.graphic2d._paths) });

			this.selectedPoints = [];
			drawer._rebuildSnapCache();

			_editor?.addStep?.({
				name: 'Delete 2D Points',
				undo: () => { 
					for (const s of before) s.obj.graphic2d._paths = this._clonePaths(s.paths);
					drawer._rebuildSnapCache();
				},
				redo: () => { 
					for (const s of after) s.obj.graphic2d._paths = this._clonePaths(s.paths);
					drawer._rebuildSnapCache();
				}
			});
		};
		setTimeout(doDelete, 10);
	}

	/* ---------------- utils ---------------- */

	_approx(a, b) { return Math.abs(a - b) <= 1e-6; }
}