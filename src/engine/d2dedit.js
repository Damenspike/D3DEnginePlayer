// d2dedit.js
import * as U from './d2dutility.js';

export default class D2DEdit {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;

		this.pointRadius = 5;
		this.hitRadius = 8;

		// [{ obj, pidx, lindex }]
		this.selectedObjects = []; // late frame mirror of _editor.selectedObjects (Why? because point selection shouldnt happen right as we click an unselected object)
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
		this.runAfterRender = null;

		// snapshots for standard/uniform edits
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

		// scale meta (used for both iso + axis)
		// mode: 'iso' | 'axis' ; axis: 'x' | 'y' (when mode === 'axis')
		this._scaleMeta = null;
		
		// adding curves
		this.pointRadius = 5;
		this.hitRadius   = 8;
		
		// edge hit-test (in screen px)
		this.edgeHitRadius    = 8;   // how close to an edge to grab curve
		this.edgePointBuffer  = 12;  // keep this radius around endpoints point-only
		
		// [{ obj, pidx, lindex }]
		this.selectedObjects = [];
		this.selectedPoints  = [];
		this.hoverPoint      = null;
		this.hoverEdge  = null;
		
		// curve drag state
		this._curveDrag            = null; // { active, obj, pidx, liA, liB, rawIdxsDest, base:{cx,cy} }
		this._curveSnapshotBefore  = null;
		this._curveSnapshotAfter   = null;

		// bindings
		this._onMouseDown = this._onMouseDown.bind(this);
		this._onMouseMove = this._onMouseMove.bind(this);
		this._onMouseUp   = this._onMouseUp.bind(this);
		this._onBlur      = this._onBlur.bind(this);
		this._onDelete    = this._onDelete.bind(this);
		this._onKeyDown   = this._onKeyDown.bind(this);
		this._onWindowMouseDown = this._onWindowMouseDown.bind(this);
		
		_events.unall('deselect-2dpoints');
		_events.on('deselect-2dpoints', () => {
			this.selectedPoints = [];
		});

