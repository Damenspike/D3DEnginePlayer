// d2ddraw.js
import D2DFill from './d2dfill.js';
import * as U from './d2dutility.js';

export default class D2DDraw {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;

		// stroke state
		this.drawing = false;
		this.tool = null;
		this.localPoints = [];   // live points for the *current* path
		this.tempObj = null;

		// cursor
		this.cursor = null;       // canvas space (device px)
		this.cursorLocal = null;  // host-local

		// snapping
		this.snapPx = 10;
		this._snapHit = null;     // { kind, canvas:{x,y}, hostLocal:{x,y}, child, ... }
		this._snapCache = null;   // { entries:[{ child, toHost, vertices[], segments[] }] }
		this._lastFocus = null;

		// binds
		this._onDown = this._onDown.bind(this);
		this._onMove = this._onMove.bind(this);
		this._onUp   = this._onUp.bind(this);
		this._onBlur = this._onBlur.bind(this);
		this._onDbl  = this._onDbl.bind(this);
		this._onKey  = this._onKey.bind(this);

		// fill tool (unchanged)
		this._fill = new D2DFill(d2drenderer);

		this._attach();
	}

	/* =============== lifecycle =============== */
	destroy() { this._detach(); }

	_attach() {
		if (!this.canvas) return;
		this.canvas.addEventListener('mousedown', this._onDown, { passive:false });
		this.canvas.addEventListener('dblclick',  this._onDbl,  { passive:false });
		window.addEventListener('mousemove', this._onMove, { passive:false });
		window.addEventListener('mouseup',   this._onUp,   { passive:false });
		window.addEventListener('blur',      this._onBlur, { passive:false });
		window.addEventListener('keydown',   this._onKey,  { passive:false });
	}
	_detach() {
		if (!this.canvas) return;
		this.canvas.removeEventListener('mousedown', this._onDown);
		this.canvas.removeEventListener('dblclick',  this._onDbl);
		window.removeEventListener('mousemove', this._onMove);
		window.removeEventListener('mouseup',   this._onUp);
		window.removeEventListener('blur',      this._onBlur);
		window.removeEventListener('keydown',   this._onKey);
	}

	_isActive() {
		const t = _editor?.tool;
		return new Set(['brush','pencil','line','square','text','circle','polygon']).has(t);
	}
	_request() { 
		this.d2drenderer.render(); 
		_editor.updateInspector();
	}

	/* =============== snapping =============== */
	_rebuildSnapCache() {
		const children = _editor.focus.children;
		if (children.length === 0) { this._snapCache = null; return; }
		
		const hostNode = _editor.focus;
		const W_host = U.worldDOMMatrix(hostNode);
		const W_host_inv = W_host.inverse();

		const entries = [];
		for (const child of children) {
			const paths = Array.isArray(child.graphic2d?._paths) ? child.graphic2d._paths : [];
			if (paths.length < 1) continue;

			const W_child  = U.worldDOMMatrix(child);
			const toHost   = W_host_inv.multiply(W_child);   // child → host
			const toCanvas = U.childScreenMatrix(this.d2drenderer, child); // child → canvas
			const toCanvasPt = (p) => {
				const q = new DOMPoint(p.x, p.y).matrixTransform(toCanvas);
				return { x:q.x, y:q.y };
			};

			const vertices = []; // {pidx,i, local, canvas}
			const segments = []; // {pidx,i0,i1, aLocal,bLocal, aCanvas,bCanvas}
			for (let pidx = 0; pidx < paths.length; pidx++) {
				const path = paths[pidx] || [];
				if (path.length === 0) continue;

				for (let i = 0; i < path.length; i++) {
					const p = path[i];
					vertices.push({ pidx, i, local:{x:p.x,y:p.y}, canvas:toCanvasPt(p) });
				}

				const closed = U.isClosedPoints(path);
				const count  = closed ? path.length : Math.max(0, path.length - 1);
				for (let i = 0; i < count; i++) {
					const i0 = i;
					const i1 = (i + 1) % path.length;
					const a = { x:path[i0].x, y:path[i0].y };
					const b = { x:path[i1].x, y:path[i1].y };
					segments.push({
						pidx, i0, i1,
						aLocal:a, bLocal:b,
						aCanvas:toCanvasPt(a), bCanvas:toCanvasPt(b)
					});
				}
			}

			if (vertices.length || segments.length)
				entries.push({ child, toHost, vertices, segments });
		}

		this._snapCache = entries.length ? { entries } : null;
		this._lastFocus = _editor?.focus || null;
	}

	_snap(mouseCanvas) {
		if(!_editor.draw2d.snapToPoints) return;

		if (!this._snapCache || this._lastFocus !== (_editor?.focus || null)) {
			this._rebuildSnapCache();
		}
		const cache = this._snapCache;
		if (!cache) return null;

		const thresh2 = this.snapPx * this.snapPx;

		// 1) vertex
		let out = null, bestD2 = Infinity;
		for (const E of cache.entries) {
			for (const v of E.vertices) {
				const dx = mouseCanvas.x - v.canvas.x;
				const dy = mouseCanvas.y - v.canvas.y;
				const d2 = dx*dx + dy*dy;
				if (d2 <= thresh2 && d2 < bestD2) {
					const h = new DOMPoint(v.local.x, v.local.y).matrixTransform(E.toHost);
					out = { kind:'vertex', child:E.child, pidx:v.pidx, i:v.i, canvas:{...v.canvas}, hostLocal:{ x:h.x, y:h.y } };
					bestD2 = d2;
				}
			}
		}
		if (out) return out;

		// 2) midpoint
		out = null; bestD2 = Infinity;
		for (const E of cache.entries) {
			for (const s of E.segments) {
				const midL = { x:(s.aLocal.x+s.bLocal.x)/2, y:(s.aLocal.y+s.bLocal.y)/2 };
				const midC = { x:(s.aCanvas.x+s.bCanvas.x)/2, y:(s.aCanvas.y+s.bCanvas.y)/2 };
				const dx = mouseCanvas.x - midC.x;
				const dy = mouseCanvas.y - midC.y;
				const d2 = dx*dx + dy*dy;
				if (d2 <= thresh2 && d2 < bestD2) {
					const h = new DOMPoint(midL.x, midL.y).matrixTransform(E.toHost);
					out = { kind:'mid', child:E.child, pidx:s.pidx, a:s.i0, b:s.i1, canvas:midC, hostLocal:{ x:h.x, y:h.y } };
					bestD2 = d2;
				}
			}
		}
		if (out) return out;

		// 3) projection
		out = null; bestD2 = Infinity;
		for (const E of cache.entries) {
			for (const s of E.segments) {
				const ax=s.aCanvas.x, ay=s.aCanvas.y;
				const bx=s.bCanvas.x, by=s.bCanvas.y;
				const vx=bx-ax, vy=by-ay, wx=mouseCanvas.x-ax, wy=mouseCanvas.y-ay;
				const v2=vx*vx+vy*vy || 1;
				let t=(vx*wx+vy*wy)/v2;
				if (t<0 || t>1) continue;
				const px=ax+t*vx, py=ay+t*vy;
				const dx=mouseCanvas.x-px, dy=mouseCanvas.y-py;
				const d2=dx*dx+dy*dy;
				if (d2 <= thresh2 && d2 < bestD2) {
					const l = { x: s.aLocal.x + t*(s.bLocal.x - s.aLocal.x),
								y: s.aLocal.y + t*(s.bLocal.y - s.aLocal.y) };
					const h = new DOMPoint(l.x, l.y).matrixTransform(E.toHost);
					out = { kind:'seg', child:E.child, pidx:s.pidx, a:s.i0, b:s.i1, t, canvas:{x:px,y:py}, hostLocal:{ x:h.x, y:h.y } };
					bestD2 = d2;
				}
			}
		}
		return out;
	}

	/* =============== events =============== */
	_onDown(e) {
		if (!this._isActive()) return;
		e.preventDefault();
	
		this.tool = _editor.tool;
		this._snapCache = null;
	
		const c = U.mouseToCanvas(this.canvas, e);
		this.cursor = c;
	
		const s = this._snap(c);
		const p = s ? { x:s.hostLocal.x, y:s.hostLocal.y } : U.canvasToLocal(this.d2drenderer, _editor.focus, c);
		this.cursorLocal = p;
		this._snapHit = s || null;
	
		// polygon: click-to-add path vertices + near-start auto-close
		if (this.tool === 'polygon') {
			const closeEnabled = !!_editor?.draw2d?.closePolygon;
			const tolPx = Math.max(6, Number(_editor?.draw2d?.closePx || 10));
			const pr = this.d2drenderer?.pixelRatio || 1;
			const vs = this.d2drenderer?.viewScale || 1;
			const tolLocal = tolPx / (pr * vs);
	
			if (!this.drawing) {
				this.drawing = true;
				this.localPoints = [{ x:p.x, y:p.y }];
				this._ensureTemp().then(()=>{
					if (this.tempObj) this.tempObj.visible = false;
					this._updateTempGraphic(true);
					this._request();
				});
				return;
			}
	
			// already drawing
			const baseOpen = U.logicalPoints ? U.logicalPoints(this.localPoints) : this.localPoints.slice();
			if (closeEnabled && baseOpen.length >= 2) {
				const start = baseOpen[0];
				const dx = p.x - start.x;
				const dy = p.y - start.y;
				if ((dx * dx + dy * dy) <= tolLocal * tolLocal) {
					// auto-complete
					const pathCand = baseOpen.length >= 3 ? baseOpen : baseOpen.concat([{ x:p.x, y:p.y }]);
					this.localPoints = U.cleanAndClose(pathCand);
					this._finalizeShape();
					return;
				}
			}
	
			// otherwise just add vertex
			this.localPoints.push({ x:p.x, y:p.y });
			this._updateTempGraphic();
			this._request();
			return;
		}
	
		// all other tools
		this.drawing = true;
		this.localPoints = [{ x:p.x, y:p.y }];
		if (['line','square','text','circle'].includes(this.tool)) {
			this.localPoints.push({ x:p.x, y:p.y });
		}
		this._ensureTemp().then(()=>{
			if (this.tempObj) this.tempObj.visible = false;
			this._updateTempGraphic(true);
			this._request();
		});
	}

	_onMove(e) {
		const c = U.mouseToCanvas(this.canvas, e);
		this.cursor = c;

		const s = this._snap(c);
		if (s) { this._snapHit = s; this.cursorLocal = { x:s.hostLocal.x, y:s.hostLocal.y }; }
		else   { this._snapHit = null; this.cursorLocal = U.canvasToLocal(this.d2drenderer, _editor.focus, c); }

		if (!this.drawing) { this._request(); return; }

		if (this.tool === 'polygon') {
			this._updateTempGraphic(); this._request(); return;
		}

		if (['line','square','text','circle'].includes(this.tool)) {
			this.localPoints[1] = { x:this.cursorLocal.x, y:this.cursorLocal.y };
		} else {
			// pixel-aware sampling while drawing
			const last = this.localPoints[this.localPoints.length - 1];
			const minStepLocal = U.pxToLocalScalar(this.d2drenderer, (this.tool === 'brush' ? 0.75 : 1.25));
			if (!last || U.dist2D(last, this.cursorLocal) >= (minStepLocal * minStepLocal)) {
				this.localPoints.push({ x:this.cursorLocal.x, y:this.cursorLocal.y });
			}
		}
		this._updateTempGraphic();
		this._request();
	}

	_onUp() {
		if (!this.drawing) return;
		if (this.tool === 'polygon') { this._request(); return; }
		this._finalizeShape();
	}

	_onDbl(e) {
		if (!this.drawing || this.tool !== 'polygon') return;
		e.preventDefault();
		if (this.localPoints.length >= 3) {
			const a = this.localPoints[0];
			const b = this.localPoints[this.localPoints.length - 1];
			if (!U.approxPt(a, b)) this.localPoints.push({ x:a.x, y:a.y });
		}
		this._finalizeShape();
	}

	_onBlur() {
		if (this.drawing && this.tool !== 'polygon') this._finalizeShape();
	}
	_onKey(e) {
		if (e.key === 'Escape' && this.drawing && this.tool === 'polygon') {
			e.preventDefault();
			this.drawing = false;
			this.localPoints = [];
			if (this.tempObj) { this.tempObj.delete?.(); this.tempObj = null; }
			this._request();
		}
	}

	/* =============== temp & finalize =============== */
	async _ensureTemp() {
		const host = _editor.focus;
		let name = 'Draw 2D';
		if (this.tool === 'brush')   name = 'brush stroke';
		if (this.tool === 'pencil')  name = 'pencil stroke';
		if (this.tool === 'line')    name = 'line';
		if (this.tool === 'square')  name = 'rectangle';
		if (this.tool === 'circle')  name = 'ellipse';
		if (this.tool === 'polygon') name = 'polygon';
		if (this.tool === 'text')  	 name = 'text';
		
		if(this.tool == 'text')
			_editor.draw2d.subtract = false;

		if(_editor.draw2d.subtract) name += ' erase';

		const props = { _paths: [[]] }; // single working path
		// styles
		props.fill = !!_editor.draw2d?.fill;
		props.line = !!_editor.draw2d?.line;
		props.fillColor  = _editor.draw2d?.fillColor || '#000000ff';
		props.lineColor  = _editor.draw2d?.lineColor || '#ffffffff';
		props.lineWidth  = Math.max(1, Number(_editor.draw2d?.lineWidth ?? 1));
		props.lineCap    = 'round';
		props.lineJoin   = 'round';
		props.miterLimit = Math.max(1, Number(_editor.draw2d?.miterLimit ?? 10));
		props.borderRadius = _editor.draw2d?.borderRadius;
		props.subtract = _editor.draw2d?.subtract;
		
		if(this.tool == 'text') {
			props.line = true;
			props.lineWidth = 1;
			props.fill = false;
		}

		const components = [{ type:'Graphic2D', properties: props }];
		this.tempObj = await host.createObject({ name, components });
		this.tempObj.depth = host.getNextHighestDepth();
	}

	_updateTempGraphic(initial=false) {
		const obj = this.tempObj; if (!obj) return;

		const setPath = (pts) => { obj.graphic2d._paths = [pts]; };

		if (this.tool === 'brush') {
			const live = this.localPoints.length > 2
				? U.simplifyAdaptive(this.d2drenderer, this.localPoints, { tool:'brush', simplifyPx: 1.0, minStepPx: 0.75 })
				: this.localPoints;
			const r = Math.max(0.1, Number(_editor.draw2d?.brushRadius ?? 1));
			setPath(U.strokeToPolygon(live, r, /*allowCircle*/ initial));
			obj.graphic2d.fillColor = _editor.draw2d?.fillColor || obj.graphic2d.fillColor;

		} else if (this.tool === 'pencil') {
			setPath(this.localPoints.map(p=>({x:p.x,y:p.y})));
			obj.graphic2d.lineWidth = Math.max(1, Number(_editor.draw2d?.lineWidth ?? obj.graphic2d.lineWidth ?? 1));
			obj.graphic2d.lineColor = _editor.draw2d?.lineColor || obj.graphic2d.lineColor;

		} else if (this.tool === 'line') {
			setPath(this.localPoints.slice(0,2).map(p=>({x:p.x,y:p.y})));
			obj.graphic2d.lineWidth = Math.max(1, Number(_editor.draw2d?.lineWidth ?? obj.graphic2d.lineWidth ?? 1));
			obj.graphic2d.lineColor = _editor.draw2d?.lineColor || obj.graphic2d.lineColor;

		} else if (this.tool === 'square' || this.tool === 'text') {
			if (this.localPoints.length >= 2) {
				const a=this.localPoints[0], b=this.localPoints[1];
				setPath(U.makeRectPoints(a,b));
			}

		} else if (this.tool === 'circle') {
			if (this.localPoints.length >= 2) {
				const a=this.localPoints[0], b=this.localPoints[1];
				setPath(U.makeEllipsePoints(a,b,64));
			}

		} else if (this.tool === 'polygon') {
			const pts = this.localPoints.slice();
			if (this.cursorLocal) pts.push({ x:this.cursorLocal.x, y:this.cursorLocal.y });
			setPath(pts);
		}
		obj.invalidateGraphic2D?.();
	}

	_finalizeShape() {
		// stop live draw
		this.drawing = false;
		const obj = this.tempObj; this.tempObj = null;
		if (!obj) return;
		
		const isStrokeTool  = (this.tool === 'brush' || this.tool === 'pencil');
		const isDragTool    = (this.tool === 'line' || this.tool === 'square' || this.tool === 'text' || this.tool === 'circle');
		
		// ---------- degenerate guard ----------
		if (isStrokeTool) {
			// for brush/pencil: only bail if we never really moved
			if (this.localPoints.length < 2) {
				obj.delete?.();
				this._request();
				_editor.updateInspector();
				return;
			}
		} else if (isDragTool) {
			// drag-based tools: use start/end distance
			const a = this.localPoints[0];
			const b = this.localPoints[1];
			if (!a || !b) {
				obj.delete?.();
				this._request();
				_editor.updateInspector();
				return;
			}
			
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			
			const minLocal = U.pxToLocalScalar
				? U.pxToLocalScalar(this.d2drenderer, 2) // ~2px drag
				: 0.5;
			const minSq = minLocal * minLocal;
			
			if ((dx * dx + dy * dy) < minSq) {
				obj.delete?.();
				this._request();
				_editor.updateInspector();
				return;
			}
		}
		// ---------- end degenerate guard ----------
		
		obj.visible = true;

		// style snapshot
		const s = _editor.draw2d || {};
		const wantFill = s.fill !== false;
		const wantLine = s.line !== false;
		const lw = Math.max(1, Number(s.lineWidth ?? 1));
		const br = s.borderRadius;
		const closePolygon = s.closePolygon;

		// freehand simplify
		if (['brush','pencil'].includes(this.tool) && this.localPoints.length > 2) {
			this.localPoints = U.simplifyAdaptive(this.d2drenderer, this.localPoints, { tool: this.tool });
		}

		// finalize per tool → single path
		let path = [];
		if (this.tool === 'brush') {
			const r = Math.max(0.1, Number(s.brushRadius ?? 1));
			path = U.strokeToPolygon(this.localPoints, r, /*allowCircle*/ false);
		} else if (this.tool === 'pencil') {
			path = this.localPoints.map(p => ({ x:p.x, y:p.y }));
		} else if (this.tool === 'line') {
			path = this.localPoints.slice(0,2).map(p => ({ x:p.x, y:p.y }));
		} else if ((this.tool === 'square' || this.tool === 'text') && this.localPoints.length >= 2) {
			path = U.makeRectPoints(this.localPoints[0], this.localPoints[1]);
		} else if (this.tool === 'circle' && this.localPoints.length >= 2) {
			path = U.makeEllipsePoints(this.localPoints[0], this.localPoints[1], 64);
		} else if (this.tool === 'polygon') {
			const simp = U.simplifyAdaptive(
				this.d2drenderer,
				this.localPoints,
				{ tool: 'pencil', simplifyPx: 1.75, minStepPx: 1.0 }
			);
			
			// Ensure the working array is OPEN (no trailing duplicate)
			const baseOpen = U.logicalPoints(simp); // strips last==first if present
			
			if (closePolygon) {
				path = U.cleanAndClose(baseOpen);
			} else {
				// keep it open
				path = baseOpen.map(p => ({ x: p.x, y: p.y }));
			}
		}
		
		// if fill requested, ensure closed
		if (wantFill && closePolygon) path = U.cleanAndClose(path);

		// apply geometry + style
		obj.graphic2d._paths = [path];
		obj.graphic2d.fill = wantFill;
		obj.graphic2d.line = wantLine;
		obj.graphic2d.lineWidth  = lw;
		obj.graphic2d.lineColor  = s.lineColor || obj.graphic2d.lineColor || '#ffffffff';
		obj.graphic2d.lineCap    = s.lineCap   || obj.graphic2d.lineCap   || 'round';
		obj.graphic2d.lineJoin   = s.lineJoin  || obj.graphic2d.lineJoin  || 'round';
		obj.graphic2d.miterLimit = Math.max(1, Number(s.miterLimit ?? obj.graphic2d.miterLimit ?? 10));
		obj.graphic2d.fillColor  = s.fillColor || obj.graphic2d.fillColor || '#000000ff';
		obj.graphic2d.borderRadius = br;
		obj.graphic2d.subtract = s.subtract;
		
		if(this.tool === 'text') {
			// apply text
			obj.addComponent('Text2D', {}, {
				doUpdateAll: true, 
				removeIfPresent: false, 
				unshift: true
			});
			obj.graphic2d.line = false;
			obj.graphic2d.fill = false;
		}

		obj.invalidateGraphic2D?.();
		const paths = obj?.graphic2d?._paths || [];
		if (paths.length === 0 || (paths[0]?.length || 0) === 0) { obj.delete?.(); this._request(); return; }

		// -------- boolean subtract pathway --------
		if (s.subtract) {
		  const focus = _editor.focus;
		  const parentCandidate = focus?.parent;
		  const parentIs2D = parentCandidate?.is2D && Array.isArray(parentCandidate.graphic2d?._paths);
		  const focusIs2D  = focus?.is2D && Array.isArray(focus.graphic2d?._paths);
		  const target = parentIs2D ? parentCandidate : (focusIs2D ? focus : null);
		  if (!target) { obj.delete?.(); this.tempObj = null; this._request(); return; }

		  // cutter polygon (ensure valid)
		  let cutter = U.cleanAndClose(path);
		  const closed = U.isClosedPoints(cutter);
		  if (!closed) {
			const half = Math.max(0.1, (lw || 1) * 0.5);
			cutter = U.strokeToPolygon(path, half, false);
			cutter = U.cleanAndClose(cutter);
		  }
		  if (cutter.length < 4 || Math.abs(U.signedArea(cutter)) < 1e-9) {
			obj.delete?.(); this.tempObj = null; this._request(); return;
		  }

		  // before
		  const before = [{ obj: target, paths: (target.graphic2d._paths || []).map(p => p.map(q => ({ x:q.x, y:q.y })))}];

		  // subtract
		  const newPaths = U.diffPathsByCutter(target.graphic2d._paths || [], cutter);
		  target.graphic2d._paths = newPaths;
		  target.invalidateGraphic2D?.();
		  target.checkSymbols?.();

		  // remove eraser temp
		  obj.delete?.(); this.tempObj = null;

		  // after
		  const after = [{ obj: target, paths: (target.graphic2d._paths || []).map(p => p.map(q => ({ x:q.x, y:q.y })))}];

		  // history
		  if (_editor?.addStep) {
			_editor.addStep({
			  label: 'Subtract 2D',
				 undo: () => {
					for (const s of before) {
						s.obj.graphic2d._paths = s.paths.map(p => p.map(q => ({ x:q.x, y:q.y })));
						s.obj.invalidateGraphic2D?.();
						s.obj.checkSymbols?.();
					}
				},
				redo: () => {
					for (const s of after) {
						s.obj.graphic2d._paths = s.paths.map(p => p.map(q => ({ x:q.x, y:q.y })));
						s.obj.invalidateGraphic2D?.();
						s.obj.checkSymbols?.();
					}
				}
			});
		  }

		  _editor.setSelection([target]);
		  this._request();
		  return;
		}
		// -------- end subtract pathway --------

		// center origin for intuitive transforms
		U.centerObject(obj);

		// history (normal draw)
		if (_editor?.addStep) {
			const host = _editor.focus;
			const name = obj.name || 'Draw 2D';
			const props = { ...(obj.graphic2d || {}) };
			props._paths = (obj.graphic2d?._paths || []).map(path => path.map(p => ({ x:p.x, y:p.y })));
			const components = [{ type:'Graphic2D', properties: props }];
			let keep = obj;

			const undo = async () => { keep?.delete?.(); };
			const redo = async () => {
				if (keep && keep.parent) return;
				keep = await host.createObject({ name, components });
				keep.position = { x: obj.position.x, y: obj.position.y, z: obj.position.z || 0 };
				keep.invalidateGraphic2D?.();
				_editor.setSelection([keep]);
			};
			_editor.addStep({ label:'Draw 2D', undo, redo });
		}

		_editor.setSelection([obj]);
		this._request();
	}

	/* =============== overlay render (preview + gizmos) =============== */
	render() {
		if (!this._isActive()) return;
		const ctx = this.ctx; if (!ctx) return;

		const tool   = _editor.tool;
		const fc     = U.hex8(_editor.draw2d?.fillColor || '#000000ff', 'rgba(0,0,0,1)');
		const lc     = U.hex8(_editor.draw2d?.lineColor || '#ffffffff', 'rgba(255,255,255,1)');
		const radius = Math.max(0.1, Number(_editor.draw2d?.brushRadius ?? 1));
		const lw     = Math.max(1, Number(_editor.draw2d?.lineWidth ?? 1));
		const br     = Math.max(0, Number(_editor.draw2d?.borderRadius ?? 0));

		const pr = this.d2drenderer.pixelRatio || 1;
		const vs = this.d2drenderer.viewScale  || 1;
		const strokePx = lw * pr * vs;

		const wantFill = _editor.draw2d?.fill !== false && tool !== 'text';
		const wantLine = _editor.draw2d?.line !== false;

		// LOCAL-SPACE helpers
		const isClosedLocal = (pts) => U.isClosedPoints(pts);
		const rawPathLocal = (pts) => {
			const p = new Path2D();
			if (!pts?.length) return p;
			p.moveTo(pts[0].x, pts[0].y);
			for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
			if (isClosedLocal(pts)) p.closePath();
			return p;
		};
		const roundedPathLocal = (pts, borderRadius) => {
			if (!pts || pts.length < 3) return null;
			if (!isClosedLocal(pts) || borderRadius <= 0) return null;
			const base = pts.slice(0, -1);
			const count = base.length;
			if (count < 3) return null;
			const get = i => base[(i + count) % count];
			const p = new Path2D();
			for (let i = 0; i < count; i++) {
				const p0 = get(i - 1);
				const p1 = get(i);
				const p2 = get(i + 1);
				const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
				const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
				const len1 = Math.hypot(v1x, v1y) || 1;
				const len2 = Math.hypot(v2x, v2y) || 1;
				const r = Math.min(borderRadius, len1 / 2, len2 / 2);
				const inX  = p1.x - (v1x / len1) * r;
				const inY  = p1.y - (v1y / len1) * r;
				const outX = p1.x + (v2x / len2) * r;
				const outY = p1.y + (v2y / len2) * r;
				if (i === 0) p.moveTo(inX, inY);
				else p.lineTo(inX, inY);
				p.quadraticCurveTo(p1.x, p1.y, outX, outY);
			}
			p.closePath();
			return p;
		};
		const toCanvasPath = (localPath) => {
			const M = U.hostScreenMatrix(this.d2drenderer, _editor.focus);
			const pc = new Path2D();
			pc.addPath(localPath, M);
			return pc;
		};
		const drawFillAndStroke = (canvasPath) => {
			if (wantFill) { ctx.fillStyle = fc; ctx.fill(canvasPath); }
			if (wantLine) {
				let lpx = (this.tool == 'text') ? 1 : strokePx;
				ctx.lineWidth = lpx;
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';
				ctx.strokeStyle = lc;
				ctx.stroke(canvasPath);
			}
		};

		ctx.save();
		ctx.setTransform(1,0,0,1,0,0);

		// live preview
		if (this.drawing && this.localPoints.length > 0) {
			if (tool === 'brush') {
				const live = this.localPoints.length > 2
					? U.simplifyAdaptive(this.d2drenderer, this.localPoints, { tool:'brush', simplifyPx: 1.0, minStepPx: 0.75 })
					: this.localPoints;
				const polyLocal = U.strokeToPolygon(live, radius, true);
				if (polyLocal.length > 1) {
					const rawL = rawPathLocal(polyLocal);
					const roundL = roundedPathLocal(polyLocal, br);
					const pathC = toCanvasPath(roundL || rawL);
					drawFillAndStroke(pathC);
				}
			} else if (tool === 'pencil') {
				if (this.localPoints.length > 1) {
					const pts = this.localPoints.map(p => U.localToCanvas(this.d2drenderer, _editor.focus, p));
					ctx.beginPath();
					ctx.moveTo(pts[0].x, pts[0].y);
					for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
					ctx.lineCap='round'; ctx.lineJoin='round';
					ctx.lineWidth = strokePx;
					ctx.strokeStyle = lc;
					ctx.stroke();
				}
			} else if (tool === 'line') {
				if (this.localPoints.length >= 2) {
					const a = U.localToCanvas(this.d2drenderer, _editor.focus, this.localPoints[0]);
					const b = U.localToCanvas(this.d2drenderer, _editor.focus, this.localPoints[1]);
					ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
					ctx.lineCap='round'; ctx.lineJoin='round';
					ctx.lineWidth = strokePx;
					ctx.strokeStyle = lc;
					ctx.stroke();
				}
			} else if (tool === 'square') {
				if (this.localPoints.length >= 2) {
					const polyLocal = U.makeRectPoints(this.localPoints[0], this.localPoints[1]);
					const rawL = rawPathLocal(polyLocal);
					const roundL = roundedPathLocal(polyLocal, br);
					const pathC = toCanvasPath(roundL || rawL);
					drawFillAndStroke(pathC);
				}
			} else if (tool === 'text') {
				if (this.localPoints.length >= 2) {
					const polyLocal = U.makeRectPoints(this.localPoints[0], this.localPoints[1]);
					const rawL      = rawPathLocal(polyLocal);
					const roundL    = roundedPathLocal(polyLocal, br);
					const pathC     = toCanvasPath(roundL || rawL);
			
					// inverted outline for text box
					ctx.save();
					ctx.globalCompositeOperation = 'difference';
					ctx.lineWidth = 1;           // or strokePx if you want it thicker
					ctx.lineCap   = 'round';
					ctx.lineJoin  = 'round';
					ctx.strokeStyle = '#ffffff'; // white in 'difference' = invert
					ctx.stroke(pathC);
					ctx.restore();
				}
			} else if (tool === 'circle') {
				if (this.localPoints.length >= 2) {
					const polyLocal = U.makeEllipsePoints(this.localPoints[0], this.localPoints[1], 48);
					const rawL = rawPathLocal(polyLocal);
					const roundL = roundedPathLocal(polyLocal, br);
					const pathC = toCanvasPath(roundL || rawL);
					drawFillAndStroke(pathC);
				}
			} else if (tool === 'polygon') {
				const ptsL = this.localPoints.slice();
				if (this.cursorLocal) ptsL.push({ x:this.cursorLocal.x, y:this.cursorLocal.y });
				if (ptsL.length > 1) {
					const pathL = rawPathLocal(ptsL);
					const pathC = toCanvasPath(pathL);
					const previewPx = (_editor?.draw2d?.previewWidthPx ?? 3);

					// halo
					ctx.save();
					ctx.globalCompositeOperation = 'source-over';
					ctx.lineWidth = previewPx + 2;
					ctx.lineCap = 'round';
					ctx.lineJoin = 'round';
					ctx.strokeStyle = 'rgba(0,0,0,0.6)';
					ctx.stroke(pathC);
					ctx.restore();

					// invert
					ctx.save();
					ctx.globalCompositeOperation = 'difference';
					ctx.lineWidth = previewPx;
					ctx.lineCap = 'round';
					ctx.lineJoin = 'round';
					ctx.strokeStyle = '#ffffff';
					ctx.stroke(pathC);
					ctx.restore();
				}
			}
		}

		// cursor gizmo
		if (this.cursor) {
			const isCrosshairTool =
				tool === 'text' ||
				tool === 'square' ||
				tool === 'polygon' ||
				tool === 'circle';
				
			const m = isCrosshairTool ? 1 : 0.5;
			const r = Math.max(1, _editor.draw2d?.lineWidth ?? 1) * m * (pr * vs);
		
			const x = this.cursor.x;
			const y = this.cursor.y;
		
			ctx.save();
			ctx.globalCompositeOperation = 'difference';
			ctx.strokeStyle = 'white'; // XOR → invert
			ctx.lineWidth = 2;
		
			ctx.beginPath();
		
			if (isCrosshairTool) {
				// crosshair
				ctx.moveTo(x - r, y);
				ctx.lineTo(x + r, y);
				ctx.moveTo(x, y - r);
				ctx.lineTo(x, y + r);
			} else {
				// circle (brush etc)
				ctx.arc(x, y, r, 0, Math.PI * 2);
			}
		
			ctx.stroke();
			ctx.restore();
		}

		// snap gizmo
		if (this._snapHit?.canvas) {
			const s=this._snapHit.canvas;
			ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI*2);
			ctx.lineWidth=2; ctx.strokeStyle='#37e3ff'; ctx.stroke();
			ctx.beginPath(); ctx.arc(s.x, s.y, 2, 0, Math.PI*2);
			ctx.fillStyle='#37e3ff'; ctx.fill();
		}

		ctx.restore();
	}
}

