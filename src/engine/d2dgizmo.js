// d2dgizmo.js
import * as U from './d2dutility.js';
// import D2DPanZoom from './d2dpanzoom.js'; // optional

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
			orig: null,            // Map(obj -> { pos0:{x,y}, rot0, scl0:{x,y}, parentInv })
			stepStart: null,
			stepEnd: null
		};

		this._onDown = this._onDown.bind(this);
		this._onMove = this._onMove.bind(this);
		this._onUp   = this._onUp.bind(this);

		// this._panZoom = new D2DPanZoom(d2drenderer);

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
		if (!sel.length && !showMarquee) return;

		const ctx = this.ctx;
		ctx.save();
		
		this.d2drenderer.applyDeviceTransform(ctx);

		// origin crosses
		for (const o of sel) this._drawOriginCross(o);

		// stroke scale in world units for 2px screen width
		const px = U.pxToWorld(this.d2drenderer, 2);
		ctx.lineWidth = Math.max(px, 1 * px);
		ctx.strokeStyle = 'rgba(30,144,255,1)';

		// soft selection feedback (deep AABB)
		for (const o of sel) {
			const r = U.worldAABBDeep(o);
			if (!r) continue;
			ctx.strokeRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
		}

		// oriented gizmo parts based on transformTool
		if (sel.length > 0) {
			let frame = U.selectionFrame(sel);
			if (!frame) { ctx.restore(); return; }

			// keep frame steady while dragging
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
			const h = Math.abs(b.y - a.y);

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

	_drawGizmo(frame, obb, px, ttool) {
		const showRotate = (ttool === 'rotate' || _editor.tool === 'transform');
		const showScale  = (ttool === 'scale'  || _editor.tool === 'transform');

		const ctx = this.ctx;
		const { cx, cy, theta } = frame;
		const { minX, minY, maxX, maxY } = obb;
		const w = maxX - minX, h = maxY - minY;

		const hs = 5 * px;         // handle half-size
		const rotPad = 16 * px;
		const knobR = 7 * px;
		const rotRadius = Math.hypot(w, h) * 0.5 + rotPad;

		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate(theta);

		// oriented box
		if (showRotate || showScale) {
			ctx.strokeStyle = 'rgba(30,144,255,1)';
			ctx.setLineDash([]);
			ctx.strokeRect(minX, minY, w, h);
		}

		// scale handles
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

		// rotate ring + 4 knobs
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

		// world position of local origin
		const M = U.worldMatrix(o);
		const wp = U.applyMat(M, 0, 0);

		ctx.save();

		const prevOp = ctx.globalCompositeOperation;
		ctx.globalCompositeOperation = 'invert';

		ctx.lineWidth = thick;
		ctx.strokeStyle = 'rgba(0,255,255,1)'; // cyan

		// cross
		ctx.beginPath();
		ctx.moveTo(wp.x - len, wp.y);
		ctx.lineTo(wp.x + len, wp.y);
		ctx.moveTo(wp.x, wp.y - len);
		ctx.lineTo(wp.x, wp.y + len);
		ctx.stroke();

		// center dot
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

			// baseline extents for scale
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

		// otherwise: select / marquee / move
		this._handleSelection(e);
	}

	_onMove(e) {
		if (!this.state.mode) return;

		const p = U.eventToWorld(e, this.canvas, this.d2drenderer);
		this.state.last = p;

		if (this.state.mode === 'marquee') {
			this.state.last = p;
			return;
		}

		if (this.state.mode === 'move') {
			const dWx = p.x - this.state.start.x;
			const dWy = p.y - this.state.start.y;

			for (const [o, rec] of this.state.orig.entries()) {
				// apply ONLY linear part of parentInv to the delta
				const dxLocal = rec.parentInv.a * dWx + rec.parentInv.c * dWy;
				const dyLocal = rec.parentInv.b * dWx + rec.parentInv.d * dWy;

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

			// soft snap near 45°
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
					// uniform by projecting mouse delta onto corner diagonal
					const sign = this._cornerSigns(handle); // {sx, sy} with ±1
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

			// only complete if it's a *real* marquee
			const minPx = 6;
			const minWorld = U.pxToWorld(this.d2drenderer, minPx);
			const isRealMarquee = Math.max(rect.w, rect.h) >= minWorld;

			if (isRealMarquee) {
				const roots = this._marqueeRootsUnderFocus();
				const newlyHit = [];
				for (const r of roots) {
					if(r.__editorState.locked || r.noSelect) continue;
					const bb = U.worldAABBDeep(r);
					if (!bb) continue;
					if (U.rectIntersectsAABB(rect, bb)) newlyHit.push(r);
				}

				if (!event?.shiftKey) _editor.setSelection([]);
				if (newlyHit.length) _editor.addSelection(newlyHit);
			}
		}

		if (!this.state.mode || this.state.mode === 'marquee') {
			this.state.mode = null;
			this.state.handle = null;
			this.state.stepStart = null;
			this.state.stepEnd = null;
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

			this.d3dobject = o; // as per your event signature

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

		// clear gesture state
		this.state.mode = null;
		this.state.handle = null;
		this.state.stepStart = null;
		this.state.stepEnd = null;
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
				_editor.focus = hit ?? _editor.focus.parent;
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

			// parent inverse (world delta -> local delta)
			const parentM   = U.worldMatrix(o.parent || null);
			const parentInv = U.invert(parentM);

			// capture begin* snapshot for event payload
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

		// painter’s order by z
		roots.sort((a, b) => (a.position?.z || 0) - (b.position?.z || 0));

		for (let i = roots.length - 1; i >= 0; --i) {
			const r = roots[i];
			if(r.__editorState.locked || r.noSelect) continue;
			if (this._hitObjectDeep(r, wx, wy)) return r;
		}
		return null;
	}

	_all2DInDrawOrder(host) {
		if (!host) host = this.d2drenderer.root;
		const out = [];
		host.children.forEach(o => { if (o?.is2D) out.push(o); });
		out.sort((a, b) => (a.position?.z || 0) - (b.position?.z || 0));
		return out;
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
}