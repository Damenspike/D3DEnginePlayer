export default class D2DGizmo {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;

		this.state = {
			mode: null,            // 'move' | 'rotate' | 'scale' | 'marquee'
			handle: null,          // scale handle id ('l','r','t','b','tl','tr','br','bl')
			start: { x: 0, y: 0 },
			last:  { x: 0, y: 0 },

			// frozen frame during active transform
			cx: 0, cy: 0, theta: 0,
			theta0: 0, rotBase: 0,

			// scale baseline
			hx0: 1, hy0: 1,        // half extents of OBB in frame
			p0L: { x: 0, y: 0 },   // mouse start (frame local)

			// originals for current selection + undo/redo
			orig: null,            // Map(obj -> { pos0:{x,y}, rot0, scl0:{x,y} })
			stepStart: null,
			stepEnd: null
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
		if (!sel.length && !showMarquee) return;

		const ctx = this.ctx;
		ctx.save();
		
		for (const o of sel) {
			this._drawOriginCross(o);
		}

		const px = 2 / (this.d2drenderer.pixelRatio * this.d2drenderer.viewScale);
		ctx.lineWidth = Math.max(px, 1 * px);
		ctx.strokeStyle = 'rgba(30,144,255,1)';

		// soft selection feedback
		for (const o of sel) {
			const r = this._worldAABBDeep(o);
			if (!r) continue;
			ctx.strokeRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
		}

		// oriented gizmo parts based on transformTool
		if (sel.length > 0) {
			let frame = this._selectionFrame(sel);
			if (!frame) { ctx.restore(); return; }
			
			// while dragging, keep frame steady for scale; rotate frame with object in rotate mode
			if (this.state.mode === 'scale') {
				frame = { cx: this.state.cx, cy: this.state.cy, theta: this.state.theta };
			} else if (this.state.mode === 'rotate') {
				frame = { cx: this.state.cx, cy: this.state.cy, theta: this.state.theta };
			}

			const obb = this._selectionOBB(sel, frame);
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
			ctx.lineWidth = Math.max(px, 1 * px) * 2;
			ctx.setLineDash([4 * px, 4 * px]);
			ctx.strokeStyle = '#0099ff'; // same border color as 3D
			ctx.fillStyle = 'rgba(0, 150, 255, 0.1)'; // translucent blue fill
		
			// fill background
			ctx.fillRect(x, y, w, h);
		
			// stroke outline
			ctx.strokeRect(x, y, w, h);
		
			ctx.setLineDash([]);
			ctx.restore();
		}

		ctx.restore();
	}

	_drawGizmo(frame, obb, px, ttool) {
		const showRotate = (ttool === 'rotate' || _editor.tool === 'transform');
		const showScale  = (ttool === 'scale'  || _editor.tool === 'transform');
		// Translate has no visuals; you can still click-drag the object body.

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

		// main oriented box (only if scale or rotate are visible; skip for pure Translate)
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
		const px = this._px(1);
		const size = 1.5;
		const len = 9 * px * size;
		const thick = Math.max(1.5 * px * size, 1 * px * size);
	
		// world position of the object's local origin (0,0)
		const M = this._worldMatrix(o);
		const wp = this._applyMat(M, 0, 0);
	
		ctx.save();
	
		// multiply blend so it stays visible over any fill
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
	
		// restore
		ctx.globalCompositeOperation = prevOp;
		ctx.restore();
	}

	/* ========================= EVENTS ========================= */

	_onDown(e) {
		if (e.button !== 0) return;
		if(this.d2drenderer.edit.hoverPoint) return;

		const tool  = _editor.tool;
		const ttool = _editor.transformTool;
		const canSelect = tool === 'select' || tool === 'transform';
		if (!canSelect) return;
		
		const hit = this._hitGizmo(e, ttool);
		if (hit) {
			const p = this._toWorld(e);
			this.state.start = p;
			this.state.last  = p;
			this._captureOriginals();           // for undo
			this._captureStepStart();           // start snapshot
		
			this.state.cx = hit.cx;
			this.state.cy = hit.cy;
			this.state.theta = hit.theta || 0;
			this.state.theta0 = this.state.theta;
		
			// baseline extents for scale
			if (hit.type === 'scale' || hit.type === 'rotate') {
				const sel = _editor.selectedObjects.filter(o => o?.is2D);
				const obb = this._selectionOBB(sel, { cx:this.state.cx, cy:this.state.cy, theta:this.state.theta });
				if (obb) {
					this.state.hx0 = (obb.maxX - obb.minX) / 2;
					this.state.hy0 = (obb.maxY - obb.minY) / 2;
				}
			}
		
			if (hit.type === 'rotate') {
				this.state.mode = 'rotate';
				const lp = this._toFrameLocal(p.x, p.y, hit.cx, hit.cy, hit.theta);
				this.state.rotBase = Math.atan2(lp.y, lp.x);
				return;
			}
			if (hit.type === 'scale') {
				this.state.mode = 'scale';
				this.state.handle = hit.handle;
				this.state.p0L = this._toFrameLocal(p.x, p.y, hit.cx, hit.cy, hit.theta);
				return;
			}
		}

		// Otherwise: select / marquee / move (move allowed in select; and in transform only if Translate/All)
		this._handleSelection(e);
	}

	_onMove(e) {
		if (!this.state.mode) return;

		const p = this._toWorld(e);
		this.state.last = p;
		
		if (this.state.mode === 'marquee') {
			this.state.last = this._toWorld(e);
			return;
		}
		
		if (this.state.mode === 'move') {
			const dWx = p.x - this.state.start.x; // world delta
			const dWy = p.y - this.state.start.y;
		
			for (const [o, rec] of this.state.orig.entries()) {
				// apply ONLY the linear part (no translation) of parentInv to the delta
				const dxLocal = rec.parentInv.a * dWx + rec.parentInv.c * dWy;
				const dyLocal = rec.parentInv.b * dWx + rec.parentInv.d * dWy;
		
				const pos = o.position || (o.position = { x:0, y:0, z:0 });
				pos.x = rec.pos0.x + dxLocal;
				pos.y = rec.pos0.y + dyLocal;
			}
		}
		else if (this.state.mode === 'rotate') {
			const { cx, cy, theta0 } = this.state;
			const lp = this._toFrameLocal(p.x, p.y, cx, cy, theta0);
			const a1 = Math.atan2(lp.y, lp.x);
			let dAng = a1 - this.state.rotBase;

			// soft snap near 45°
			dAng = this._snapAngleSoft(dAng);

			this.state.theta = theta0 + dAng;

			for (const [o, rec] of this.state.orig.entries()) {
				const rot = o.rotation || (o.rotation = { x:0, y:0, z:0 });
				rot.z = rec.rot0 + dAng;
			}
		}
		else if (this.state.mode === 'scale') {
			const { handle, p0L, hx0, hy0 } = this.state;
			const pL = this._toFrameLocal(p.x, p.y, this.state.cx, this.state.cy, this.state.theta);
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
					// uniform by projecting mouse delta onto that corner's outward diagonal
					const sign = this._cornerSigns(handle);    // {sx, sy} with ±1
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
			const rect = this._rectFromPoints(a, b); // {x, y, w, h}
		
			const roots = this._marqueeRootsUnderFocus();
			const newlyHit = [];
			for (const r of roots) {
				const bb = this._worldAABBDeep(r);
				if (!bb) continue;
				if (this._rectIntersectsAABB(rect, bb)) newlyHit.push(r);
			}
		
			if (!event?.shiftKey)
				_editor.setSelection([]);
			if (newlyHit.length)
				_editor.addSelection(newlyHit);
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
	
		// fire one transform-changed per object (with EXACT payload you specified)
		for (const entry of end) {
			const o = entry.obj;
			const prev = start.find(s => s.obj === o);
			if (!prev) continue;
	
			const changed = [];
			if (prev.pos.x !== entry.pos.x || prev.pos.y !== entry.pos.y) changed.push('pos');
			if (prev.rot !== entry.rot) changed.push('rot');
			if (prev.scl.x !== entry.scl.x || prev.scl.y !== entry.scl.y) changed.push('scl');
			if (!changed.length) continue;
	
			// set the instance field to match your desired signature exactly
			this.d3dobject = o;
	
			const rec = this.state.orig.get(o);
			_events.invoke('transform-changed', this.d3dobject, changed, {
				position:    rec.beginPos,
				rotation:    rec.beginRot3,
				quaternion:  rec.beginRot,
				scale:       rec.beginScl
			});
		}
	
		// push single undoable step (whole gesture)
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
		const p = this._toWorld(e);
		const hit = this._pickTop(p.x, p.y);

		const tool  = _editor.tool;
		const ttool = _editor.transformTool;

		if (hit) {
			if (e.shiftKey) {
				if (_editor.selectedObjects.includes(hit)) _editor.removeSelection([hit]);
				else _editor.addSelection([hit]);
			} else {
				_editor.setSelection([hit]);
			}
			
			const canMove = tool === 'select' || tool === 'transform';

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
	
			// parent inverse (so we can convert world delta -> local delta)
			const parentM   = this._worldMatrix(o.parent || null);
			const parentInv = this._invert(parentM);
	
			map.set(o, {
				pos0: { x: pos.x, y: pos.y },
				rot0: rot.z || 0,
				scl0: { x: scl.x, y: scl.y },
				parentInv
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

		const frame = this._selectionFrame(sel);
		if (!frame) return null;
		const obb = this._selectionOBB(sel, frame);
		if (!obb) return null;

		const allowRotate = (ttool === 'rotate' || _editor.tool === 'transform');
		const allowScale  = (ttool === 'scale'  || _editor.tool === 'transform');

		const { cx, cy, theta } = frame;
		const { minX, minY, maxX, maxY } = obb;
		const w = maxX - minX, h = maxY - minY;

		const px = 2 / (this.d2drenderer.pixelRatio * this.d2drenderer.viewScale);
		const hs = 6 * px;
		const knobR = 8 * px;
		const rotPad = 16 * px;
		const rotRadius = Math.hypot(w, h) * 0.5 + rotPad;

		const p = this._toWorld(e);
		const lp = this._toFrameLocal(p.x, p.y, cx, cy, theta);

		if (allowRotate) {
			// soft ring
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

	/* ========================= GEOMETRY ========================= */

	_selectionFrame(sel) {
		const aabb = this._selectionAABB(sel);
		if (!aabb) return null;
		const cx = (aabb.minX + aabb.maxX) / 2;
		const cy = (aabb.minY + aabb.maxY) / 2;

		let sum = 0, n = 0;
		for (const o of sel) {
			const M = this._worldMatrix(o);
			const ang = Math.atan2(M.b, M.a);
			if (Number.isFinite(ang)) { sum += ang; n++; }
		}
		const theta = n ? (sum / n) : 0;
		return { cx, cy, theta };
	}

	_selectionAABB(objs) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	
		for (const root of objs) {
			const r = this._worldAABBDeep(root);
			if (!r) continue;
			if (r.minX < minX) minX = r.minX;
			if (r.minY < minY) minY = r.minY;
			if (r.maxX > maxX) maxX = r.maxX;
			if (r.maxY > maxY) maxY = r.maxY;
		}
	
		if (!isFinite(minX)) return null;
		return { minX, minY, maxX, maxY };
	}

	_selectionOBB(roots, frame) {
		const { cx, cy, theta } = frame;
		const c = Math.cos(-theta), s = Math.sin(-theta);
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	
		const accum = (o) => {
			const pts = this._localPoints(o);
			if (!pts || pts.length === 0) return;
			const M = this._worldMatrix(o);
			for (const p of pts) {
				const wp = this._applyMat(M, p.x, p.y);
				const dx = wp.x - cx, dy = wp.y - cy;
				const lx = dx * c - dy * s;
				const ly = dx * s + dy * c;
				if (lx < minX) minX = lx;
				if (ly < minY) minY = ly;
				if (lx > maxX) maxX = lx;
				if (ly > maxY) maxY = ly;
			}
		};
	
		for (const root of roots) this._traverse2D(root, accum);
	
		if (!isFinite(minX)) return null;
		return { minX, minY, maxX, maxY };
	}

	_worldAABB(o) {
		const pts = this._localPoints(o);
		if (!pts) return null;
		const M = this._worldMatrix(o);

		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const p of pts) {
			const wp = this._applyMat(M, p.x, p.y);
			if (wp.x < minX) minX = wp.x;
			if (wp.y < minY) minY = wp.y;
			if (wp.x > maxX) maxX = wp.x;
			if (wp.y > maxY) maxY = wp.y;
		}
		return { minX, minY, maxX, maxY };
	}

	_localPoints(o) {
		const g = o?.graphic2d;
		const pts = g?._points;
		return (Array.isArray(pts) && pts.length) ? pts : null;
	}

	_worldMatrix(o) {
		if (!o) return { a:1, b:0, c:0, d:1, e:0, f:0 };
		let M = { a:1, b:0, c:0, d:1, e:0, f:0 };
		const chain = [];
		let n = o;
		while (n) { chain.push(n); n = n.parent; }
		for (let i = chain.length - 1; i >= 0; --i) {
			const node = chain[i];
			const tx = Number(node.position?.x || 0);
			const ty = Number(node.position?.y || 0);
			const sx = Number(node.scale?.x ?? 1);
			const sy = Number(node.scale?.y ?? 1);
			const rz = Number(node.rotation?.z ?? 0);
			const cos = Math.cos(rz), sin = Math.sin(rz);
			const L = { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, e: tx, f: ty };
			M = this._mul(M, L);
		}
		return M;
	}

	_mul(A, B) {
		return {
			a: A.a * B.a + A.c * B.b,
			b: A.b * B.a + A.d * B.b,
			c: A.a * B.c + A.c * B.d,
			d: A.b * B.c + A.d * B.d,
			e: A.a * B.e + A.c * B.f + A.e,
			f: A.b * B.e + A.d * B.f + A.f
		};
	}

	_applyMat(M, x, y) {
		return { x: M.a * x + M.c * y + M.e, y: M.b * x + M.d * y + M.f };
	}

	_toFrameLocal(wx, wy, cx, cy, theta) {
		const c = Math.cos(-theta), s = Math.sin(-theta);
		const dx = wx - cx, dy = wy - cy;
		return { x: dx * c - dy * s, y: dx * s + dy * c };
	}

	_toWorld(e) {
		const rect = this.canvas.getBoundingClientRect();
		const sx = this.canvas.width / rect.width;
		const sy = this.canvas.height / rect.height;
		const cx = (e.clientX - rect.left) * sx;
		const cy = (e.clientY - rect.top) * sy;
		const k = this.d2drenderer.pixelRatio * this.d2drenderer.viewScale;
		return { x: cx / k, y: cy / k };
	}

	/* ========================= PICKING ========================= */

	_pickTop(wx, wy) {
		const list = this._all2DInDrawOrder();
		let d3dobj;
		
		for (let i = list.length - 1; i >= 0; --i) {
			const o = list[i];
			if (this._hitObject(o, wx, wy)) {
				d3dobj = o;
				break;
			}
		}
		
		if(!d3dobj)
			return null;
		
		// Get the object thats child of _editor.focus
		while(d3dobj.parent != _editor.focus) {
			d3dobj = d3dobj.parent;
			if(!d3dobj)
				break;
		}
		
		return d3dobj;
	}

	_all2DInDrawOrder() {
		const out = [];
		this.d2drenderer.root.traverse(o => { if (o?.is2D) out.push(o); });
		out.sort((a, b) => (a.position?.z || 0) - (b.position?.z || 0));
		return out;
	}

	_hitObject(o, wx, wy) {
		const pts = this._localPoints(o);
		if (!pts || pts.length < 2) return false;
	
		// world → local
		const Minv = this._worldMatrixInverse(o);
		const lp = this._applyMat(Minv, wx, wy);
	
		const closed = this._isClosed(pts);
		const tol = this._px(10); // ~10px buffer in screen space
	
		if (closed) {
			// inside fill OR within tol of the outline counts as a hit
			if (this._pointInPolygon(lp.x, lp.y, pts)) return true;
			if (this._pointNearPolyline(lp.x, lp.y, pts, tol)) return true;
	
			// also accept clicks within tol of the shape's local AABB (nice for tiny shapes)
			let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
			for (const p of pts) {
				if (p.x < minX) minX = p.x;
				if (p.y < minY) minY = p.y;
				if (p.x > maxX) maxX = p.x;
				if (p.y > maxY) maxY = p.y;
			}
			if (
				lp.x >= minX - tol && lp.x <= maxX + tol &&
				lp.y >= minY - tol && lp.y <= maxY + tol
			) {
				// If the point is just outside the fill but near the bbox edge, treat as hit
				// (keeps selections sticky while editing nearby points).
				return true;
			}
			return false;
		}
	
		// open polylines: near-line within tol
		return this._pointNearPolyline(lp.x, lp.y, pts, tol);
	}

	_invert(M) {
		const det = M.a * M.d - M.b * M.c || 1e-12;
		const ia =  M.d / det, ib = -M.b / det, ic = -M.c / det, id =  M.a / det;
		const ie = -(ia * M.e + ic * M.f), iff = -(ib * M.e + id * M.f);
		return { a: ia, b: ib, c: ic, d: id, e: ie, f: iff };
	}

	_isClosed(pts) {
		const a = pts[0], b = pts[pts.length - 1];
		return Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) <= 1e-6;
	}

	_pointInPolygon(x, y, pts) {
		let inside = false;
		for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			const xi = pts[i].x, yi = pts[i].y;
			const xj = pts[j].x, yj = pts[j].y;
			const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
			if (intersect) inside = !inside;
		}
		return inside;
	}

	_pointNearPolyline(x, y, pts, tol) {
		const t2 = tol * tol;
		for (let i = 0; i < pts.length - 1; i++) {
			if (this._distSqToSeg(x, y, pts[i], pts[i + 1]) <= t2) return true;
		}
		return false;
	}

	_distSqToSeg(px, py, a, b) {
		const vx = b.x - a.x, vy = b.y - a.y;
		const wx = px - a.x, wy = py - a.y;
		const c1 = vx * wx + vy * wy;
		if (c1 <= 0) return wx * wx + wy * wy;
		const c2 = vx * vx + vy * vy;
		if (c2 <= c1) {
			const dx = px - b.x, dy = py - b.y;
			return dx * dx + dy * dy;
		}
		const t = c1 / c2;
		const projx = a.x + t * vx, projy = a.y + t * vy;
		const dx = px - projx, dy = py - projy;
		return dx * dx + dy * dy;
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

	// soft snap to nearest multiple of 45° within ~5°
	_snapAngleSoft(a, step = Math.PI / 4, tol = Math.PI / 36) {
		const k = Math.round(a / step) * step;
		return (Math.abs(a - k) < tol) ? k : a;
	}
	
	_quatFromZ(rad) {
		const half = rad * 0.5;
		return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
	}
	
	_px(px = 10) {
		const k = this.d2drenderer.pixelRatio * this.d2drenderer.viewScale;
		return px / k;
	}
	
	_worldMatrixInverse(o) {
		const M = this._worldMatrix(o);
		const det = M.a * M.d - M.b * M.c || 1e-12;
		const ia =  M.d / det;
		const ib = -M.b / det;
		const ic = -M.c / det;
		const id =  M.a / det;
		const ie = -(ia * M.e + ic * M.f);
		const iff = -(ib * M.e + id * M.f);
		return { a: ia, b: ib, c: ic, d: id, e: ie, f: iff };
	}
	
	_worldAABBDeep(root) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	
		this._traverse2D(root, (o) => {
			const pts = this._localPoints(o);
			if (!pts || pts.length === 0) return;
			const M = this._worldMatrix(o);
			for (const p of pts) {
				const wp = this._applyMat(M, p.x, p.y);
				if (wp.x < minX) minX = wp.x;
				if (wp.y < minY) minY = wp.y;
				if (wp.x > maxX) maxX = wp.x;
				if (wp.y > maxY) maxY = wp.y;
			}
		});
	
		if (!isFinite(minX)) return null;
		return { minX, minY, maxX, maxY };
	}
	
	_traverse2D(node, fn) {
		if (!node) return;
		// visit this node if it's 2D
		if (node.is2D) fn(node);
		// depth-first through children (if any)
		const kids = node.children || node._children || [];
		for (const c of kids) this._traverse2D(c, fn);
	}
	
	_rectFromPoints(a, b) {
		const x = Math.min(a.x, b.x);
		const y = Math.min(a.y, b.y);
		const w = Math.abs(b.x - a.x);
		const h = Math.abs(b.y - a.y);
		return { x, y, w, h };
	}
	
	_rectIntersectsAABB(rect, aabb) {
		return (
			aabb.minX < rect.x + rect.w &&
			aabb.maxX > rect.x &&
			aabb.minY < rect.y + rect.h &&
			aabb.maxY > rect.y
		);
	}
	
	_marqueeRootsUnderFocus() {
		const roots = new Set();
		const focus = _editor.focus || this.d2drenderer.root;
	
		this._traverse2D(focus, (node) => {
			if (!node?.is2D) return;
			let r = node;
			while (r.parent && r.parent !== focus) r = r.parent;
			if (r?.is2D) roots.add(r);
		});
	
		return Array.from(roots);
	}
}