/* ==================== helpers updated for _paths ==================== */

export function mergeGraphic2Ds(graphics) {
	if (!Array.isArray(graphics) || graphics.length === 0) return null;

	const items = graphics.filter(g => g && Array.isArray(g._paths));
	if (items.length === 0) return null;

	const cloneGraphic = g => ({
		...g,
		_paths: (g._paths || []).map(path => path.map(p => ({ x:p.x, y:p.y })))
	});
	const pick = (a, b, k) => (b?.[k] !== undefined ? b[k] : a?.[k]);

	const mergePair = (A, B) => {
		if (!A) return cloneGraphic(B);
		if (!B) return cloneGraphic(A);

		const a = cloneGraphic(A);
		const b = cloneGraphic(B);
		const aFill = !!a.fill, bFill = !!b.fill;
		const aLine = !!a.line, bLine = !!b.line;

		// for path-based graphics without boolean ops, we just concatenate path lists
		const mergedPaths = (a._paths || []).concat(b._paths || []);

		return {
			fill: aFill || bFill,
			line: aLine || bLine,
			fillColor: pick(a, b, 'fillColor'),
			lineColor: pick(a, b, 'lineColor'),
			lineWidth: pick(a, b, 'lineWidth'),
			lineCap: pick(a, b, 'lineCap'),
			lineJoin: pick(a, b, 'lineJoin'),
			miterLimit: pick(a, b, 'miterLimit'),
			borderRadius: pick(a, b, 'borderRadius'),
			_paths: mergedPaths
		};
	};

	return items.reduce((acc, g) => mergePair(acc, g), null);
}

export function centerGraphic2DObject(obj) {
	if (!obj || !obj.graphic2d) return null;
	const paths = Array.isArray(obj.graphic2d._paths) ? obj.graphic2d._paths : [];
	if (paths.length === 0) return null;

	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (const path of paths) {
		for (const p of path) {
			const x = Number(p.x) || 0;
			const y = Number(p.y) || 0;
			if (x < minx) minx = x;
			if (y < miny) miny = y;
			if (x > maxx) maxx = x;
			if (y > maxy) maxy = y;
		}
	}
	if (!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) return null;

	const cx = (minx + maxx) * 0.5;
	const cy = (miny + maxy) * 0.5;

	for (const path of paths) for (const p of path) { p.x -= cx; p.y -= cy; }

	obj.position = {
		x: (Number(obj.position?.x) || 0) + cx,
		y: (Number(obj.position?.y) || 0) + cy,
		z: Number(obj.position?.z) || 0
	};

	obj.invalidateGraphic2D?.();

	return { cx, cy, bounds: { minx, miny, maxx, maxy, width: maxx - minx, height: maxy - miny } };
}