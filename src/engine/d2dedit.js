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

		// drag state for point editing
		this.dragging = false;
		this.dragObj = null;
		this.grabPath = null;     // path index
		this.grabLIndex = null;   // logical index in that path
		this.grabLocal = null;
		this.lastLocal = null;
		this.hasMoved = false;

		// snapshots for standard point edits
		this.undoSnapshot = null; // { obj, items:[{pidx,i,x,y}] }
		this.redoSnapshot = null;

		// text/bitmap rect mode (edge-group) snapshots (whole paths)
		this._pathSnapshotBefore = null;
		this._pathSnapshotAfter  = null;
		this._textDrag = null; // { active, pidx, moveXIdx:int[], moveYIdx:int[], wasClosed:boolean }

		// snapping (borrow d2ddraw)
		this._snapSession = null;

		// alignment snap (Flash-like)
		this._activeAlign = null; // { v:number|null, h:number|null, ttl:number }

		// bindings
		this._onMouseDown = this._onMouseDown.bind(this);
		this._onMouseMove = this._onMouseMove.bind(this);
		this._onMouseUp   = this._onMouseUp.bind(this);
		this._onBlur      = this._onBlur.bind(this);
		this._onDelete    = this._onDelete.bind(this);
		this._onKeyDown   = this._onKeyDown.bind(this);

		this._attach();
	}

	/* ============================== lifecycle ============================== */

	destroy() { this._detach(); }

	_attach() {
		if (!this.canvas) return;
		this.canvas.addEventListener('mousedown', this._onMouseDown, { passive: false });
		window.addEventListener('mousemove', this._onMouseMove, { passive: false });
		window.addEventListener('mouseup',   this._onMouseUp,   { passive: false });
		window.addEventListener('blur',      this._onBlur,      { passive: false });
		window.addEventListener('keydown',   this._onKeyDown,   { passive: false });
		_events?.on?.('delete-action', this._onDelete);
	}

	_detach() {
		if (!this.canvas) return;
		this.canvas.removeEventListener('mousedown', this._onMouseDown);
		window.removeEventListener('mousemove', this._onMouseMove);
		window.removeEventListener('mouseup',   this._onMouseUp);
		window.removeEventListener('blur',      this._onBlur);
		window.removeEventListener('keydown',   this._onKeyDown);
		_events?.un?.('delete-action', this._onDelete);
	}

	/* ============================== render (points + guides) ============================== */

	render() {
		if (_editor?.mode !== '2D') return;
		if (_editor?.tool !== 'select') return;
		const ctx = this.ctx;
		if (!ctx) return;

		const objs = Array.isArray(_editor.selectedObjects) ? _editor.selectedObjects : [];
		if (objs.length === 0) return;

		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);

		// alignment guides overlay (canvas space)
		this._renderAlignGuides(ctx);

		// points
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

	_renderAlignGuides(ctx) {
		if (!this._activeAlign) return;
		this._activeAlign.ttl = (this._activeAlign.ttl || 0) - 1;
		if (this._activeAlign.ttl < 0) { this._activeAlign = null; return; }

		const w = this.canvas.width, h = this.canvas.height;
		ctx.save();
		ctx.setTransform(1,0,0,1,0,0);
		ctx.lineWidth = 1;
		ctx.strokeStyle = '#37e3ff88';

		if (Number.isFinite(this._activeAlign.v)) {
			ctx.beginPath(); ctx.moveTo(this._activeAlign.v, 0); ctx.lineTo(this._activeAlign.v, h); ctx.stroke();
		}
		if (Number.isFinite(this._activeAlign.h)) {
			ctx.beginPath(); ctx.moveTo(0, this._activeAlign.h); ctx.lineTo(w, this._activeAlign.h); ctx.stroke();
		}
		ctx.restore();
	}

	/* ============================== mouse (points editing) ============================== */

	_onMouseDown(e) {
		if (_editor?.mode !== '2D') return;
		if (_editor?.tool !== 'select') return;

		// Alt+click inserts
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

		// local cursor in dragged object's space
		const gs = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
		const world = this._worldDOMMatrix(hit.obj);
		const screen = new DOMMatrix().scale(gs, gs).multiply(world);
		const inv = screen.inverse();

		const m = this._mouseToCanvas(e);
		const cursorLocal = this._applyDOM(inv, m.x, m.y);

		this.dragging  = true;
		this.dragObj   = hit.obj;
		this.grabPath  = hit.pidx;
		this.grabLIndex= hit.lindex;
		this.grabLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.lastLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.hasMoved  = false;

		this._beginSnapSession(hit.obj?.parent || null);

		// Decide whether to use rect-edge mode (Text2D/Bitmap2D) or standard point move
		if (this._isRectLike(this.dragObj)) {
			this._textDrag = this._buildTextDragMeta(this.dragObj, this.grabPath, this.grabLIndex);
			this._pathSnapshotBefore = this._clonePaths(this.dragObj.graphic2d._paths);
			this._pathSnapshotAfter  = null;
			this.undoSnapshot = null; this.redoSnapshot = null;
		} else {
			this._textDrag = null;
			this.undoSnapshot = this._snapshotAllSelectedFor(this.dragObj);
			this.redoSnapshot = null;
			this._pathSnapshotBefore = null; this._pathSnapshotAfter = null;
		}

		this.canvas.style.cursor = 'grabbing';
		e.preventDefault();
	}

	_onMouseMove(e) {
		if (_editor?.mode !== '2D') return;
		if (_editor?.tool !== 'select') return;

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

			// snapping to other geometry via drawer (host-local snapping)
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
				// Rect-like: set edges to targetLocal.x/.y
				const pidx = this._textDrag.pidx;
				const path = paths[pidx] || [];
				if (path.length) {
					const { moveXIdx, moveYIdx, wasClosed } = this._textDrag;

					for (const i of moveXIdx) if (path[i]) path[i].x = targetLocal.x;
					for (const i of moveYIdx) if (path[i]) path[i].y = targetLocal.y;

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
				// Standard mode: delta
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

	/* ============================== keyboard (objects only + alignment snapping) ============================== */

	_onKeyDown(e) {
		if (_editor?.mode !== '2D') return;
		if (!(_editor?.tool === 'select' || _editor?.tool === 'transform')) return;

		// Arrow → delta
		let dx = 0, dy = 0;
		switch (e.key) {
			case 'ArrowLeft':  dx = -1; break;
			case 'ArrowRight': dx =  1; break;
			case 'ArrowUp':    dy = -1; break; // canvas Y up is negative
			case 'ArrowDown':  dy =  1; break;
			default: return;
		}
		const step = e.shiftKey ? 25 : 1;
		dx *= step; dy *= step;
		e.preventDefault();

		const objsArr = Array.isArray(_editor.selectedObjects) ? _editor.selectedObjects : [];
		if (objsArr.length === 0) return;
		const objs = Array.from(new Set(objsArr));

		// Proposed move in canvas pixels (convert world → canvas w/ scalar)
		const gs = this._canvasScale();
		const moveCanvas = { x: dx * gs, y: dy * gs };

		// selection rect BEFORE
		const selRect = this._selectionBoundsCanvas(objs);
		if (!selRect) return;

		// AFTER-proposed
		const proposed = {
			l: selRect.l + moveCanvas.x,
			r: selRect.r + moveCanvas.x,
			t: selRect.t + moveCanvas.y,
			b: selRect.b + moveCanvas.y,
			cx: selRect.cx + moveCanvas.x,
			cy: selRect.cy + moveCanvas.y
		};

		// guides (canvas center + other 2D objects in focus group)
		const guides = this._buildAlignGuides(objs);
		const snapPx = Math.max(4, Number(_editor?.draw2d?.snapPx || 10));
		const snap = this._findSnapDelta(proposed, guides, snapPx); // { dx, dy, vLine, hLine } in canvas px

		// Convert snap delta back to world units
		const extraWorld = { x: (snap.dx || 0) / gs, y: (snap.dy || 0) / gs };

		// Mutate
		const before = objs.map(obj => ({
			obj,
			pos: { x: obj.position?.x || 0, y: obj.position?.y || 0, z: obj.position?.z || 0 }
		}));

		for (const o of objs) {
			if (!o.position) o.position = { x: 0, y: 0, z: 0 };
			o.position.x = (o.position.x || 0) + dx + extraWorld.x;
			o.position.y = (o.position.y || 0) + dy + extraWorld.y;
		}

		const after = objs.map(obj => ({
			obj,
			pos: { x: obj.position?.x || 0, y: obj.position?.y || 0, z: obj.position?.z || 0 }
		}));

		// show guides briefly
		this._activeAlign = { v: snap.vLine, h: snap.hLine, ttl: 12 };
		_editor?.requestRender?.() || this.d2drenderer?.render?.();

		// history
		_editor?.addStep?.({
			name: 'Nudge Object(s)',
			undo: () => { for (const s of before) { s.obj.position.x = s.pos.x; s.obj.position.y = s.pos.y; s.obj.position.z = s.pos.z; } },
			redo: () => { for (const s of after)  { s.obj.position.x = s.pos.x; s.obj.position.y = s.pos.y; s.obj.position.z = s.pos.z; } }
		});
	}

	/* ============================== insert vertex (Alt+Click) ============================== */

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

		// select and start drag right away
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

	/* ============================== delete selected vertices ============================== */

	_onDelete() {
		const drawer = this.d2drenderer?.drawer;

		const doDelete = () => {
			if (this.selectedPoints.length < 1) return;

			// obj -> Map(pidx -> Set(lindex))
			const byObjPath = new Map();
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
			drawer?._rebuildSnapCache?.();

			_editor?.addStep?.({
				name: 'Delete 2D Points',
				undo: () => {
					for (const s of before) s.obj.graphic2d._paths = this._clonePaths(s.paths);
					drawer?._rebuildSnapCache?.();
				},
				redo: () => {
					for (const s of after)  s.obj.graphic2d._paths = this._clonePaths(s.paths);
					drawer?._rebuildSnapCache?.();
				}
			});
		};
		// slight defer to avoid clashing with key repeat or UI focus
		setTimeout(doDelete, 10);
	}

	/* ============================== picking & selection helpers ============================== */

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

	/* ============================== matrices & coords ============================== */

	_viewMatrix() {
		const pr  = this.d2drenderer.pixelRatio || 1;
		const vs  = this.d2drenderer.viewScale  || 1;
		const off = this.d2drenderer.viewOffset || { x:0, y:0 };
		return new DOMMatrix().translate(off.x, off.y).scale(pr * vs);
	}

	_worldDOMMatrix(node) {
		let m = new DOMMatrix();
		const stack = [];
		for (let n = node; n; n = n.parent) stack.push(n);
		stack.reverse();
		for (const o of stack) {
			const tx = Number(o.position?.x) || 0;
			const ty = Number(o.position?.y) || 0;
			const rz = Number(o.rotation?.z) || 0;
			const sx = Number(o.scale?.x) || 1;
			const sy = Number(o.scale?.y) || 1;
			m = m.translate(tx, ty).rotate(rz * 180 / Math.PI).scale(sx, sy);
		}
		return m;
	}

	_childScreenMatrix(child) {
		return this._viewMatrix().multiply(this._worldDOMMatrix(child));
	}

	_hostToChildLocal(hostNode, childNode, pHost) {
		const W_host  = this._worldDOMMatrix(hostNode || _root);
		const W_child = this._worldDOMMatrix(childNode);
		const M = W_child.inverse().multiply(W_host);
		const q = new DOMPoint(pHost.x, pHost.y).matrixTransform(M);
		return { x: q.x, y: q.y };
	}

	_applyDOM(M, x, y) {
		const p = new DOMPoint(x, y).matrixTransform(M);
		return { x: p.x, y: p.y };
	}

	_canvasScale() {
		return (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);
	}

	/* ============================== points helpers & snapshots ============================== */

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

	/* ============================== text/bitmap rect helpers ============================== */

	_isRectLike(obj) {
		// Treat text and bitmap as rect-like for edge-paired movement
		return obj?.hasComponent?.('Text2D') || obj?.hasComponent?.('Bitmap2D');
	}

	_buildTextDragMeta(obj, pidx, lindex) {
		const paths = obj?.graphic2d?._paths || [];
		const path  = paths[pidx] || [];
		if (path.length < 4) return { active:false };

		const wasClosed = this._isClosed(path);
		const logical = this._logicalPoints(path);
		const grabP   = logical[lindex];
		if (!grabP) return { active:false };

		const eps = 1e-6;
		const sameX = [];
		const sameY = [];
		for (let i = 0; i < path.length; i++) {
			const p = path[i];
			if (Math.abs(p.x - grabP.x) <= eps) sameX.push(i);
			if (Math.abs(p.y - grabP.y) <= eps) sameY.push(i);
		}

		return {
			active: true,
			pidx,
			moveXIdx: Array.from(new Set(sameX)),
			moveYIdx: Array.from(new Set(sameY)),
			wasClosed
		};
	}

	/* ============================== alignment snap (Flash-like) ============================== */

	_objBoundsCanvas(obj) {
		const g = obj?.graphic2d;
		const paths = Array.isArray(g?._paths) ? g._paths : [];
		if (paths.length === 0) return null;

		let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
		const M = this._childScreenMatrix(obj);

		for (const path of paths) {
			for (const p of (path || [])) {
				const q = new DOMPoint(p.x, p.y).matrixTransform(M);
				if (q.x < minx) minx = q.x;
				if (q.y < miny) miny = q.y;
				if (q.x > maxx) maxx = q.x;
				if (q.y > maxy) maxy = q.y;
			}
		}
		if (!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) return null;
		return {
			l: minx, r: maxx, t: miny, b: maxy,
			cx: (minx + maxx) * 0.5,
			cy: (miny + maxy) * 0.5
		};
	}

	_selectionBoundsCanvas(objs) {
		let rect = null;
		for (const o of objs) {
			const b = this._objBoundsCanvas(o);
			if (!b) continue;
			if (!rect) rect = { ...b };
			else {
				rect.l = Math.min(rect.l, b.l);
				rect.t = Math.min(rect.t, b.t);
				rect.r = Math.max(rect.r, b.r);
				rect.b = Math.max(rect.b, b.b);
				rect.cx = (rect.l + rect.r) * 0.5;
				rect.cy = (rect.t + rect.b) * 0.5;
			}
		}
		return rect;
	}

	_buildAlignGuides(selectedObjs) {
		const w = this.canvas.width, h = this.canvas.height;
		const selectedSet = new Set(selectedObjs);

		// Prefer siblings in focus group; fall back to root children
		const pool = Array.isArray(_editor?.focus?.children) ? _editor.focus.children
			: (Array.isArray(_root?.children) ? _root.children : []);

		const candidates = [];
		for (const n of pool) {
			if (selectedSet.has(n)) continue;
			if (!n?.is2D || !Array.isArray(n.graphic2d?._paths)) continue;
			const b = this._objBoundsCanvas(n);
			if (b) candidates.push(b);
		}

		const v = new Set([w * 0.5]); // vertical guide lines (x)
		const hset = new Set([h * 0.5]); // horizontal guide lines (y)

		for (const b of candidates) {
			v.add(b.l); v.add(b.cx); v.add(b.r);
			hset.add(b.t); hset.add(b.cy); hset.add(b.b);
		}

		return { v: Array.from(v.values()), h: Array.from(hset.values()) };
	}

	_findSnapDelta(rect, guides, snapPx) {
		let bestDx = 0, bestDy = 0;
		let vLine = null, hLine = null;

		// X: compare left/center/right to each vertical guide
		let best = Infinity;
		const vx = [rect.l, rect.cx, rect.r];
		for (const gx of guides.v) {
			for (const x of vx) {
				const d = gx - x; const ad = Math.abs(d);
				if (ad <= snapPx && ad < best) { best = ad; bestDx = d; vLine = gx; }
			}
		}

		// Y: compare top/middle/bottom to each horizontal guide
		best = Infinity;
		const vy = [rect.t, rect.cy, rect.b];
		for (const gy of guides.h) {
			for (const y of vy) {
				const d = gy - y; const ad = Math.abs(d);
				if (ad <= snapPx && ad < best) { best = ad; bestDy = d; hLine = gy; }
			}
		}

		return { dx: bestDx, dy: bestDy, vLine, hLine };
	}

	/* ============================== misc utils ============================== */

	_approx(a, b) { return Math.abs(a - b) <= 1e-6; }
}