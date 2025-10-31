// d2dgizmo.js
import * as U from './d2dutility.js';

export default class D2DGizmo {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;

		this.state = {
			mode: null,            // 'move' | 'rotate' | 'scale' | 'marquee'
			handle: null,          // 'l','r','t','b','tl','tr','br','bl'
			start: { x: 0, y: 0 },
			last:  { x: 0, y: 0 },

			// frozen frame during active transform
			cx: 0, cy: 0, theta: 0,
			theta0: 0, rotBase: 0,

			// scale baseline
			hx0: 1, hy0: 1,        // half extents of OBB in frame
			p0L: { x: 0, y: 0 },   // mouse start (frame local)

			// originals for current selection + undo/redo
			orig: null,            // Map(obj -> { pos0:{x,y}, rot0, scl0:{x,y}, parentInv, begin* })
			stepStart: null,
			stepEnd: null,

			// snapping visuals (screen space)
			alignGuide: { v:null, h:null, ttl:0 },

			// cached selection bounds (screen space) at gesture start
			startSelRectCanvas: null,

			// cached object guides for current gesture
			guides: null           // { xs:number[], ys:number[] }
		};

		this._onDown = this._onDown.bind(this);
		this._onMove = this._onMove.bind(this);
		this._onUp   = this._onUp.bind(this);

