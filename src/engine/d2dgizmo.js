// d2dgizmo.js
import * as U from './d2dutility.js';

export default class D2DGizmo {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;
		this.pivotPointRadius = 10;
	
		this.state = {
			mode: null,            // 'move' | 'rotate' | 'scale' | 'marquee'
			handle: null,          // 'l','r','t','b','tl','tr','br','bl'
			start: { x: 0, y: 0 },
			last:  { x: 0, y: 0 },
	
			// frozen frame during active transform
			cx: 0, cy: 0, theta: 0,
			theta0: 0, rotBase: 0,
	
			// scale baseline
			hx0: 1, hy0: 1,
			p0L: { x: 0, y: 0 },
	
			// originals for current selection + undo/redo
			orig: null,
			stepStart: null,
			stepEnd: null,
			
			// pivot drag
			pivotDrag: null,
	
			// snapping visuals (screen space)
			alignGuide: { v:null, h:null, ttl:0 },
	
			// cached selection bounds + guides
			startSelRectCanvas: null,
			clickTime: 0,
			guides: null
		};
		this._pan = { active:false, x0:0, y0:0, vox:0, voy:0 };
	
		// mouse + keyboard
		this._onDown = this._onDown.bind(this);
		this._onMove = this._onMove.bind(this);
		this._onUp = this._onUp.bind(this);
		this._onWheel = this._onWheel.bind(this);
		this._onKeyDown = this._onKeyDown.bind(this);
		this._onMouseTrack = this._onMouseTrack.bind(this);
		this._onAuxClick = (e) => { if(e.button === 1) e.preventDefault(); };
	
		// track mouse for anchored zoom
		this._mouseCanvasX = NaN;
		this._mouseCanvasY = NaN;
	
		// === event bindings ===
		this.canvas.addEventListener('mousedown', this._onDown);
		this.canvas.addEventListener('wheel', this._onWheel, { passive:false });
		this.canvas.addEventListener('mousemove', this._onMouseTrack, { passive:true });
		this.canvas.addEventListener('auxclick', this._onAuxClick);
	