		this._attach();
	}

	/* ============================== lifecycle ============================== */

	destroy() { this._detach(); }

	_attach() {
		if(!this.canvas) return;
		this.canvas.addEventListener('mousedown', this._onMouseDown, { passive: false });
		window.addEventListener('mousedown', this._onWindowMouseDown, { passive: false });
		window.addEventListener('mousemove', this._onMouseMove, { passive: false });
		window.addEventListener('mouseup',   this._onMouseUp,   { passive: false });
		window.addEventListener('blur',      this._onBlur,      { passive: false });
		window.addEventListener('keydown',   this._onKeyDown,   { passive: false });
		_events?.on?.('delete-action', this._onDelete);
	}

	_detach() {
		if(!this.canvas) return;
		this.canvas.removeEventListener('mousedown', this._onMouseDown);
		window.removeEventListener('mousedown', this._onWindowMouseDown);
		window.removeEventListener('mousemove', this._onMouseMove);
		window.removeEventListener('mouseup',   this._onMouseUp);
		window.removeEventListener('blur',      this._onBlur);
		window.removeEventListener('keydown',   this._onKeyDown);
		_events?.un?.('delete-action', this._onDelete);
	}

	/* ============================== render (points + guides) ============================== */

	afterRender() {
		this.selectedObjects = [..._editor.selectedObjects];
		this.runAfterRender?.();
		this.runAfterRender = null;
		
		// Gone off this edit tool
		if(_editor.tool != 'select') {
			if(this._isHoverPointCursor) {
				this.canvas.style.cursor = 'default';
				this._isHoverPointCursor = false;
			}
			if(this.selectedPoints.length > 0)
				this.selectedPoints = [];
		}
	}
	render() {
		if(_editor.mode != '2D') return;
		if(_editor.tool != 'select') return;
		
		const ctx = this.ctx;
		if(!ctx) return;
		
		const objs = this.selectedObjects;
		if(objs.length === 0) return;

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);

		// alignment guides overlay (canvas space)
		this._renderAlignGuides(ctx);

		// points
		for (const obj of objs) {
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if(paths.length === 0) continue;

			const world = U.worldDOMMatrix(obj);
			const screen = U.viewMatrix(this.d2drenderer).multiply(world);

			for (let pidx = 0; pidx < paths.length; pidx++) {
				const path = paths[pidx] || [];
				if(path.length === 0) continue;

				const logical = U.logicalPoints(path);
				for (let li = 0; li < logical.length; li++) {
					const p = logical[li];
					const sp = U.applyDOM(screen, p.x, p.y);

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
		if(!this._activeAlign) return;
		this._activeAlign.ttl = (this._activeAlign.ttl || 0) - 1;
		if(this._activeAlign.ttl < 0) { this._activeAlign = null; return; }

		const w = this.canvas.width, h = this.canvas.height;
		ctx.save();
		ctx.setTransform(1,0,0,1,0,0);
		ctx.lineWidth = 1;
		ctx.strokeStyle = '#37e3ff88';

		if(Number.isFinite(this._activeAlign.v)) {
			ctx.beginPath(); ctx.moveTo(this._activeAlign.v, 0); ctx.lineTo(this._activeAlign.v, h); ctx.stroke();
		}
		if(Number.isFinite(this._activeAlign.h)) {
			ctx.beginPath(); ctx.moveTo(0, this._activeAlign.h); ctx.lineTo(w, this._activeAlign.h); ctx.stroke();
		}
		ctx.restore();
	}

	/* ============================== mouse (points editing) ============================== */

	_onWindowMouseDown(e) {
		if (
			_editor.game2dRef.current && 
			!_editor.game2dRef.current.contains(e.target)
		) {
			this.selectedPoints = [];
		}
	}
	
	_onMouseDown(e) {
		if(_editor.mode != '2D') return;
		if(_editor.tool != 'select') return;
		
		const drawer = this.d2drenderer?.drawer;
		drawer._rebuildSnapCache();
	
		// Alt+click inserts
		if(e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
			this._onAltInsert(e);
			e.preventDefault();
			return;
		}
	
		const hit = this._pickPoint(e);
		let curveHit = null;
		
		if (!hit) {
			// No point hit → try edge for curve editing
			curveHit = this._pickEdge(e);
			if (!curveHit) {
				this._endDrag(false);
				return;
			}
		}
		
		// ----------------- CURVE EDGE DRAG -----------------
		if (curveHit) {
			const { obj, pidx, liA, liB } = curveHit;
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if (!paths.length) return;
		
			const path = paths[pidx] || [];
			if (path.length < 2) return;
		
			// logical view + closed/open info
			const logical = U.logicalPoints(path);
			if (!logical || logical.length < 2) return;
		
			const closed      = U.isClosedPoints(path);
			const logicalLen  = logical.length;
		
			// normalise logical indices
			let ia = liA | 0;
			let ib = liB | 0;
		
			if (ia < 0 || ia >= logicalLen) return;
		
			if (ib < 0 || ib >= logicalLen) {
				if (closed) {
					ib = (ia + 1) % logicalLen;
				} else {
					// open path: use next logical if it exists
					if (ia + 1 < logicalLen) ib = ia + 1;
					else return;
				}
			}
		
			const aL = logical[ia];
			const bL = logical[ib];
			if (!aL || !bL) return;
		
			// midpoint of the chord (used as default when creating a new curve)
			const mid = {
				x: (aL.x + bL.x) * 0.5,
				y: (aL.y + bL.y) * 0.5
			};
		
			// control point lives on destination logical (ib)
			const rawIdxsDest = U.logicalIndexMap(path, ib);
		
			let baseCX = mid.x;
			let baseCY = mid.y;
			let hasCtrl = false;
		
			if (rawIdxsDest.length) {
				const p0 = path[rawIdxsDest[0]];
				if (Number.isFinite(p0.cx) && Number.isFinite(p0.cy)) {
					baseCX = p0.cx;
					baseCY = p0.cy;
					hasCtrl = true; // editing existing curve
				}
			}
		
			// matrices + mouse in canvas space
			const world  = U.worldDOMMatrix(obj);
			const screen = U.viewMatrix(this.d2drenderer).multiply(world);
			const inv    = screen.inverse();
		
			const m           = U.mouseToCanvas(this.canvas, e);
			const cursorLocal = U.applyDOM(inv, m.x, m.y);
		
			// ----- find param t along this curve closest to the click -----
			let hitT = 0.5;
		
			if (hasCtrl) {
				// existing curve: search along quadratic using current control
				const steps = 32;
				let bestD2  = Infinity;
				let bestT   = 0.5;
		
				for (let s = 0; s <= steps; s++) {
					const t   = s / steps;
					const omt = 1 - t;
		
					const lx = omt * omt * aL.x + 2 * omt * t * baseCX + t * t * bL.x;
					const ly = omt * omt * aL.y + 2 * omt * t * baseCY + t * t * bL.y;
		
					const sp = U.applyDOM(screen, lx, ly); // curve point in canvas
					const dx = sp.x - m.x;
					const dy = sp.y - m.y;
					const d2 = dx * dx + dy * dy;
		
					if (d2 < bestD2) {
						bestD2 = d2;
						bestT  = t;
					}
				}
				hitT = bestT;
			} else {
				// no existing control: new curve, just pull from middle
				hitT = 0.5;
			}
		
			this.dragging   = true;
			this.dragObj    = obj;
			this.grabPath   = pidx;
			this.grabLIndex = null;
			this.grabLocal  = { x: cursorLocal.x, y: cursorLocal.y };
			this.lastLocal  = { x: cursorLocal.x, y: cursorLocal.y };
			this.hasMoved   = false;
		
			this._curveDrag = {
				active: true,
				obj,
				pidx,
				liA: ia,
				liB: ib,
				rawIdxsDest,
				base:      { cx: baseCX, cy: baseCY }, // original control
				baseMouse: { x: cursorLocal.x, y: cursorLocal.y },
				hasCtrl,
				t: hitT // param of picked point along curve
			};
		
			this._curveSnapshotBefore = U.clonePaths(obj.graphic2d._paths);
			this._curveSnapshotAfter  = null;
		
			// kill other drag meta for this interaction
			this._textDrag     = null;
			this._scaleMeta    = null;
			this.undoSnapshot  = null;
			this.redoSnapshot  = null;
		
			this.canvas.style.cursor = 'grabbing';
			e.preventDefault();
			return;
		}
		
		// ----------------- NORMAL POINT DRAG -----------------
		if (!hit) {
			this._endDrag(false);
			return;
		}
		
		const mod = (e.metaKey || e.ctrlKey);
		const add = e.shiftKey && !this.dragging; // still allows shift-add on mousedown
		
		if (add) {
			// Shift: add to selection
			if (!this._isSelected(hit.obj, hit.pidx, hit.lindex))
				this.selectedPoints.push(hit);
		
		} else if (mod) {
			// Ctrl/Cmd: toggle
			if (this._isSelected(hit.obj, hit.pidx, hit.lindex))
				this._removeSelected(hit.obj, hit.pidx, hit.lindex);
			else
				this.selectedPoints.push(hit);
		
		} else {
			// Plain click:
			// - if we clicked an already selected point, KEEP full selection
			// - if not, replace selection with just this point
			if (!this._isSelected(hit.obj, hit.pidx, hit.lindex)) {
				this.selectedPoints = [hit];
			}
		}
	
		// local cursor in dragged object's space
		const world = U.worldDOMMatrix(hit.obj);
		const screen = U.viewMatrix(this.d2drenderer).multiply(world);
		const inv = screen.inverse();
	
		const m = U.mouseToCanvas(this.canvas, e);
		const cursorLocal = U.applyDOM(inv, m.x, m.y);
	
		this.dragging  = true;
		this.dragObj   = hit.obj;
		this.grabPath  = hit.pidx;
		this.grabLIndex= hit.lindex;
		this.grabLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.lastLocal = { x: cursorLocal.x, y: cursorLocal.y };
		this.hasMoved  = false;
	
		this._beginSnapSession(hit.obj?.parent);
	
		// Decide whether to use rect-edge mode (Text2D/Bitmap2D) or standard/scale point move
		if(U.isRectLike2D(this.dragObj)) {
			this._textDrag = U.buildTextDragMeta(this.dragObj, this.grabPath, this.grabLIndex);
			this._pathSnapshotBefore = U.clonePaths(this.dragObj.graphic2d._paths);
			this._pathSnapshotAfter  = null;
			this.undoSnapshot = null; this.redoSnapshot = null;
			this._scaleMeta = null;
		} else {
			this._textDrag = null;
			// Base snapshot for normal point moves (selected points)
			this.undoSnapshot = U.snapshotPointsFor(this.dragObj, this._selectedLogicalByPathFor(this.dragObj));
			this.redoSnapshot = null;
			this._pathSnapshotBefore = null; this._pathSnapshotAfter = null;
			this._scaleMeta = null; // lazy-init ifAlt/Shift held during drag
		}
	
		this.canvas.style.cursor = 'grabbing';
		e.preventDefault();
	}

	_onMouseMove(e) {
		if(_editor.mode != '2D') return;
		if(_editor.tool != 'select') return;
		
		if(this.dragging && this.dragObj) {
			const obj = this.dragObj;
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if(paths.length === 0) return;

			const world = U.worldDOMMatrix(obj);
			const screen = U.viewMatrix(this.d2drenderer).multiply(world);
			const inv = screen.inverse();

			const m = U.mouseToCanvas(this.canvas, e);
			let targetLocal = U.applyDOM(inv, m.x, m.y);

			// snapping to other geometry via drawer (host-local snapping)
			const drawer = this.d2drenderer?.drawer;
			const snappingOn = !!_editor.draw2d?.snapToPoints && !!drawer;
			if(snappingOn) {
				if(!this._snapSession) this._beginSnapSession();
				if(!drawer._snapCache || drawer._lastFocus !== _editor.focus) {
					drawer._rebuildSnapCache();
				}
				const hit = drawer._snap?.(m);
				if(hit) drawer._snapHit = hit;

				if(hit?.hostLocal) {
					const hostNode = this._snapSession?.hostNode || null;
					const conv = U.hostToChildLocal(hostNode, obj, hit.hostLocal);
					targetLocal = { x: conv.x, y: conv.y };
				}
			}

			// Rect-like: move edges
			if(this._textDrag?.active) {
				const pidx = this._textDrag.pidx;
				const path = paths[pidx] || [];
				if(path.length) {
					const { moveXIdx, moveYIdx, wasClosed } = this._textDrag;
					for (const i of moveXIdx) if(path[i]) path[i].x = targetLocal.x;
					for (const i of moveYIdx) if(path[i]) path[i].y = targetLocal.y;

					if(wasClosed && path.length >= 2) {
						const a = path[0], b = path[path.length - 1];
						if(!U.approx(a.x, b.x) || !U.approx(a.y, b.y)) {
							path[path.length - 1] = { x: a.x, y: a.y };
						}
					}
					this.hasMoved = true;
					this.lastLocal = targetLocal;
				}
				this.canvas.style.cursor = 'grabbing';
				e.preventDefault();
				return;
			}
			
			// Curve drag (edge editing – move control point only)
			if (this._curveDrag?.active) {
				const cd   = this._curveDrag;
				const obj  = cd.obj;
				const g2d  = obj?.graphic2d;
				const paths = Array.isArray(g2d?._paths) ? g2d._paths : [];
				if (!paths.length) return;
			
				const path = paths[cd.pidx] || [];
				if (!path.length) return;
			
				// logical anchors in *local* space
				const logical = U.logicalPoints(path);
				const aL = logical[cd.liA];
				const bL = logical[cd.liB];
				if (!aL || !bL) return;
			
				const t   = cd.t;          // fixed param along the curve we clicked
				const omt = 1 - t;
				const kA  = omt * omt;     // (1 - t)^2
				const kB  = t * t;         // t^2
				const denom = 2 * omt * t; // 2(1 - t)t
			
				if (denom <= 1e-6) return;
			
				const Cx = targetLocal.x;
				const Cy = targetLocal.y;
			
				// Solve for control P so that B(t) == cursorLocal:
				// C = (1-t)^2 A + 2(1-t)t P + t^2 B
				// => P = (C - (1-t)^2 A - t^2 B) / (2(1-t)t)
				const cx = (Cx - kA * aL.x - kB * bL.x) / denom;
				const cy = (Cy - kA * aL.y - kB * bL.y) / denom;
			
				for (const ri of cd.rawIdxsDest) {
					const p = path[ri];
					if (!p) continue;
					p.cx = cx;
					p.cy = cy;
				}
			
				this.hasMoved  = true;
				this.lastLocal = targetLocal;
				this.canvas.style.cursor = 'grabbing';
				e.preventDefault();
				return;
			}

			let wantIso  = !!e.spaceKey;
			let wantFree = !!e.shiftKey && !wantIso;
			
			if((wantIso || wantFree) && !this._scaleMeta?.active) {
				this._initScaleMeta(obj, targetLocal, wantIso ? 'iso' : 'free');
			}
			if(this._scaleMeta?.active) {
				if(this._scaleMeta.mode === 'iso' && wantIso) {
					this._applyScale_ISO(obj, targetLocal);
					this.hasMoved = true;
					this.lastLocal = targetLocal;
					this.canvas.style.cursor = 'grabbing';
					e.preventDefault();
					return;
				} else if(this._scaleMeta.mode === 'free' && wantFree) {
					this._applyScale_FREE(obj, targetLocal);
					this.hasMoved = true;
					this.lastLocal = targetLocal;
					this.canvas.style.cursor = 'grabbing';
					e.preventDefault();
					return;
				}
				// modifier released mid-drag -> fall through to normal move
			}

			// Normal move (translate) of selected logicals
			const dx = targetLocal.x - this.lastLocal.x;
			const dy = targetLocal.y - this.lastLocal.y;
			if(dx !== 0 || dy !== 0) {
				this.hasMoved = true;
				const byPath = this._selectedLogicalByPathFor(obj);
				for (const [pidx, lis] of byPath.entries()) {
					const path = paths[pidx] || [];
					for (const li of lis) {
						const map = U.logicalIndexMap(path, li);
						for (const pi of map) {
							path[pi].x += dx;
							path[pi].y += dy;
						}
					}
				}
				this.lastLocal = targetLocal;
			}

			this.canvas.style.cursor = 'grabbing';
			e.preventDefault();
			return;
		}

		const hitPoint = this._pickPoint(e);
		this.hoverPoint = hitPoint ? { obj: hitPoint.obj, pidx: hitPoint.pidx, lindex: hitPoint.lindex } : null;
		
		// Only try edges if we're NOT on a point
		if (!this.hoverPoint) {
			const hitEdge = this._pickEdge(e);
			this.hoverEdge = hitEdge ? hitEdge : null;
		} else {
			this.hoverEdge = null;
		}
		
		if (_editor.tool != 'pan') {
			if (this.hoverPoint || this.hoverEdge) {
				this.canvas.style.cursor = 'pointer';
				this._isHoverPointCursor = true;
			}else
				this.canvas.style.cursor = 'default';
		}
	}

	_onMouseUp() { this._endDrag(true); }
	_onBlur()    { this._endDrag(false); }

	_endDrag(commit) {
		// No normal drag, return.
		if(!this.dragging) 
			return;
		
		const drawer = this.d2drenderer?.drawer;

		this.dragging = false;
		
		if(_editor.tool != 'pan')
			this.canvas.style.cursor = 'default';

		if (commit && this.hasMoved && this.dragObj) {
			const obj = this.dragObj;
		
			if (this._curveDrag?.active && this._curveSnapshotBefore) {
				// if control is almost on the straight line, drop the curve
				this._maybeStraightenCurve(this._curveDrag);
			
				const before = this._curveSnapshotBefore;
				const after  = U.clonePaths(obj.graphic2d._paths);
				_editor.addStep?.({
					name: 'Edit 2D Curve',
					undo: () => { obj.graphic2d._paths = U.clonePaths(before); obj.checkSymbols?.(); },
					redo: () => { obj.graphic2d._paths = U.clonePaths(after);  obj.checkSymbols?.(); }
				});
				obj.checkSymbols?.();
			} else if (this._textDrag?.active) {
				this._pathSnapshotAfter = U.clonePaths(obj.graphic2d._paths);
				const before = this._pathSnapshotBefore;
				const after  = this._pathSnapshotAfter;
				if(before && after) {
					_editor.addStep?.({
						name: 'Edit Text Rect',
						undo: () => { obj.graphic2d._paths = U.clonePaths(before); obj.checkSymbols?.(); },
						redo: () => { obj.graphic2d._paths = U.clonePaths(after);  obj.checkSymbols?.(); }
					});
				}
			} else if (this._scaleMeta?.active && this._scaleMeta?.undoSnapshot) {
				const before = this._scaleMeta.undoSnapshot;
				const after  = U.snapshotPointsFor(obj, this._scaleMeta.affected);
				const name = (this._scaleMeta.mode === 'iso')
					? 'Uniform Scale 2D Points'
					: 'Free Scale 2D Points';
				_editor.addStep?.({
					name,
					undo: () => U.applyPointsSnapshot(obj, before),
					redo: () => U.applyPointsSnapshot(obj, after)
				});
				obj.checkSymbols?.();
			} else if (this.undoSnapshot) {
				this._maybeAutoCloseOnEnd(obj);
				this.redoSnapshot = U.snapshotPointsFor(obj, this._selectedLogicalByPathFor(obj));
				const before = this.undoSnapshot;
				const after  = this.redoSnapshot;
				_editor.addStep?.({
					name: 'Edit 2D Points',
					undo: () => U.applyPointsSnapshot(obj, before),
					redo: () => U.applyPointsSnapshot(obj, after)
				});
				obj.checkSymbols?.();
			}
		}

		this._endSnapSession();
		drawer?._rebuildSnapCache?.();
		
		this.dragObj   = null;
		this.grabPath  = null;
		this.grabLIndex= null;
		this.grabLocal = null;
		this.lastLocal = null;
		this.hasMoved  = false;
		
		this.undoSnapshot          = null;
		this.redoSnapshot          = null;
		this._pathSnapshotBefore   = null;
		this._pathSnapshotAfter    = null;
		this._textDrag             = null;
		this._scaleMeta            = null;
		this._curveDrag            = null;
		this._curveSnapshotBefore  = null;
		this._curveSnapshotAfter   = null;
	}

	/* ============================== keyboard (objects only) ============================== */
	
	_onKeyDown(e) {
		if (_editor.mode !== '2D') return;
		if (!(_editor.tool === 'select' || _editor.tool === 'transform')) return;
	
		// Arrow → base delta in world units
		let dx = 0, dy = 0;
		switch (e.key) {
			case 'ArrowLeft':  dx = -1; break;
			case 'ArrowRight': dx =  1; break;
			case 'ArrowUp':    dy = -1; break; // canvas Y up is negative
			case 'ArrowDown':  dy =  1; break;
			default: return;
		}
	
		const step = e.shiftKey ? 25 : 1;
		dx *= step;
		dy *= step;
	
		e.preventDefault();
	
		const objsArr = this.selectedObjects;
		if (!objsArr.length) return;
	
		// de-dupe selection
		const objs = Array.from(new Set(objsArr));
	
		// record BEFORE positions
		const before = objs.map(obj => ({
			obj,
			pos: {
				x: obj.position?.x || 0,
				y: obj.position?.y || 0,
				z: obj.position?.z || 0
			}
		}));
	
		// apply movement (no snapping)
		for (const o of objs) {
			if (!o.position) o.position = { x: 0, y: 0, z: 0 };
			o.position.x = (o.position.x || 0) + dx;
			o.position.y = (o.position.y || 0) + dy;
		}
	
		// record AFTER positions
		const after = objs.map(obj => ({
			obj,
			pos: {
				x: obj.position?.x || 0,
				y: obj.position?.y || 0,
				z: obj.position?.z || 0
			}
		}));
	
		// no snap guides for keyboard nudges
		this._activeAlign = null;
	
		// re-render
		_editor.requestRender?.() || this.d2drenderer?.render?.();
	
		// history
		_editor.addStep?.({
			name: 'Nudge Object(s)',
			undo: () => {
				for (const s of before) {
					s.obj.position.x = s.pos.x;
					s.obj.position.y = s.pos.y;
					s.obj.position.z = s.pos.z;
				}
				_editor.requestRender?.() || this.d2drenderer?.render?.();
			},
			redo: () => {
				for (const s of after) {
					s.obj.position.x = s.pos.x;
					s.obj.position.y = s.pos.y;
					s.obj.position.z = s.pos.z;
				}
				_editor.requestRender?.() || this.d2drenderer?.render?.();
			}
		});
	}

	/* ============================== insert vertex (Alt+Click) ============================== */

	_onAltInsert(e) {
		const objs = this.selectedObjects;
		if(objs.length === 0) return;

		const mouse = U.mouseToCanvas(this.canvas, e);

		let best = null;

		for (const obj of objs) {
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if(paths.length === 0) continue;
			if(U.isRectLike2D(obj)) continue;

			const world = U.worldDOMMatrix(obj);
			const screen = U.viewMatrix(this.d2drenderer).multiply(world);
			const inv = screen.inverse();
			const local = U.applyDOM(inv, mouse.x, mouse.y);

			for (let pidx = 0; pidx < paths.length; pidx++) {
				const path = paths[pidx] || [];
				if(path.length < 2) continue;

				const logical = U.logicalPoints(path);
				const closed = U.isClosedPoints(path);
				const segCount = closed ? logical.length : Math.max(0, logical.length - 1);

				for (let i = 0; i < segCount; i++) {
					const a = logical[i];
					const b = logical[(i + 1) % logical.length];
					const { d2, t } = U.pointSegDist2(local, a, b);
					if(best == null || d2 < best.d2) {
						best = { obj, pidx, local, liA: i, t, d2, closed, logicalLen: logical.length };
					}
				}
			}
		}

		if(!best) return;

		const { obj, pidx, local, liA, closed, logicalLen } = best;
		const paths = obj.graphic2d._paths;
		const path = paths[pidx];

		const before = U.clonePaths(paths);

		const insertAt = (closed && liA === logicalLen - 1) ? (path.length - 1) : (liA + 1);
		path.splice(insertAt, 0, { x: local.x, y: local.y });

		if(closed) {
			const a = path[0], b = path[path.length - 1];
			if(!U.approx(a.x, b.x) || !U.approx(a.y, b.y)) {
				path[path.length - 1] = { x: a.x, y: a.y };
			}
		}

		const after = U.clonePaths(paths);

		_editor.addStep?.({
			name: 'Insert 2D Point',
			undo: () => { obj.graphic2d._paths = U.clonePaths(before); },
			redo: () => { obj.graphic2d._paths = U.clonePaths(after); }
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
		this.undoSnapshot = U.snapshotPointsFor(this.dragObj, this._selectedLogicalByPathFor(this.dragObj));
		this.redoSnapshot = null;

		this.canvas.style.cursor = 'grabbing';
	}

	/* ============================== delete selected vertices ============================== */

	_onDelete() {
		const drawer = this.d2drenderer?.drawer;

		const doDelete = () => {
			if(this.selectedPoints.length < 1) return;

			// obj -> Map(pidx -> Set(lindex))
			const byObjPath = new Map();
			for (const sp of this.selectedPoints) {
				if(!sp?.obj?.graphic2d?._paths) continue;
				if(!byObjPath.has(sp.obj)) byObjPath.set(sp.obj, new Map());
				const pm = byObjPath.get(sp.obj);
				if(!pm.has(sp.pidx)) pm.set(sp.pidx, new Set());
				pm.get(sp.pidx).add(sp.lindex);
			}
			if(byObjPath.size === 0) return;

			const before = [];
			for (const [obj] of byObjPath) before.push({ obj, paths: U.clonePaths(obj.graphic2d._paths) });

			for (const [obj, pmap] of byObjPath) {
				const paths = obj.graphic2d._paths;
				for (const [pidx, lset] of pmap) {
					const path = paths[pidx] || [];
					if(path.length === 0) continue;

					const wasClosed = U.isClosedPoints(path);

					const toRemove = new Set();
					for (const li of lset) {
						const map = U.logicalIndexMap(path, li);
						for (const pi of map) toRemove.add(pi);
					}

					const sorted = Array.from(toRemove).sort((a, b) => b - a);
					for (const idx of sorted) {
						if(idx >= 0 && idx < path.length) path.splice(idx, 1);
					}

					if(wasClosed && path.length >= 2) {
						const a = path[0], b = path[path.length - 1];
						if(!U.approx(a.x, b.x) || !U.approx(a.y, b.y)) {
							path.push({ x: a.x, y: a.y });
						}
					}
				}
			}

			const after = [];
			for (const [obj] of byObjPath) after.push({ obj, paths: U.clonePaths(obj.graphic2d._paths) });

			this.selectedPoints = [];
			drawer?._rebuildSnapCache?.();

			_editor.addStep?.({
				name: 'Delete 2D Points',
				undo: () => {
					for (const s of before) s.obj.graphic2d._paths = U.clonePaths(s.paths);
					drawer?._rebuildSnapCache?.();
				},
				redo: () => {
					for (const s of after)  s.obj.graphic2d._paths = U.clonePaths(s.paths);
					drawer?._rebuildSnapCache?.();
				}
			});
		};
		setTimeout(doDelete, 10);
	}

	/* ============================== picking & selection helpers ============================== */

	_pickPoint(e) {
		const mouse = U.mouseToCanvas(this.canvas, e);
		const objs = this.selectedObjects;
		if(objs.length === 0) return null;

		let best = null;
		let bestD2 = Infinity;

		for (const obj of objs) {
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if(paths.length === 0) continue;

			const world = U.worldDOMMatrix(obj);
			const screen = U.viewMatrix(this.d2drenderer).multiply(world);

			for (let pidx = 0; pidx < paths.length; pidx++) {
				const path = paths[pidx] || [];
				if(path.length === 0) continue;

				const logical = U.logicalPoints(path);
				for (let li = 0; li < logical.length; li++) {
					const p = logical[li];
					const sp = U.applyDOM(screen, p.x, p.y);
					const dx = sp.x - mouse.x;
					const dy = sp.y - mouse.y;
					const d2 = dx * dx + dy * dy;

					if(d2 <= this.hitRadius * this.hitRadius && d2 < bestD2) {
						bestD2 = d2;
						best = { obj, pidx, lindex: li };
					}
				}
			}
		}
		return best;
	}
	
	_pickEdge(e) {
		const mouse = U.mouseToCanvas(this.canvas, e);
		const objs  = this.selectedObjects;
		if (!objs.length) return null;
	
		const edgeHitRadius = this.edgeHitRadius ?? 8;          // px
		const pointBuffer   = this.edgePointBuffer ?? (this.hitRadius + 2);
		const edgeR2  = edgeHitRadius * edgeHitRadius;
		const pointR2 = pointBuffer   * pointBuffer;
	
		let best   = null;
		let bestD2 = Infinity;
	
		// distance from mouse to segment in SCREEN space
		const segDist2Screen = (mx, my, ax, ay, bx, by) => {
			const vx = bx - ax, vy = by - ay;
			const wx = mx - ax, wy = my - ay;
			const denom = vx * vx + vy * vy;
			let t = denom > 0 ? (wx * vx + wy * vy) / denom : 0;
			if (t < 0) t = 0;
			if (t > 1) t = 1;
			const px = ax + t * vx;
			const py = ay + t * vy;
			const dx = mx - px;
			const dy = my - py;
			return dx * dx + dy * dy;
		};
	
		for (const obj of objs) {
			if (U.isRectLike2D(obj)) continue;
			
			const g = obj?.graphic2d;
			const paths = Array.isArray(g?._paths) ? g._paths : [];
			if (!paths.length) continue;
	
			const world  = U.worldDOMMatrix(obj);
			const screen = U.viewMatrix(this.d2drenderer).multiply(world);
	
			for (let pidx = 0; pidx < paths.length; pidx++) {
				const path = paths[pidx] || [];
				if (path.length < 2) continue;
	
				const logical = U.logicalPoints(path);
				if (logical.length < 2) continue;
	
				const closed   = U.isClosedPoints(path);
				const segCount = closed ? logical.length : (logical.length - 1);
	
				for (let li = 0; li < segCount; li++) {
					const liA = li;
					const liB = closed
						? (li + 1) % logical.length
						: (li + 1);
	
					if (liB >= logical.length) continue;
	
					const aL = logical[liA];
					const bL = logical[liB];
					if (!aL || !bL) continue;
	
					// screen endpoints (for endpoint buffer & straight fallback)
					const sa = U.applyDOM(screen, aL.x, aL.y);
					const sb = U.applyDOM(screen, bL.x, bL.y);
	
					// keep a "point only" buffer around endpoints so point picking wins there
					const dax = mouse.x - sa.x;
					const day = mouse.y - sa.y;
					const dbx = mouse.x - sb.x;
					const dby = mouse.y - sb.y;
					const d2a = dax * dax + day * day;
					const d2b = dbx * dbx + dby * dby;
	
					if (d2a < pointR2 || d2b < pointR2)
						continue;
	
					// ----- detect if this segment is actually curved -----
					const rawDestIdxs = U.logicalIndexMap(path, liB);
	
					let ctrl = null;
					for (const ri of rawDestIdxs) {
						const p = path[ri];
						if (p && Number.isFinite(p.cx) && Number.isFinite(p.cy)) {
							ctrl = p;
							break;
						}
					}
	
					let segBestD2 = Infinity;
	
					if (ctrl) {
						// CURVED: sample the quadratic in LOCAL space and measure in SCREEN space
						const steps = 16;
						const x0 = aL.x, y0 = aL.y;
						const x1 = bL.x, y1 = bL.y;
						const cx = +ctrl.cx || 0;
						const cy = +ctrl.cy || 0;
	
						let prev = U.applyDOM(screen, x0, y0);
	
						for (let s = 1; s <= steps; s++) {
							const t   = s / steps;
							const omt = 1 - t;
	
							// quadratic point with control at DEST logical
							const lx = omt * omt * x0 + 2 * omt * t * cx + t * t * x1;
							const ly = omt * omt * y0 + 2 * omt * t * cy + t * t * y1;
	
							const cur = U.applyDOM(screen, lx, ly);
							const d2  = segDist2Screen(mouse.x, mouse.y, prev.x, prev.y, cur.x, cur.y);
							if (d2 < segBestD2) segBestD2 = d2;
							prev = cur;
						}
					} else {
						// STRAIGHT: distance to chord in SCREEN space
						segBestD2 = segDist2Screen(mouse.x, mouse.y, sa.x, sa.y, sb.x, sb.y);
					}
	
					if (segBestD2 <= edgeR2 && segBestD2 < bestD2) {
						bestD2 = segBestD2;
						// IMPORTANT: this matches what _onMouseDown expects
						best = { obj, pidx, liA, liB };
					}
				}
			}
		}
		return best;
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
			if(sp.obj !== obj) continue;
			if(!map.has(sp.pidx)) map.set(sp.pidx, []);
			map.get(sp.pidx).push(sp.lindex);
		}
		if(map.size === 0 && this.grabPath != null && this.grabLIndex != null) {
			map.set(this.grabPath, [this.grabLIndex]);
		}
		return map;
	}
	
	_maybeAutoCloseOnEnd(obj) {
		if(!obj || this.grabPath == null || this.grabLIndex == null) return false;
	
		const paths = obj?.graphic2d?._paths || [];
		const path  = paths[this.grabPath] || [];
		if(path.length < 2) return false;
	
		// already closed?
		const a = path[0], b = path[path.length - 1];
		if(U.approx(a.x, b.x) && U.approx(a.y, b.y)) return false;
	
		// only when grabbed logical is first or last
		const logical = U.logicalPoints(path);
		const li = this.grabLIndex;
		if(li < 0 || li >= logical.length) return false;
		const isFirst = (li === 0);
		const isLast  = (li === logical.length - 1);
		if(!isFirst && !isLast) return false;
	
		// distance in canvas space
		const world  = U.worldDOMMatrix(obj);
		const screen = U.viewMatrix(this.d2drenderer).multiply(world);
		const A = U.applyDOM(screen, a.x, a.y);
		const B = U.applyDOM(screen, b.x, b.y);
		const dx = A.x - B.x, dy = A.y - B.y;
		const d2 = dx*dx + dy*dy;
	
		const px = Math.max(4, Number(_editor.draw2d?.snapPx || 10));
		if(d2 > px*px) return false;
	
		// snap closed: copy coords rather than replacing objects (keeps refs stable)
		if(isFirst) { path[0].x = b.x; path[0].y = b.y; }
		else         { path[path.length - 1].x = a.x; path[path.length - 1].y = a.y; }
	
		return true;
	}

	/* ============================== snapping session (local to this class) ============================== */

	_beginSnapSession() {
		this._snapSession = { hostNode: _editor.focus };
	}
	_endSnapSession() {
		this._snapSession = null;
	}

	/* ============================== SCALE (Alt = iso, Shift = axis) ============================== */

	_initScaleMeta(obj, targetLocal, mode /* 'iso'|'free' */) {
		if(!obj || this.grabPath == null || this.grabLIndex == null) return;
	
		const g = obj?.graphic2d;
		const paths = Array.isArray(g?._paths) ? g._paths : [];
		if(paths.length === 0) return;
	
		// Determine affected logical indices
		const selected = this._selectedLogicalByPathFor(obj);
		let affected = new Map(selected);
		let onlyGrabSelected = false;
	
		if(affected.size === 0) {
			onlyGrabSelected = true;
		} else if(affected.size === 1) {
			const arr = affected.get(this.grabPath) || [];
			if(arr.length === 1 && arr[0] === this.grabLIndex) onlyGrabSelected = true;
		}
	
		if(onlyGrabSelected) {
			// use entire logical range of the grabbed path
			const path = paths[this.grabPath] || [];
			const logical = U.logicalPoints(path);
			affected = new Map([[this.grabPath, Array.from({length: logical.length}, (_,i)=>i)]]);
		}
	
		// Bounds + grabbed point (local)
		let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
		let grabbed0 = null;
	
		for (const [pidx, lis] of affected.entries()) {
			const path = paths[pidx] || [];
			const logical = U.logicalPoints(path);
			for (const li of lis) {
				const p = logical[li];
				minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
				maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y);
				if(pidx === this.grabPath && li === this.grabLIndex) grabbed0 = { x: p.x, y: p.y };
			}
		}
		if(!Number.isFinite(minx) || !grabbed0) return;
	
		const cx = (minx + maxx) * 0.5;
		const cy = (miny + maxy) * 0.5;
	
		// Opposite corner to the grabbed point (fallback center)
		let pivot = {
			x: (grabbed0.x < cx) ? maxx : minx,
			y: (grabbed0.y < cy) ? maxy : miny
		};
		if(!Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) {
			pivot = { x: cx, y: cy };
		}
	
		// Base per-affected logical
		const base = new Map(); // pidx -> [{li, rawIdxs:int[], p0:{x,y}}...]
		for (const [pidx, lis] of affected.entries()) {
			const path = paths[pidx] || [];
			const logical = U.logicalPoints(path);
			const list = [];
			for (const li of lis) {
				const p = logical[li];
				const rawIdxs = U.logicalIndexMap(path, li);
				list.push({ li, rawIdxs, p0: { x: p.x, y: p.y } });
			}
			base.set(pidx, list);
		}
	
		const affectedSets = new Map(
			Array.from(affected.entries()).map(([pidx, arr]) => [pidx, new Set(arr)])
		);
		const undoSnapshot = U.snapshotPointsFor(obj, affectedSets);
	
		this._scaleMeta = {
			active: true,
			mode,           // 'iso' | 'free'
			pivot,
			grab0: grabbed0,
			affected: affectedSets,
			base,
			undoSnapshot
		};
	}
	
	_applyScale_ISO(obj, currentLocal) {
		const u = this._scaleMeta;
		if(!u?.active || u.mode !== 'iso') return;
	
		const v0x = u.grab0.x - u.pivot.x;
		const v0y = u.grab0.y - u.pivot.y;
		const v1x = currentLocal.x - u.pivot.x;
		const v1y = currentLocal.y - u.pivot.y;
	
		const len0 = Math.hypot(v0x, v0y);
		const len1 = Math.hypot(v1x, v1y);
	
		let s = (len0 > 1e-6) ? (len1 / len0) : 1.0;
		if(!Number.isFinite(s)) s = 1.0;
		if(s < 0) s = Math.abs(s);
	
		this._applyScaleWithFactors(obj, s, s);
	}
	
	_applyScale_FREE(obj, currentLocal) {
		const u = this._scaleMeta;
		if(!u?.active || u.mode !== 'free') return;
	
		// Independent sx, sy based on pivot-to-grab vs pivot-to-current
		let sx = 1.0, sy = 1.0;
	
		const denomX = (u.grab0.x - u.pivot.x);
		const denomY = (u.grab0.y - u.pivot.y);
	
		if(Math.abs(denomX) > 1e-6) {
			sx = (currentLocal.x - u.pivot.x) / denomX;
		}
		if(Math.abs(denomY) > 1e-6) {
			sy = (currentLocal.y - u.pivot.y) / denomY;
		}
	
		if(!Number.isFinite(sx)) sx = 1.0;
		if(!Number.isFinite(sy)) sy = 1.0;
	
		// avoid accidental negative flips
		if(sx < 0) sx = Math.abs(sx);
		if(sy < 0) sy = Math.abs(sy);
	
		this._applyScaleWithFactors(obj, sx, sy);
	}
	
	_applyScaleWithFactors(obj, sx, sy) {
		const u = this._scaleMeta;
		if(!u?.active) return;
	
		const g = obj?.graphic2d;
		const paths = Array.isArray(g?._paths) ? g._paths : [];
		if(paths.length === 0) return;
	
		for (const [pidx, items] of u.base.entries()) {
			const path = paths[pidx] || [];
			for (const { rawIdxs, p0 } of items) {
				const dx = p0.x - u.pivot.x;
				const dy = p0.y - u.pivot.y;
				const nx = u.pivot.x + dx * sx;
				const ny = u.pivot.y + dy * sy;
				for (const ri of rawIdxs) {
					if(path[ri]) { path[ri].x = nx; path[ri].y = ny; }
				}
			}
			// Keep closed paths closed
			if(U.isClosedPoints(path) && path.length >= 2) {
				const a = path[0], b = path[path.length - 1];
				if(!U.approx(a.x, b.x) || !U.approx(a.y, b.y)) {
					path[path.length - 1] = { x: a.x, y: a.y };
				}
			}
		}
	}
	
	/* ============================== marquee from gizmo (point selection) ============================== */
	
	marqueeDropped({ worldRect, additive }) {
		if (_editor.mode !== '2D') return;
		if (_editor.tool !== 'select') return;
	
		const selectedObjects = _editor.selectedObjects;
		if (!worldRect || selectedObjects.length < 1) return;
	
		const rect = worldRect;
	
		// ----- 1) normalise rect in WORLD space -----
		let minWX = rect.x;
		let maxWX = rect.x + rect.w;
		let minWY = rect.y;
		let maxWY = rect.y + rect.h;
		if (maxWX < minWX) { const t = minWX; minWX = maxWX; maxWX = t; }
		if (maxWY < minWY) { const t = minWY; minWY = maxWY; maxWY = t; }
	
		// ----- 2) project world rect → CANVAS space (same as points are drawn in) -----
		const Mv = U.viewMatrix(this.d2drenderer); // world → canvas
	
		const c00 = U.applyDOM(Mv, minWX, minWY);
		const c10 = U.applyDOM(Mv, maxWX, minWY);
		const c11 = U.applyDOM(Mv, maxWX, maxWY);
		const c01 = U.applyDOM(Mv, minWX, maxWY);
	
		let cMinX = Math.min(c00.x, c10.x, c11.x, c01.x);
		let cMaxX = Math.max(c00.x, c10.x, c11.x, c01.x);
		let cMinY = Math.min(c00.y, c10.y, c11.y, c01.y);
		let cMaxY = Math.max(c00.y, c10.y, c11.y, c01.y);
	
		const newly = [];
	
		for (const obj of selectedObjects) {
			const g2d = obj.graphic2d;
			if (!g2d) continue;
	
			const paths = Array.isArray(g2d._paths) ? g2d._paths : [];
			if (paths.length < 1) continue;
	
			// local → world → canvas (same as render()/ _pickPoint())
			const world  = U.worldDOMMatrix(obj);
			const screen = U.viewMatrix(this.d2drenderer).multiply(world);
	
			for (let pidx = 0; pidx < paths.length; pidx++) {
				const path = paths[pidx] || [];
				if (path.length === 0) continue;
	
				const logical = U.logicalPoints(path);
				for (let li = 0; li < logical.length; li++) {
					const pL = logical[li];
					const sp = U.applyDOM(screen, pL.x, pL.y); // canvas coords
	
					if (
						sp.x >= cMinX && sp.x <= cMaxX &&
						sp.y >= cMinY && sp.y <= cMaxY
					) {
						let s = this._isSelected(obj, pidx, li);
						
						if (!s) {
							newly.push({ obj, pidx, lindex: li });
						}
					}
				}
			}
		}
		
		const pts = [...this.selectedPoints];
		
		this.runAfterRender = () => {
			if (newly.length < 1) {
				if (!additive)
					this.selectedPoints = [];
				return;
			}
			
			if (!additive) {
				this.selectedPoints = newly;
			} else {
				pts.push(...newly);
				this.selectedPoints = pts;
			}
		}
	}
	
	_maybeStraightenCurve(cd) {
		if (!cd || !cd.obj?.graphic2d?._paths) return;
	
		const paths = cd.obj.graphic2d._paths;
		const path  = paths[cd.pidx] || [];
		if (!path.length) return;
	
		const logical = U.logicalPoints(path);
		const aL = logical[cd.liA];
		const bL = logical[cd.liB];
		if (!aL || !bL) return;
	
		if (!cd.rawIdxsDest || !cd.rawIdxsDest.length) return;
		const p0 = path[cd.rawIdxsDest[0]];
		if (!p0 || !Number.isFinite(p0.cx) || !Number.isFinite(p0.cy)) return;
	
		const cx = p0.cx;
		const cy = p0.cy;
	
		// distance from control to AB (in local space)
		const vx = bL.x - aL.x;
		const vy = bL.y - aL.y;
		const denom = vx*vx + vy*vy;
		if (denom <= 1e-6) return;
	
		const tLine = ((cx - aL.x) * vx + (cy - aL.y) * vy) / denom;
		const projx = aL.x + tLine * vx;
		const projy = aL.y + tLine * vy;
	
		const dx = cx - projx;
		const dy = cy - projy;
	
		// tolerance in world/local units (based on ~4 px)
		const tolWorld = U.pxToWorld(this.d2drenderer, 4);
		if ((dx*dx + dy*dy) > tolWorld * tolWorld) return;
	
		// close enough: drop control and make it truly straight
		for (const ri of cd.rawIdxsDest) {
			const p = path[ri];
			if (!p) continue;
			delete p.cx;
			delete p.cy;
		}
	}

	/* ============================== keyboard movement helpers ============================== */
	
	_onKeyDown = this._onKeyDown.bind(this);
}