		this.canvas.addEventListener('mousedown', this._onDown);
		window.addEventListener('mousemove', this._onMove);
		window.addEventListener('mouseup',   this._onUp);
	}

	dispose() {
		this.canvas.removeEventListener('mousedown', this._onDown);
		window.removeEventListener('mousemove', this._onMove);
		window.removeEventListener('mouseup',   this._onUp);
	}

	/* ========================= RENDER ========================= */

	render() {
		const tool = _editor.tool;
		const ttool = _editor.transformTool; // 'Translate' | 'Rotate' | 'Scale' | 'All'
		const sel = _editor.selectedObjects.filter(o => o?.is2D);
		const showMarquee = this.state.mode === 'marquee';
		if (!sel.length && !showMarquee && (this.state.alignGuide.ttl|0) <= 0) return;

		const ctx = this.ctx;
		ctx.save();

		// 1) screen-space snap guides
		this._renderAlignGuidesScreen(ctx);

		// 2) world overlays
		this.d2drenderer.applyDeviceTransform(ctx);

		// origins
		for (const o of sel) this._drawOriginCross(o);

		// soft selection AABB
		const px = U.pxToWorld(this.d2drenderer, 2);
		ctx.lineWidth = Math.max(px, 1 * px);
		ctx.strokeStyle = 'rgba(30,144,255,1)';

		for (const o of sel) {
			const r = U.worldAABBDeep(o);
			if (!r) continue;
			ctx.strokeRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
		}

		// gizmo
		if (sel.length > 0) {
			let frame = U.selectionFrame(sel);
			if (!frame) { ctx.restore(); return; }
			if (this.state.mode === 'scale' || this.state.mode === 'rotate') {
				frame = { cx: this.state.cx, cy: this.state.cy, theta: this.state.theta };
			}
			const obb = U.selectionOBB(sel, frame);
			if (obb) this._drawGizmo(frame, obb, px, ttool);
		}

		// marquee
		if (showMarquee) {
			const a = this.state.start, b = this.state.last;
			const x = Math.min(a.x, b.x);
			const y = Math.min(a.y, b.y);
			const w = Math.abs(b.x - a.x);
			const h = Math.abs(b.y - b.y);

			ctx.save();
			ctx.lineWidth = Math.max(px, 1 * px) * 1;
			ctx.setLineDash([4 * px, 4 * px]);
			ctx.strokeStyle = '#0099ff';
			ctx.fillStyle = 'rgba(0, 150, 255, 0.1)';
			ctx.fillRect(x, y, w, h);
			ctx.strokeRect(x, y, w, h);
			ctx.setLineDash([]);
			ctx.restore();
		}

		ctx.restore();
	}

	_renderAlignGuidesScreen(ctx) {
		const g = this.state.alignGuide;
		if (!g) return;
		if ((g.ttl|0) <= 0) return;

		const w = this.canvas.width, h = this.canvas.height;
		ctx.save();
		ctx.setTransform(1,0,0,1,0,0);
		ctx.lineWidth = 1;
		ctx.strokeStyle = '#37e3ff88';

		if (Number.isFinite(g.v)) {
			ctx.beginPath(); ctx.moveTo(g.v, 0); ctx.lineTo(g.v, h); ctx.stroke();
		}
		if (Number.isFinite(g.h)) {
			ctx.beginPath(); ctx.moveTo(0, g.h); ctx.lineTo(w, g.h); ctx.stroke();
		}
		ctx.restore();

		g.ttl--;
	}

	_drawGizmo(frame, obb, px, ttool) {
		const showRotate = (ttool === 'rotate' || _editor.tool === 'transform');
		const showScale  = (ttool === 'scale'  || _editor.tool === 'transform');

		const ctx = this.ctx;
		const { cx, cy, theta } = frame;
		const { minX, minY, maxX, maxY } = obb;
		const w = maxX - minX, h = maxY - minY;

		const hs = 5 * px;
		const rotPad = 16 * px;
		const knobR = 7 * px;
		const rotRadius = Math.hypot(w, h) * 0.5 + rotPad;

		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate(theta);

		if (showRotate || showScale) {
			ctx.strokeStyle = 'rgba(30,144,255,1)';
			ctx.setLineDash([]);
			ctx.strokeRect(minX, minY, w, h);
		}

		if (showScale) {
			const handles = [
				{ n:'tl', x:minX,        y:minY        },
				{ n:'t',  x:minX + w/2,  y:minY        },
				{ n:'tr', x:maxX,        y:minY        },
				{ n:'r',  x:maxX,        y:minY + h/2  },
				{ n:'br', x:maxX,        y:maxY        },
				{ n:'b',  x:minX + w/2,  y:maxY        },
				{ n:'bl', x:minX,        y:maxY        },
				{ n:'l',  x:minX,        y:minY + h/2  }
			];
			for (const p of handles) {
				ctx.fillStyle = '#fff';
				ctx.beginPath();
				ctx.rect(p.x - hs, p.y - hs, hs * 2, hs * 2);
				ctx.fill();
				ctx.stroke();
			}
		}

		if (showRotate) {
			ctx.setLineDash([6 * px, 6 * px]);
			ctx.strokeStyle = 'rgba(0,0,0,0.45)';
			ctx.beginPath();
			ctx.arc(0, 0, rotRadius, 0, Math.PI * 2);
			ctx.stroke();

			ctx.setLineDash([]);
			ctx.strokeStyle = 'rgba(30,144,255,1)';
			ctx.beginPath();
			ctx.arc(0, 0, rotRadius, 0, Math.PI * 2);
			ctx.stroke();

			ctx.fillStyle = '#fff';
			for (const a of [0, Math.PI/2, Math.PI, 3*Math.PI/2]) {
				const kx = Math.cos(a) * rotRadius;
				const ky = Math.sin(a) * rotRadius;
				ctx.beginPath();
				ctx.arc(kx, ky, knobR, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}
		}

		ctx.restore();
	}

	_drawOriginCross(o) {
		const ctx = this.ctx;
		const px = U.pxToWorld(this.d2drenderer, 1);
		const size = 1.5;
		const len = 9 * px * size;
		const thick = Math.max(1.5 * px * size, 1 * px * size);

		const M = U.worldMatrix(o);
		const wp = U.applyMat(M, 0, 0);

		ctx.save();
		const prevOp = ctx.globalCompositeOperation;
		ctx.globalCompositeOperation = 'invert';

		ctx.lineWidth = thick;
		ctx.strokeStyle = 'rgba(0,255,255,1)';

		ctx.beginPath();
		ctx.moveTo(wp.x - len, wp.y);
		ctx.lineTo(wp.x + len, wp.y);
		ctx.moveTo(wp.x, wp.y - len);
		ctx.lineTo(wp.x, wp.y + len);
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(wp.x, wp.y, 5 * px, 0, Math.PI * 2);
		ctx.stroke();

		ctx.globalCompositeOperation = prevOp;
		ctx.restore();
	}

	/* ========================= EVENTS ========================= */

	_onDown(e) {
		if (e.button !== 0) return;
		if (this.d2drenderer.edit?.hoverPoint) return;

		const tool  = _editor.tool;
		const ttool = _editor.transformTool;
		const canSelect = tool === 'select' || tool === 'transform';
		if (!canSelect) return;

		const hit = this._hitGizmo(e, ttool);
		if (hit) {
			const p = U.eventToWorld(e, this.canvas, this.d2drenderer);
			this.state.start = p;
			this.state.last  = p;
			this._captureOriginals();
			this._captureStepStart();

			this.state.cx = hit.cx;
			this.state.cy = hit.cy;
			this.state.theta = hit.theta || 0;
			this.state.theta0 = this.state.theta;

			if (hit.type === 'scale' || hit.type === 'rotate') {
				const sel = _editor.selectedObjects.filter(o => o?.is2D);
				const obb = U.selectionOBB(sel, { cx: this.state.cx, cy: this.state.cy, theta: this.state.theta });
				if (obb) {
					this.state.hx0 = (obb.maxX - obb.minX) / 2;
					this.state.hy0 = (obb.maxY - obb.minY) / 2;
				}
			}

			if (hit.type === 'rotate') {
				this.state.mode = 'rotate';
				const lp = U.toFrameLocal(p.x, p.y, hit.cx, hit.cy, hit.theta);
				this.state.rotBase = Math.atan2(lp.y, lp.x);
				return;
			}
			if (hit.type === 'scale') {
				this.state.mode = 'scale';
				this.state.handle = hit.handle;
				this.state.p0L = U.toFrameLocal(p.x, p.y, hit.cx, hit.cy, hit.theta);
				return;
			}
		}

		this._handleSelection(e);
	}

	_onMove(e) {
		if (!this.state.mode) return;

		const p = U.eventToWorld(e, this.canvas, this.d2drenderer);
		this.state.last = p;

		if (this.state.mode === 'marquee') return;

		if (this.state.mode === 'move') {
			const dWx = p.x - this.state.start.x;
			const dWy = p.y - this.state.start.y;

			let addWorldX = 0, addWorldY = 0;

			if (_editor?.draw2d?.snapToObjects) {
				// cache selection rect baseline in canvas at gesture start
				const selObjs = _editor.selectedObjects.filter(o => o?.is2D);
				if (!this.state.startSelRectCanvas) {
					this.state.startSelRectCanvas = this._selectionRectCanvas(selObjs);
				}
				// cache guide lines from all 2D objects under focus (excluding selection)
				if (!this.state.guides) {
					this.state.guides = this._collectGuidesCanvas(_editor?.focus, new Set(selObjs));
				}

				const startRect = this.state.startSelRectCanvas;
				if (startRect) {
					const gs = U.canvasScale(this.d2drenderer);
					const dCanvasX = dWx * gs;
					const dCanvasY = dWy * gs;

					const proposed = {
						l: startRect.l + dCanvasX,
						r: startRect.r + dCanvasX,
						t: startRect.t + dCanvasY,
						b: startRect.b + dCanvasY,
						cx: startRect.cx + dCanvasX,
						cy: startRect.cy + dCanvasY
					};

					const snapPx = Math.max(4, Number(_editor?.draw2d?.snapPx || 10));
					const snap = this._findSnapDeltaCanvas(proposed, this.state.guides, snapPx); // {dx, dy, vLine, hLine}

					// visuals
					this.state.alignGuide = { v: snap.vLine, h: snap.hLine, ttl: 12 };

					// convert to world
					addWorldX = (snap.dx || 0) / gs;
					addWorldY = (snap.dy || 0) / gs;
				}
			}

			const tWx = dWx + addWorldX;
			const tWy = dWy + addWorldY;

			for (const [o, rec] of this.state.orig.entries()) {
				// apply world delta through parentInv linear part
				const dxLocal = rec.parentInv.a * tWx + rec.parentInv.c * tWy;
				const dyLocal = rec.parentInv.b * tWx + rec.parentInv.d * tWy;

				const pos = o.position || (o.position = { x:0, y:0, z:0 });
				pos.x = rec.pos0.x + dxLocal;
				pos.y = rec.pos0.y + dyLocal;
			}
		}
		else if (this.state.mode === 'rotate') {
			const { cx, cy, theta0 } = this.state;
			const lp = U.toFrameLocal(p.x, p.y, cx, cy, theta0);
			const a1 = Math.atan2(lp.y, lp.x);
			let dAng = a1 - this.state.rotBase;
			dAng = U.snapAngleSoft(dAng);
			this.state.theta = theta0 + dAng;

			for (const [o, rec] of this.state.orig.entries()) {
				const rot = o.rotation || (o.rotation = { x:0, y:0, z:0 });
				rot.z = rec.rot0 + dAng;
			}
		}
		else if (this.state.mode === 'scale') {
			const { handle, p0L, hx0, hy0 } = this.state;
			const pL = U.toFrameLocal(p.x, p.y, this.state.cx, this.state.cy, this.state.theta);
			const dx = pL.x - p0L.x;
			const dy = pL.y - p0L.y;

			let sx = 1, sy = 1;
			const EPS = 1e-6, MIN = 0.01, MAX = 1000;

			switch (handle) {
				case 'l': sx = 1 - dx / Math.max(hx0, EPS); break;
				case 'r': sx = 1 + dx / Math.max(hx0, EPS); break;
				case 't': sy = 1 - dy / Math.max(hy0, EPS); break;
				case 'b': sy = 1 + dy / Math.max(hy0, EPS); break;
				case 'tl':
				case 'tr':
				case 'bl':
				case 'br': {
					const sign = this._cornerSigns(handle);
					const vx = sign.sx * hx0;
					const vy = sign.sy * hy0;
					const len0 = Math.hypot(vx, vy) || 1e-6;
					const nx = vx / len0, ny = vy / len0;
					const proj = dx * nx + dy * ny;
					let s = 1 + proj / len0;
					if (s < MIN) s = MIN;
					if (s > MAX) s = MAX;
					sx = sy = s;
					break;
				}
			}

			sx = Math.min(Math.max(sx, MIN), MAX);
			sy = Math.min(Math.max(sy, MIN), MAX);

			for (const [o, rec] of this.state.orig.entries()) {
				const scl = o.scale || (o.scale = { x:1, y:1, z:1 });
				scl.x = rec.scl0.x * sx;
				scl.y = rec.scl0.y * sy;
			}
		}
		_editor.updateInspector?.();
	}

	_onUp() {
		if (this.state.mode === 'marquee') {
			const a = this.state.start, b = this.state.last;
			const rect = U.rectFromPoints(a, b);
			const minPx = 6;
			const minWorld = U.pxToWorld(this.d2drenderer, minPx);
			const isRealMarquee = Math.max(rect.w, rect.h) >= minWorld;

			if (isRealMarquee) {
				const roots = this._marqueeRootsUnderFocus();
				const newlyHit = [];
				for (const r of roots) {
					if (r.__editorState?.locked || r.noSelect) continue;
					const bb = U.worldAABBDeep(r);
					if (!bb) continue;
					if (U.rectIntersectsAABB(rect, bb)) newlyHit.push(r);
				}
				if (!event?.shiftKey) _editor.setSelection([]);
				if (newlyHit.length) _editor.addSelection(newlyHit);
			}
		}

		if (!this.state.mode || this.state.mode === 'marquee') {
			this._resetGestureState();
			return;
		}

		// record "after"
		const sel = _editor.selectedObjects.filter(o => o?.is2D);
		const end = [];
		for (const o of sel) {
			const pos = o.position || (o.position = { x:0, y:0, z:0 });
			const rot = o.rotation || (o.rotation = { x:0, y:0, z:0 });
			const scl = o.scale    || (o.scale    = { x:1, y:1, z:1 });
			end.push({
				obj: o,
				pos: { x: pos.x, y: pos.y },
				rot: rot.z || 0,
				scl: { x: scl.x, y: scl.y }
			});
		}
		this.state.stepEnd = end;

		const start = this.state.stepStart;

		// fire one transform-changed per object
		for (const entry of end) {
			const o = entry.obj;
			const prev = start.find(s => s.obj === o);
			if (!prev) continue;

			const changed = [];
			if (prev.pos.x !== entry.pos.x || prev.pos.y !== entry.pos.y) changed.push('pos');
			if (prev.rot !== entry.rot) changed.push('rot');
			if (prev.scl.x !== entry.scl.x || prev.scl.y !== entry.scl.y) changed.push('scl');
			if (!changed.length) continue;

			this.d3dobject = o;

			const rec = this.state.orig.get(o);
			_events.invoke('transform-changed', this.d3dobject, changed, {
				position:    rec.beginPos,
				rotation:    rec.beginRot3,
				quaternion:  rec.beginRot,
				scale:       rec.beginScl
			});
		}

		// single undoable step
		_editor.addStep({
			name: 'Transformation',
			undo: () => this._applySnapshot(start),
			redo: () => this._applySnapshot(end)
		});

		this._resetGestureState();
	}

	_resetGestureState() {
		this.state.mode = null;
		this.state.handle = null;
		this.state.stepStart = null;
		this.state.stepEnd = null;
		this.state.alignGuide = { v:null, h:null, ttl:0 };
		this.state.startSelRectCanvas = null;
		this.state.guides = null;
	}

	/* ========================= SELECTION / MOVE ========================= */

	_handleSelection(e) {
		const p = U.eventToWorld(e, this.canvas, this.d2drenderer);
		const hit = this._pickTop(p.x, p.y);

		const tool  = _editor.tool;
		const canMove = tool === 'select' || tool === 'transform';
		const sel = _editor.selectedObjects;

		// double-click to focus
		if (this.lastClick) {
			if (_time.now - this.lastClick.time < 0.4 && hit === this.lastClick.object) {
				_editor.focus = hit ?? _editor.focus?.parent;
				_editor.setSelection([]);
				this.lastClick = null;
				return;
			}
		}
		this.lastClick = { time: _time.now, object: hit };

		if (hit) {
			if (e.shiftKey) {
				if (sel.includes(hit)) _editor.removeSelection([hit]);
				else _editor.addSelection([hit]);
			} else {
				if (!sel.includes(hit)) _editor.setSelection([hit]);
			}

			if (canMove) {
				this.state.mode = 'move';
				this.state.start = p;
				this.state.last  = p;
				this._captureOriginals();
				this._captureStepStart();

				// cache selection rect + guides for snapping baseline
				const sel2 = _editor.selectedObjects.filter(o => o?.is2D);
				this.state.startSelRectCanvas = this._selectionRectCanvas(sel2);
				this.state.guides = this._collectGuidesCanvas(_editor?.focus, new Set(sel2));
			}
		} else {
			if (!e.shiftKey) _editor.setSelection([]);
			this.state.mode = 'marquee';
			this.state.start = p;
			this.state.last  = p;
		}
	}

	/* ========================= UNDO / SNAPSHOTS ========================= */

	_captureOriginals() {
		const sel = _editor.selectedObjects.filter(o => o?.is2D);
		const map = new Map();
		const snap = [];

		for (const o of sel) {
			const pos = o.position || (o.position = { x:0, y:0, z:0 });
			const rot = o.rotation || (o.rotation = { x:0, y:0, z:0 });
			const scl = o.scale    || (o.scale    = { x:1, y:1, z:1 });

			const parentM   = U.worldMatrix(o.parent || null);
			const parentInv = U.invert(parentM);

			const beginPos  = { x: pos.x, y: pos.y, z: pos.z ?? 0 };
			const beginRot3 = { x: rot.x ?? 0, y: rot.y ?? 0, z: rot.z ?? 0 };
			const beginRot  = U.quatFromZ(beginRot3.z);
			const beginScl  = { x: scl.x ?? 1, y: scl.y ?? 1, z: scl.z ?? 1 };

			map.set(o, {
				pos0: { x: pos.x, y: pos.y },
				rot0: rot.z || 0,
				scl0: { x: scl.x, y: scl.y },
				parentInv,
				beginPos,
				beginRot3,
				beginRot,
				beginScl
			});

			snap.push({
				obj: o,
				pos: { x: pos.x, y: pos.y },
				rot: rot.z || 0,
				scl: { x: scl.x, y: scl.y }
			});
		}

		this.state.orig = map;
		this.state.stepStart = snap;
		this.state.stepEnd = null;
	}

	_captureStepStart() {
		const sel = _editor.selectedObjects.filter(o => o?.is2D);
		this.state.stepStart = sel.map(o => ({
			obj: o,
			pos: { x: o.position?.x || 0, y: o.position?.y || 0 },
			rot: o.rotation?.z || 0,
			scl: { x: o.scale?.x ?? 1, y: o.scale?.y ?? 1 }
		}));
	}

	_captureStepEnd() {
		const sel = _editor.selectedObjects.filter(o => o?.is2D);
		this.state.stepEnd = sel.map(o => ({
			obj: o,
			pos: { x: o.position?.x || 0, y: o.position?.y || 0 },
			rot: o.rotation?.z || 0,
			scl: { x: o.scale?.x ?? 1, y: o.scale?.y ?? 1 }
		}));
	}

	_applySnapshot(snap) {
		for (const s of snap) {
			const pos = s.obj.position || (s.obj.position = { x:0, y:0, z:0 });
			const rot = s.obj.rotation || (s.obj.rotation = { x:0, y:0, z:0 });
			const scl = s.obj.scale    || (s.obj.scale    = { x:1, y:1, z:1 });
			pos.x = s.pos.x; pos.y = s.pos.y;
			rot.z = s.rot;
			scl.x = s.scl.x; scl.y = s.scl.y;
		}
	}

	/* ========================= GIZMO HIT-TEST ========================= */

	_hitGizmo(e, ttool) {
		const sel = _editor.selectedObjects.filter(o => o?.is2D);
		if (!sel.length) return null;

		const frame = U.selectionFrame(sel);
		if (!frame) return null;
		const obb = U.selectionOBB(sel, frame);
		if (!obb) return null;

		const allowRotate = (ttool === 'rotate' || _editor.tool === 'transform');
		const allowScale  = (ttool === 'scale'  || _editor.tool === 'transform');

		const { cx, cy, theta } = frame;
		const { minX, minY, maxX, maxY } = obb;
		const w = maxX - minX, h = maxY - minY;

		const px = U.pxToWorld(this.d2drenderer, 2);
		const hs = 6 * px;
		const knobR = 8 * px;
		const rotPad = 16 * px;
		const rotRadius = Math.hypot(w, h) * 0.5 + rotPad;

		const p = U.eventToWorld(e, this.canvas, this.d2drenderer);
		const lp = U.toFrameLocal(p.x, p.y, cx, cy, theta);

		if (allowRotate) {
			const dist = Math.hypot(lp.x, lp.y);
			if (Math.abs(dist - rotRadius) <= knobR * 1.5)
				return { type:'rotate', cx, cy, theta };
		}

		if (allowScale) {
			const handles = [
				{ n:'tl', x:minX,        y:minY        },
				{ n:'t',  x:minX + w/2,  y:minY        },
				{ n:'tr', x:maxX,        y:minY        },
				{ n:'r',  x:maxX,        y:minY + h/2  },
				{ n:'br', x:maxX,        y:maxY        },
				{ n:'b',  x:minX + w/2,  y:maxY        },
				{ n:'bl', x:minX,        y:maxY        },
				{ n:'l',  x:minX,        y:minY + h/2  }
			];
			for (const h of handles) {
				if (Math.abs(lp.x - h.x) <= hs && Math.abs(lp.y - h.y) <= hs)
					return { type:'scale', handle:h.n, cx, cy, theta };
			}
		}
		return null;
	}

	/* ========================= PICKING ========================= */

	_hitObjectDeep(root, wx, wy) {
		return U.hitObjectDeep(root, wx, wy, { renderer: this.d2drenderer, padPx: 8 });
	}

	_pickTop(wx, wy) {
		const roots = this._marqueeRootsUnderFocus();
		if (!roots.length) return null;

		roots.sort((a, b) => (a.position?.z || 0) - (b.position?.z || 0));

		for (let i = roots.length - 1; i >= 0; --i) {
			const r = roots[i];
			if (r.__editorState?.locked || r.noSelect) continue;
			if (this._hitObjectDeep(r, wx, wy)) return r;
		}
		return null;
	}

	/* ========================= SNAP HELPERS (SCREEN/PIXEL SPACE) ========================= */

	_selectionRectCanvas(objs) {
		if (!objs || !objs.length) return null;
		let l = +Infinity, r = -Infinity, t = +Infinity, b = -Infinity;
		const Mv = U.viewMatrix(this.d2drenderer);

		for (const o of objs) {
			const bb = U.worldAABBDeep(o);
			if (!bb) continue;
			const corners = [
				{ x: bb.minX, y: bb.minY },
				{ x: bb.maxX, y: bb.minY },
				{ x: bb.maxX, y: bb.maxY },
				{ x: bb.minX, y: bb.maxY }
			];
			for (const c of corners) {
				const p = U.applyDOM(Mv, c.x, c.y);
				if (p.x < l) l = p.x; if (p.x > r) r = p.x;
				if (p.y < t) t = p.y; if (p.y > b) b = p.y;
			}
		}
		if (!Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(t) || !Number.isFinite(b)) return null;
		return { l, r, t, b, cx:(l+r)/2, cy:(t+b)/2 };
	}

	_objectRectCanvas(o) {
		const bb = U.worldAABBDeep(o);
		if (!bb) return null;
		const Mv = U.viewMatrix(this.d2drenderer);
		let l = +Infinity, r = -Infinity, t = +Infinity, b = -Infinity;
		const corners = [
			{ x: bb.minX, y: bb.minY },
			{ x: bb.maxX, y: bb.minY },
			{ x: bb.maxX, y: bb.maxY },
			{ x: bb.minX, y: bb.maxY }
		];
		for (const c of corners) {
			const p = U.applyDOM(Mv, c.x, c.y);
			if (p.x < l) l = p.x; if (p.x > r) r = p.x;
			if (p.y < t) t = p.y; if (p.y > b) b = p.y;
		}
		if (!Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(t) || !Number.isFinite(b)) return null;
		return { l, r, t, b, cx:(l+r)/2, cy:(t+b)/2 };
	}

	_collectGuidesCanvas(focus, excludeSet) {
		const xs = [];
		const ys = [];

		// canvas center lines
		xs.push(this.canvas.width * 0.5);
		ys.push(this.canvas.height * 0.5);

		// gather all 2D descendants under focus (unique top-level roots like your existing helpers)
		const roots = new Set();
		const host = focus || this.d2drenderer.root;

		U.traverse2D(host, (node) => {
			if (!node?.is2D) return;
			let r = node;
			while (r.parent && r.parent !== host) r = r.parent;
			if (r?.is2D) roots.add(r);
		});

		for (const o of roots) {
			if (excludeSet?.has(o)) continue;
			if (o.__editorState?.locked || o.noSelect) continue;

			const rc = this._objectRectCanvas(o);
			if (!rc) continue;

			// vertical: left, center, right
			xs.push(rc.l, rc.cx, rc.r);
			// horizontal: top, center, bottom
			ys.push(rc.t, rc.cy, rc.b);
		}
		return { xs, ys };
	}

	_findSnapDeltaCanvas(proposed, guides, snapPx) {
		let bestVX = null, bestVDist = snapPx + 1, bestVLine = null;
		let bestHY = null, bestHDist = snapPx + 1, bestHLine = null;

		const candidatesX = [proposed.l, proposed.cx, proposed.r];
		const candidatesY = [proposed.t, proposed.cy, proposed.b];

		// vertical (x)
		for (const gx of guides.xs) {
			for (const cx of candidatesX) {
				const d = Math.abs(gx - cx);
				if (d < bestVDist && d <= snapPx) {
					bestVDist = d;
					bestVX = gx - cx;
					bestVLine = gx;
				}
			}
		}
		// horizontal (y)
		for (const gy of guides.ys) {
			for (const cy of candidatesY) {
				const d = Math.abs(gy - cy);
				if (d < bestHDist && d <= snapPx) {
					bestHDist = d;
					bestHY = gy - cy;
					bestHLine = gy;
				}
			}
		}

		return {
			dx: bestVX || 0,
			dy: bestHY || 0,
			vLine: bestVLine,
			hLine: bestHLine
		};
	}

	/* ========================= PICK ROOTS ========================= */

	_marqueeRootsUnderFocus() {
		const roots = new Set();
		const focus = _editor.focus || this.d2drenderer.root;

		U.traverse2D(focus, (node) => {
			if (!node?.is2D) return;
			let r = node;
			while (r.parent && r.parent !== focus) r = r.parent;
			if (r?.is2D) roots.add(r);
		});

		return Array.from(roots);
	}

	/* ========================= HELPERS ========================= */

	_cornerSigns(handle) {
		switch (handle) {
			case 'tl': return { sx: -1, sy: -1 };
			case 'tr': return { sx: +1, sy: -1 };
			case 'br': return { sx: +1, sy: +1 };
			case 'bl': return { sx: -1, sy: +1 };
			default:   return { sx: 0,  sy: 0  };
		}
	}
}