		window.addEventListener('mousemove', this._onMove);
		window.addEventListener('mouseup', this._onUp);
		window.addEventListener('keydown', this._onKeyDown, true);
	}
	
	dispose() {
		this.canvas.removeEventListener('mousedown', this._onDown);
		this.canvas.removeEventListener('wheel', this._onWheel);
		this.canvas.removeEventListener('mousemove', this._onMouseTrack);
		this.canvas.removeEventListener('auxclick', this._onAuxClick);
	
		window.removeEventListener('mousemove', this._onMove);
		window.removeEventListener('mouseup', this._onUp);
		window.removeEventListener('keydown', this._onKeyDown, true);
	}

	/* ========================= RENDER ========================= */

	render() {
		const tool = _editor.tool;
		const ttool = _editor.transformTool; // 'Translate' | 'Rotate' | 'Scale' | 'All'
		const sel = _editor.selectedObjects.filter(o => o?.is2D);
		const showMarquee = this.state.mode === 'marquee';
		if(!sel.length && !showMarquee && (this.state.alignGuide.ttl|0) <= 0) return;

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
			if(!r) continue;
			ctx.strokeRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
		}

		// gizmo
		if(sel.length > 0) {
			let frame = U.selectionFrame(sel);
			
			if(!frame) { 
				ctx.restore(); 
				
				if(tool == 'transform')
					this._drawPivotPoint();
				
				return; 
			}
			
			if(this.state.mode === 'scale' || this.state.mode === 'rotate') {
				frame = { cx: this.state.cx, cy: this.state.cy, theta: this.state.theta };
			}
			const obb = U.selectionOBB(sel, frame);
			if(obb) this._drawGizmo(frame, obb, px, ttool);
		}

		// marquee
		if(showMarquee) {
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
		
		if(tool == 'transform')
			this._drawPivotPoint();
	}

	_renderAlignGuidesScreen(ctx) {
		const g = this.state.alignGuide;
		if(!g) return;
		if((g.ttl|0) <= 0) return;

		const w = this.canvas.width, h = this.canvas.height;
		ctx.save();
		ctx.setTransform(1,0,0,1,0,0);
		ctx.lineWidth = 1;
		ctx.strokeStyle = '#0099ffff';

		if(Number.isFinite(g.v)) {
			ctx.beginPath(); ctx.moveTo(g.v, 0); ctx.lineTo(g.v, h); ctx.stroke();
		}
		if(Number.isFinite(g.h)) {
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

		if(showRotate || showScale) {
			ctx.strokeStyle = 'rgba(30,144,255,1)';
			ctx.setLineDash([]);
			ctx.strokeRect(minX, minY, w, h);
		}

		if(showScale) {
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

		if(showRotate) {
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

	_drawPivotPoint() {
		const ctx = this.ctx;
		if(!ctx) return;
	
		const objs = (_editor.selectedObjects || []).filter(o => o?.is2D);
		if(!objs.length) return;
	
		ctx.save();
	
		// Apply the same world-to-canvas projection as the rest of the scene
		this.d2drenderer.applyDeviceTransform(ctx);
	
		// Convert pixel sizes to world units so it stays the same size visually
		const rPx   = this.pivotPointRadius;
		const rW    = U.pxToWorld(this.d2drenderer, rPx);
		const lwW   = U.pxToWorld(this.d2drenderer, 2);
		const cross = U.pxToWorld(this.d2drenderer, rPx * 1.5); // same proportion as before
	
		ctx.lineWidth   = lwW;
		ctx.fillStyle   = '#ffffff';
		ctx.strokeStyle = '#0099ff';
	
		for (const obj of objs) {
			// pivot (local 0,0) in world space
			const Mw = U.worldMatrix(obj);
			const p  = U.applyMat(Mw, 0, 0);
	
			// --- circle ---
			ctx.beginPath();
			ctx.arc(p.x, p.y, rW, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
	
			// --- cross ---
			ctx.beginPath();
			ctx.moveTo(p.x - cross, p.y);
			ctx.lineTo(p.x + cross, p.y);
			ctx.moveTo(p.x, p.y - cross);
			ctx.lineTo(p.x, p.y + cross);
			ctx.stroke();
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
		// --- MIDDLE BUTTON: start panning ---
		if(_editor.tool == 'pan' || e.button === 1) {
			const ed = this.d2drenderer._editor;
			if(!ed) return;
		
			// get mouse in *canvas device pixels*
			const rect = this.canvas.getBoundingClientRect();
			const sx = this.canvas.width  / Math.max(rect.width,  1e-6);
			const sy = this.canvas.height / Math.max(rect.height, 1e-6);
			const cx = (e.clientX - rect.left) * sx;
			const cy = (e.clientY - rect.top)  * sy;
		
			this._pan.active = true;
			this._pan.x0 = cx;
			this._pan.y0 = cy;
			this._pan.vox = ed.viewOffset.x;
			this._pan.voy = ed.viewOffset.y;
		
			this.state.mode = 'pan';
			e.preventDefault();
			this._setCursorGrab(true);
			return;
		}
		
		if(e.button !== 0) return;
		
		if(_editor.tool == 'transform') {
			// --- pivot knob drag (takes precedence) ---
			const objs = (_editor.selectedObjects || []).filter(o => o?.is2D);
			if(objs.length === 1) {
				const obj = objs[0];
				if(this._hitPivotKnobWorld(e, obj)) {
		
					// double-click to center
					if(this.lastPivotClick) {
						if(
							_time.now - this.lastPivotClick.time < 0.4 &&
							obj === this.lastPivotClick.object
						) {
							const { cx, cy } = U.localBoundsCenter(obj);
							const res = U.repositionPivotTo(obj, cx, cy, { commit: true });
							if(res) {
								_editor?.addStep?.({
									name: 'Center 2D Pivot',
									undo: () => { obj.graphic2d._paths = U.clonePaths(res.before.paths);
												  obj.position.x = res.before.pos.x; obj.position.y = res.before.pos.y; obj.checkSymbols?.(); },
									redo: () => { obj.graphic2d._paths = U.clonePaths(res.after.paths);
												  obj.position.x = res.after.pos.x;  obj.position.y = res.after.pos.y;  obj.checkSymbols?.(); }
								});
							}
							return;
						}
					}
					this.lastPivotClick = { time: _time.now, object: obj };
		
					// Freeze world->local at mouse-down (stable local space during drag)
					const Mw0   = U.worldMatrix(obj);
					const inv0  = U.invert(Mw0);
					const mW    = U.eventToWorld(e, this.canvas, this.d2drenderer);
					const local = U.applyMat(inv0, mW.x, mW.y);
		
					const basePaths = U.clonePaths(obj?.graphic2d?._paths || []);
					const basePos   = { x: obj.position?.x || 0, y: obj.position?.y || 0 };
		
					this.state.pivotDrag = {
						active: true,
						obj,
						startLocal: { x: local.x, y: local.y },
						lastLocal:  { x: local.x, y: local.y },
						basePos,
						basePaths,
						inv0 // frozen inverse world->local
					};
		
					this.dragging = true; // ensure mouseup is seen
					this.canvas.style.cursor = 'grabbing';
					e.preventDefault();
					return;
				}
			}
		}
		
		if(this.d2drenderer.edit?.hoverPoint) return;

		const tool  = _editor.tool;
		const ttool = _editor.transformTool;
		const canSelect = tool === 'select' || tool === 'transform';
		if(!canSelect) return;
		
		this.clickTime = _time.now;
		
		const hit = this._hitGizmo(e, ttool);
		if(hit) {
			const p = U.eventToWorld(e, this.canvas, this.d2drenderer);
			this.state.start = p;
			this.state.last  = p;
			this._captureOriginals();
			this._captureStepStart();

			this.state.cx = hit.cx;
			this.state.cy = hit.cy;
			this.state.theta = hit.theta || 0;
			this.state.theta0 = this.state.theta;

			if(hit.type === 'scale' || hit.type === 'rotate') {
				const sel = _editor.selectedObjects.filter(o => o?.is2D);
				const obb = U.selectionOBB(sel, { cx: this.state.cx, cy: this.state.cy, theta: this.state.theta });
				if(obb) {
					this.state.hx0 = (obb.maxX - obb.minX) / 2;
					this.state.hy0 = (obb.maxY - obb.minY) / 2;
				}
			}

			if(hit.type === 'rotate') {
				this.state.mode = 'rotate';
				const lp = U.toFrameLocal(p.x, p.y, hit.cx, hit.cy, hit.theta);
				this.state.rotBase = Math.atan2(lp.y, lp.x);
				return;
			}
			if(hit.type === 'scale') {
				this.state.mode = 'scale';
				this.state.handle = hit.handle;
				this.state.p0L = U.toFrameLocal(p.x, p.y, hit.cx, hit.cy, hit.theta);
				return;
			}
		}

		this._handleSelection(e);
	}

	_onMove(e) {
		if(_editor.tool == 'transform') {
			// --- pivot dragging live update ---
			if (this.state.pivotDrag?.active) {
				const pd   = this.state.pivotDrag;
				const inv0 = pd.inv0; // frozen world->local
				const mW   = U.eventToWorld(e, this.canvas, this.d2drenderer);
				const curLocal = U.applyMat(inv0, mW.x, mW.y);
			
				// local delta since drag began
				const dx = curLocal.x - pd.startLocal.x;
				const dy = curLocal.y - pd.startLocal.y;
			
				// preview the change from base each frame (no drift)
				U.repositionPivotTo(pd.obj, dx, dy, {
					basePaths: pd.basePaths,
					basePos:   pd.basePos,
					commit:    false
				});
			
				pd.lastLocal = curLocal; // so mouseup can compute final Δ
				this.canvas.style.cursor = 'grabbing';
				e.preventDefault();
				return;
			}
		}
		
		if(!this.state.mode) return;

		const p = U.eventToWorld(e, this.canvas, this.d2drenderer);
		this.state.last = p;

		if(this.state.mode === 'marquee') return;
		if(this.state.mode === 'pan' && this._pan.active) {
			const ed = this.d2drenderer._editor;
			if(!ed) return;
		
			const rect = this.canvas.getBoundingClientRect();
			const sx = this.canvas.width  / Math.max(rect.width,  1e-6);
			const sy = this.canvas.height / Math.max(rect.height, 1e-6);
			const cx = (e.clientX - rect.left) * sx;
			const cy = (e.clientY - rect.top)  * sy;
		
			const dx = cx - this._pan.x0;
			const dy = cy - this._pan.y0;
		
			// content follows the hand (same direction as drag)
			ed.viewOffset.x = this._pan.vox + dx;
			ed.viewOffset.y = this._pan.voy + dy;
		
			e.preventDefault();
			this._setCursorGrab(true);
			return; // don't run gizmo logic while panning
		}
		if(this.state.mode === 'move') {
			const dWx = p.x - this.state.start.x;
			const dWy = p.y - this.state.start.y;
			
			if( (Math.abs(dWx) > 0 || Math.abs(dWy) > 0) && 
				_time.now - this.clickTime > 0.2 
			) {
				let addWorldX = 0, addWorldY = 0;
				
				if(_editor?.draw2d?.snapToObjects) {
					// cache selection rect baseline in canvas at gesture start
					const selObjs = _editor.selectedObjects.filter(o => o?.is2D);
					if(!this.state.startSelRectCanvas) {
						this.state.startSelRectCanvas = this._selectionRectCanvas(selObjs);
					}
					// cache guide lines from all 2D objects under focus (excluding selection)
					if(!this.state.guides) {
						this.state.guides = this._collectGuidesCanvas(_editor?.focus, new Set(selObjs));
					}
				
					const startRect = this.state.startSelRectCanvas;
					if(startRect) {
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
		}
		else if(this.state.mode === 'rotate') {
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
			const EPS = 1e-9; // only to avoid exact zero
		
			const isCorner = (handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br');
		
			if (isCorner && e.shiftKey) {
				// FREE RESIZE with mirroring allowed
				const s = this._cornerSigns(handle);
				sx = 1 + (dx * s.sx) / hx0;
				sy = 1 + (dy * s.sy) / hy0;
		
				// prevent exact zero (singular transform) but allow negative values
				if (Math.abs(sx) < EPS) sx = sx < 0 ? -EPS : EPS;
				if (Math.abs(sy) < EPS) sy = sy < 0 ? -EPS : EPS;
		
			} else if (isCorner) {
				// Existing uniform-from-corner behaviour
				const s = this._cornerSigns(handle);
				const vx = s.sx * hx0, vy = s.sy * hy0;
				const len0 = Math.hypot(vx, vy);
				const nx = vx / len0, ny = vy / len0;
				const proj = dx * nx + dy * ny;
				const k = 1 + proj / len0;
				sx = k; sy = k;
			} else {
				// Edge handles unchanged
				switch (handle) {
					case 'l': sx = 1 - dx / hx0; break;
					case 'r': sx = 1 + dx / hx0; break;
					case 't': sy = 1 - dy / hy0; break;
					case 'b': sy = 1 + dy / hy0; break;
				}
			}
		
			for (const [o, rec] of this.state.orig.entries()) {
				const scl = o.scale || (o.scale = { x:1, y:1, z:1 });
				scl.x = rec.scl0.x * sx;
				scl.y = rec.scl0.y * sy;
			}
		}
		_editor.updateInspector?.();
	}

	_onUp() {
		// Handle pivot drag first then normal drag
		if(this.state.pivotDrag?.active) {
			const pd = this.state.pivotDrag;
		
			// absolute local target for the pivot (frozen frame)
			const px = (pd.lastLocal?.x ?? pd.startLocal.x);
			const py = (pd.lastLocal?.y ?? pd.startLocal.y);
		
			const res = U.repositionPivotTo(pd.obj, px, py, {
				basePaths: pd.basePaths,
				basePos:   pd.basePos,
				commit:    true
			});
		
			if(res) {
				_editor.addStep?.({
					name: 'Move 2D Pivot',
					undo: () => {
						pd.obj.graphic2d._paths = U.clonePaths(res.before.paths);
						pd.obj.position.x = res.before.pos.x;
						pd.obj.position.y = res.before.pos.y;
						pd.obj.checkSymbols?.();
					},
					redo: () => {
						pd.obj.graphic2d._paths = U.clonePaths(res.after.paths);
						pd.obj.position.x = res.after.pos.x;
						pd.obj.position.y = res.after.pos.y;
						pd.obj.checkSymbols?.();
					}
				});
			}
		
			this.state.pivotDrag = null;
			this.dragging = false;
			if(_editor.tool != 'pan') this.canvas.style.cursor = 'default';
			return;
		}
		if(this.state.mode === 'marquee') {
			const a = this.state.start, b = this.state.last;
			const rect = U.rectFromPoints(a, b);
			const minPx = 6;
			const minWorld = U.pxToWorld(this.d2drenderer, minPx);
			const isRealMarquee = Math.max(rect.w, rect.h) >= minWorld;

			if(isRealMarquee) {
				const roots = this._marqueeRootsUnderFocus();
				const newlyHit = [];
				for (const r of roots) {
					if(r.__editorState?.locked || r.noSelect) continue;
					const bb = U.worldAABBDeep(r);
					if(!bb) continue;
					if(U.rectIntersectsAABB(rect, bb)) newlyHit.push(r);
				}
				if(!event?.shiftKey) _editor.setSelection([]);
				if(newlyHit.length) _editor.addSelection(newlyHit);
			}
		}

		if(!this.state.mode || this.state.mode === 'marquee') {
			this._resetGestureState();
			return;
		}
		// --- finish pan ---
		if(this._pan.active && this.state.mode === 'pan') {
			this._pan.active = false;
			this.state.mode = null;
			this._resetCursor();
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
			if(!prev) continue;

			const changed = [];
			if(prev.pos.x !== entry.pos.x || prev.pos.y !== entry.pos.y) changed.push('pos');
			if(prev.rot !== entry.rot) changed.push('rot');
			if(prev.scl.x !== entry.scl.x || prev.scl.y !== entry.scl.y) changed.push('scl');
			if(!changed.length) continue;

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
		const tool  = _editor.tool;
		const p = U.eventToWorld(e, this.canvas, this.d2drenderer);
		const hit = this._pickTop(p.x, p.y);
		const canMove = tool === 'select' || tool === 'transform';
		const sel = _editor.selectedObjects;

		// double-click to focus
		if(this.lastClick) {
			if(_time.now - this.lastClick.time < 0.4 && hit === this.lastClick.object) {
				_editor.focus = hit ?? _editor.focus?.parent;
				_editor.setSelection([]);
				this.lastClick = null;
				return;
			}
		}
		this.lastClick = { time: _time.now, object: hit };

		if(hit) {
			if(e.shiftKey) {
				if(sel.includes(hit)) _editor.removeSelection([hit]);
				else _editor.addSelection([hit]);
			} else {
				if(!sel.includes(hit)) _editor.setSelection([hit]);
			}

			if(canMove) {
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
			if(!e.shiftKey) _editor.setSelection([]);
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
		if(!sel.length) return null;

		const frame = U.selectionFrame(sel);
		if(!frame) return null;
		const obb = U.selectionOBB(sel, frame);
		if(!obb) return null;

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

		if(allowRotate) {
			const dist = Math.hypot(lp.x, lp.y);
			if(Math.abs(dist - rotRadius) <= knobR * 1.5)
				return { type:'rotate', cx, cy, theta };
		}

		if(allowScale) {
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
				if(Math.abs(lp.x - h.x) <= hs && Math.abs(lp.y - h.y) <= hs)
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
		if(!roots.length) return null;
		
		roots.sort((a, b) => (a.position?.z || 0) - (b.position?.z || 0));
		
		for (let i = roots.length - 1; i >= 0; --i) {
			const r = roots[i];
			if(r.__editorState?.locked || r.noSelect) continue;
			if(this._hitObjectDeep(r, wx, wy)) return r;
		}
		return null;
	}

	/* ========================= SNAP HELPERS (SCREEN/PIXEL SPACE) ========================= */

	_selectionRectCanvas(objs) {
		if(!objs || !objs.length) return null;
		let l = +Infinity, r = -Infinity, t = +Infinity, b = -Infinity;
		const Mv = U.viewMatrix(this.d2drenderer);

		for (const o of objs) {
			const bb = U.worldAABBDeep(o);
			if(!bb) continue;
			const corners = [
				{ x: bb.minX, y: bb.minY },
				{ x: bb.maxX, y: bb.minY },
				{ x: bb.maxX, y: bb.maxY },
				{ x: bb.minX, y: bb.maxY }
			];
			for (const c of corners) {
				const p = U.applyDOM(Mv, c.x, c.y);
				if(p.x < l) l = p.x; if(p.x > r) r = p.x;
				if(p.y < t) t = p.y; if(p.y > b) b = p.y;
			}
		}
		if(!Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(t) || !Number.isFinite(b)) return null;
		return { l, r, t, b, cx:(l+r)/2, cy:(t+b)/2 };
	}

	_objectRectCanvas(o) {
		const bb = U.worldAABBDeep(o);
		if(!bb) return null;
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
			if(p.x < l) l = p.x; if(p.x > r) r = p.x;
			if(p.y < t) t = p.y; if(p.y > b) b = p.y;
		}
		if(!Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(t) || !Number.isFinite(b)) return null;
		return { l, r, t, b, cx:(l+r)/2, cy:(t+b)/2 };
	}

	_collectGuidesCanvas(focus, excludeSet) {
		const xs = [];
		const ys = [];

		// canvas center lines
		const Mv = U.viewMatrix(this.d2drenderer);
		const W = _dimensions.width;
		const H = _dimensions.height;
		const centers = U.applyDOM(Mv, W * 0.5, H * 0.5);
		
		xs.push(centers.x);
		ys.push(centers.y);

		// gather all 2D descendants under focus (unique top-level roots like your existing helpers)
		const roots = new Set();
		const host = focus || this.d2drenderer.root;

		U.traverse2D(host, (node) => {
			if(!node?.is2D) return;
			let r = node;
			while (r.parent && r.parent !== host) r = r.parent;
			if(r?.is2D) roots.add(r);
		});

		for (const o of roots) {
			if(excludeSet?.has(o)) continue;
			if(o.__editorState?.locked || o.noSelect) continue;

			const rc = this._objectRectCanvas(o);
			if(!rc) continue;

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
				if(d < bestVDist && d <= snapPx) {
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
				if(d < bestHDist && d <= snapPx) {
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
	
	/* ============ cursor tracking for anchored zoom ============ */
	_onMouseTrack(e) {
		const rect = this.canvas.getBoundingClientRect();
		const sx = this.canvas.width  / Math.max(rect.width,  1e-6);
		const sy = this.canvas.height / Math.max(rect.height, 1e-6);
		this._mouseCanvasX = (e.clientX - rect.left) * sx;
		this._mouseCanvasY = (e.clientY - rect.top)  * sy;
	}
	
	/* ============ wheel: pan + trackpad pinch (ctrlKey) ============ */
	_onWheel(e) {
		const ed = this.d2drenderer._editor;
		if(!ed) return;
	
		if(e.ctrlKey || e.metaKey) {
			const factor = Math.exp(-0.0045 * e.deltaY); // sensitivity knob
			const rect = this.canvas.getBoundingClientRect();
			const sx = this.canvas.width  / Math.max(rect.width,  1e-6);
			const sy = this.canvas.height / Math.max(rect.height, 1e-6);
			const ax = (e.clientX - rect.left) * sx;      // cursor in canvas pixels
			const ay = (e.clientY - rect.top)  * sy;
	
			this._zoomByCombined(factor, ax, ay);
			e.preventDefault();
			return;
		}
	
		// two-finger scroll / mouse wheel → pan (unchanged)
		const unit = (e.deltaMode === 1) ? 16 : (e.deltaMode === 2) ? this.canvas.height : 1;
		const dx = e.deltaX * unit;
		const dy = e.deltaY * unit;
		ed.viewOffset.x -= dx;
		ed.viewOffset.y -= dy;
		e.preventDefault();
	}
	
	_onKeyDown(e) {
		if(!(e.ctrlKey || e.metaKey)) return;
	
		const code = e.code, key = e.key;
		if(code === 'NumpadAdd') {
			this._zoomStep(+1);
			e.preventDefault(); e.stopPropagation();
		}else 
		if(code === 'NumpadSubtract') {
			this._zoomStep(-1);
			e.preventDefault(); e.stopPropagation();
		}
	}
	
	_zoomStep(dir) {
		const step = 1.15;
		const factor = dir > 0 ? step : 1 / step;
		const ax = this.canvas.width  * 0.5;
		const ay = this.canvas.height * 0.5;
		this._zoomByCombined(factor, ax, ay);
	}
	
	_zoomByCombined(factor, anchorX, anchorY) {
		const ed = this.d2drenderer._editor;
		if(!ed) return;
	
		const MIN = 0.05, MAX = 64;
		const s0 = ed.viewScale;
		let   s1 = s0 * factor;
		if(s1 < MIN) s1 = MIN;
		if(s1 > MAX) s1 = MAX;
	
		// Combined offset at current scale (read-only reference)
		const Vc0 = this.d2drenderer.viewOffset; // { x, y } in canvas pixels
		const A = { x: anchorX, y: anchorY };
	
		// World point under the anchor BEFORE zoom
		const Wx = (A.x - Vc0.x) / s0;
		const Wy = (A.y - Vc0.y) / s0;
	
		// Combined offset we need AFTER zoom to keep A fixed
		const Vc1x = A.x - s1 * Wx;
		const Vc1y = A.y - s1 * Wy;
	
		// Apply ONLY the delta to the editor's offset (letterbox stays intact)
		const dVx = Vc1x - Vc0.x;
		const dVy = Vc1y - Vc0.y;
		ed.viewOffset.x += dVx;
		ed.viewOffset.y += dVy;
	
		ed.viewScale = s1;
	}

	/* ========================= PICK ROOTS ========================= */

	_marqueeRootsUnderFocus() {
		const roots = new Set();
		const focus = _editor.focus || this.d2drenderer.root;

		U.traverse2D(focus, (node) => {
			if(!node?.is2D) return;
			let r = node;
			while (r.parent && r.parent !== focus) r = r.parent;
			if(r?.is2D) roots.add(r);
		});

		return Array.from(roots);
	}
	
	// Focus the current 2D selection in view (pan+zoom)
	// opts: { padding:number=1.15, minWorldSize:number=0, clamp:[min,max]=[0.05,64] }
	focusSelected2D(opts = {}) {
		const padding = Number(opts.padding ?? 1.15);
		const minSize = Number(opts.minWorldSize ?? 0);
		const [MIN, MAX] = opts.clamp ?? [0.05, 64];
	
		const r  = this.d2drenderer;
		const ed = r?._editor;
		if(!r || !ed) return;
	
		// selection (world AABB)
		const sel = (window._editor?.selectedObjects || []).filter(o => o?.is2D);
		if(!sel.length) return;
	
		let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const o of sel) {
			const bb = U.worldAABBDeep(o);
			if(!bb) continue;
			if(bb.minX < minX) minX = bb.minX;
			if(bb.minY < minY) minY = bb.minY;
			if(bb.maxX > maxX) maxX = bb.maxX;
			if(bb.maxY > maxY) maxY = bb.maxY;
		}
		if(!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;
	
		// world size + center
		let w = Math.max(maxX - minX, minSize);
		let h = Math.max(maxY - minY, minSize);
		const cx = (minX + maxX) * 0.5;
		const cy = (minY + maxY) * 0.5;
	
		// device canvas size (backing store pixels)
		const cw = r.domElement.width;
		const ch = r.domElement.height;
		if(cw <= 0 || ch <= 0) return;
	
		// known factors
		const pr = r.pixelRatio || 1;
		const vt = r.viewScale || 1;        // total = base * editor
		const sEd0 = ed.viewScale || 1;
		const base = vt / sEd0;             // base = letterbox scale (unknown field, derived)
	
		// choose new editor scale so: pr * base * sEd * w <= cw/padding, similarly for h
		let sEd = Math.min(
			cw / (Math.max(w, 1e-6) * pr * base * padding),
			ch / (Math.max(h, 1e-6) * pr * base * padding)
		);
		if(!isFinite(sEd) || sEd <= 0) sEd = sEd0 || 1;
		sEd = Math.min(Math.max(sEd, MIN), MAX);
	
		// base letterbox offset (in device px) = combined - editor
		// r.viewOffset returns (baseOff + ed.viewOffset)
		const combinedOff = r.viewOffset;            // Vector2 (device px)
		const baseOff = combinedOff.clone().sub(ed.viewOffset);
	
		// place world center at canvas center A with total transform:
		// device = (baseOff + edOff) + (pr * base * sEd) * world
		const ax = cw * 0.5;
		const ay = ch * 0.5;
		const totalScale = pr * base * sEd;
	
		const edOffX = ax - totalScale * cx - baseOff.x;
		const edOffY = ay - totalScale * cy - baseOff.y;
	
		ed.viewScale   = sEd;
		ed.viewOffset.x = edOffX;
		ed.viewOffset.y = edOffY;
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
	
	_setCursorGrab(active) {
		const c = this.canvas;
		c.style.cursor = active ? 'grabbing' : 'grab';
	}
	
	_resetCursor() {
		this.canvas.style.cursor = '';
	}
	
	_hitPivotKnobWorld(e, obj) {
		// mouse in world coords
		const mW = U.eventToWorld(e, this.canvas, this.d2drenderer);
	
		// pivot (local 0,0) in world coords
		const Mw = U.worldMatrix(obj);
		const pW = U.applyMat(Mw, 0, 0);
	
		// compare in world units; knob radius is N pixels -> convert to world
		const rW = U.pxToWorld(this.d2drenderer, this.pivotPointRadius);
		const dx = pW.x - mW.x, dy = pW.y - mW.y;
		return (dx*dx + dy*dy) <= (rW * rW);
	}
}