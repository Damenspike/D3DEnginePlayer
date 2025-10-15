import D2DFill from './d2dfill.js';

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
		this.host = null;

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
		return new Set(['brush','pencil','line','square','circle','polygon']).has(t);
	}
	_request() { _editor?.requestRender?.() || this.d2drenderer?.render?.(); }

	/* =============== matrices & coords =============== */
	_mouseToCanvas(e) {
		const r = this.canvas.getBoundingClientRect();
		const x = (e.clientX - r.left) * (this.canvas.width  / r.width);
		const y = (e.clientY - r.top)  * (this.canvas.height / r.height);
		return { x, y };
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
										// keep non-uniform scale
			const sy = Number(o.scale?.y) || 1;
			m = m.translate(tx, ty).rotate(rz * 180 / Math.PI).scale(sx, sy);
		}
		return m;
	}
	_viewMatrix() {
		const pr  = this.d2drenderer.pixelRatio || 1;
		const vs  = this.d2drenderer.viewScale  || 1;
		const off = this.d2drenderer.viewOffset || { x:0, y:0 };
		return new DOMMatrix().translate(off.x, off.y).scale(pr * vs);
	}
	_hostScreenMatrix() {
		return this._viewMatrix().multiply(this._worldDOMMatrix(this.host || _editor?.focus || _root));
	}
	_childScreenMatrix(child) {
		return this._viewMatrix().multiply(this._worldDOMMatrix(child));
	}
	_canvasToLocal(pt) {
		const inv = this._hostScreenMatrix().inverse();
		const q = new DOMPoint(pt.x, pt.y).matrixTransform(inv);
		return { x:q.x, y:q.y };
	}
	_localToCanvas(pt) {
		const M = this._hostScreenMatrix();
		const q = new DOMPoint(pt.x, pt.y).matrixTransform(M);
		return { x:q.x, y:q.y };
	}
	// child-local → host-local
	_childLocalToHostLocal(child, p) {
		const W_host  = this._worldDOMMatrix(this.host || _editor?.focus || _root);
		const W_child = this._worldDOMMatrix(child);
		const M = W_host.inverse().multiply(W_child);
		const r = new DOMPoint(p.x, p.y).matrixTransform(M);
		return { x:r.x, y:r.y };
	}

	/* =============== snapping =============== */
	_focusChildren2D() {
		const f = _editor?.focus;
		if (!f) return [];
		const out = [];

		const pushChild2D = (node) => {
			if (!node || !Array.isArray(node.children)) return;
			for (const c of node.children) {
				if (c?.is2D && Array.isArray(c.graphic2d?._paths)) out.push(c);
			}
		};
		pushChild2D(f);

		const parent = f.parent;
		if (parent) {
			pushChild2D(parent);
			if (parent.is2D && Array.isArray(parent.graphic2d?._paths)) out.push(parent);
		}
		return Array.from(new Set(out));
	}

	_rebuildSnapCache() {
		const children = this._focusChildren2D();
		if (children.length === 0) { this._snapCache = null; return; }

		const W_host = this._worldDOMMatrix(this.host || _editor?.focus || _root);
		const W_host_inv = W_host.inverse();

		const entries = [];
		for (const child of children) {
			const paths = Array.isArray(child.graphic2d?._paths) ? child.graphic2d._paths : [];
			if (paths.length < 1) continue;

			const W_child  = this._worldDOMMatrix(child);
			const toHost   = W_host_inv.multiply(W_child);   // child → host
			const toCanvas = this._childScreenMatrix(child); // child → canvas
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

				const closed = this._isClosed(path);
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
		if(!_editor.draw2d.snapEnabled) return;

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
		this.host = _editor?.focus || _root;
		this._snapCache = null;

		const c = this._mouseToCanvas(e);
		this.cursor = c;

		const s = this._snap(c);
		const p = s ? { x:s.hostLocal.x, y:s.hostLocal.y } : this._canvasToLocal(c);
		this.cursorLocal = p;
		this._snapHit = s || null;

		// polygon: click-to-add path vertices
		if (this.tool === 'polygon') {
			if (!this.drawing) {
				this.drawing = true;
				this.localPoints = [{ x:p.x, y:p.y }];
				this._ensureTemp().then(()=>{ if (this.tempObj) this.tempObj.visible=false; this._updateTempGraphic(true); this._request(); });
			} else {
				this.localPoints.push({ x:p.x, y:p.y });
				this._updateTempGraphic(); this._request();
			}
			return;
		}

		// all other tools
		this.drawing = true;
		this.localPoints = [{ x:p.x, y:p.y }];
		if (['line','square','circle'].includes(this.tool)) {
			this.localPoints.push({ x:p.x, y:p.y });
		}
		this._ensureTemp().then(()=>{ if (this.tempObj) this.tempObj.visible=false; this._updateTempGraphic(true); this._request(); });
	}

	_onMove(e) {
		const c = this._mouseToCanvas(e);
		this.cursor = c;

		const s = this._snap(c);
		if (s) { this._snapHit = s; this.cursorLocal = { x:s.hostLocal.x, y:s.hostLocal.y }; }
		else   { this._snapHit = null; this.cursorLocal = this._canvasToLocal(c); }

		if (!this.drawing) { this._request(); return; }

		if (this.tool === 'polygon') {
			this._updateTempGraphic(); this._request(); return;
		}

		if (['line','square','circle'].includes(this.tool)) {
			this.localPoints[1] = { x:this.cursorLocal.x, y:this.cursorLocal.y };
		} else {
			// pixel-aware sampling while drawing
			const last = this.localPoints[this.localPoints.length - 1];
			const minStepLocal = this._pxToLocalScalar(this.tool === 'brush' ? 0.75 : 1.25);
			if (!last || this._dist(last, this.cursorLocal) >= minStepLocal) {
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
			if (!this._approxPt(a, b)) this.localPoints.push({ x:a.x, y:a.y });
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
		const host = this.host;
		let name = 'Draw 2D';
		if (this.tool === 'brush')   name = 'Brush Stroke';
		if (this.tool === 'pencil')  name = 'Pencil Stroke';
		if (this.tool === 'line')    name = 'Line';
		if (this.tool === 'square')  name = 'Rectangle';
		if (this.tool === 'circle')  name = 'Ellipse';
		if (this.tool === 'polygon') name = 'Polygon';

		if(_editor.draw2d.subtract) name += ' Erase';

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

		const components = [{ type:'Graphic2D', properties: props }];
		this.tempObj = await host.createObject({ name, components });
		this.tempObj.depth = host.getNextHighestDepth();
	}

	_updateTempGraphic(initial=false) {
		const obj = this.tempObj; if (!obj) return;

		const setPath = (pts) => { obj.graphic2d._paths = [pts]; };

		if (this.tool === 'brush') {
			const live = this.localPoints.length > 2
				? this._simplifyAdaptive(this.localPoints, { tool:'brush', simplifyPx: 1.0, minStepPx: 0.75 })
				: this.localPoints;
			const r = Math.max(0.1, Number(_editor.draw2d?.brushRadius ?? 1));
			setPath(this._strokeToPolygon(live, r, initial));
			obj.graphic2d.fillColor = _editor.draw2d?.fillColor || obj.graphic2d.fillColor;

		} else if (this.tool === 'pencil') {
			setPath(this.localPoints.map(p=>({x:p.x,y:p.y})));
			obj.graphic2d.lineWidth = Math.max(1, Number(_editor.draw2d?.lineWidth ?? obj.graphic2d.lineWidth ?? 1));
			obj.graphic2d.lineColor = _editor.draw2d?.lineColor || obj.graphic2d.lineColor;

		} else if (this.tool === 'line') {
			setPath(this.localPoints.slice(0,2).map(p=>({x:p.x,y:p.y})));
			obj.graphic2d.lineWidth = Math.max(1, Number(_editor.draw2d?.lineWidth ?? obj.graphic2d.lineWidth ?? 1));
			obj.graphic2d.lineColor = _editor.draw2d?.lineColor || obj.graphic2d.lineColor;

		} else if (this.tool === 'square') {
			if (this.localPoints.length >= 2) {
				const a=this.localPoints[0], b=this.localPoints[1];
				setPath(this._makeRectPoints(a,b));
			}

		} else if (this.tool === 'circle') {
			if (this.localPoints.length >= 2) {
				const a=this.localPoints[0], b=this.localPoints[1];
				setPath(this._makeEllipsePoints(a,b,64));
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
		obj.visible = true;

		// style snapshot
		const s = _editor.draw2d || {};
		const wantFill = s.fill !== false;
		const wantLine = s.line !== false;
		const lw = Math.max(1, Number(s.lineWidth ?? 1));
		const br = s.borderRadius;

		// freehand simplify
		if (['brush','pencil'].includes(this.tool) && this.localPoints.length > 2) {
			this.localPoints = this._simplifyAdaptive(this.localPoints, { tool: this.tool });
		}

		// finalize per tool → single path
		let path = [];
		if (this.tool === 'brush') {
			const r = Math.max(0.1, Number(s.brushRadius ?? 1));
			path = this._strokeToPolygon(this.localPoints, r, false);
		} else if (this.tool === 'pencil') {
			path = this.localPoints.map(p => ({ x:p.x, y:p.y }));
		} else if (this.tool === 'line') {
			path = this.localPoints.slice(0,2).map(p => ({ x:p.x, y:p.y }));
		} else if (this.tool === 'square' && this.localPoints.length >= 2) {
			path = this._makeRectPoints(this.localPoints[0], this.localPoints[1]);
		} else if (this.tool === 'circle' && this.localPoints.length >= 2) {
			path = this._makeEllipsePoints(this.localPoints[0], this.localPoints[1], 64);
		} else if (this.tool === 'polygon') {
			const simp = this._simplifyAdaptive(this.localPoints, { tool:'pencil', simplifyPx: 1.75, minStepPx: 1.0 });
			path = this._cleanAndClose(simp);
		}

		// if fill requested, ensure closed
		if (wantFill) path = this._cleanAndClose(path);

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

		obj.invalidateGraphic2D?.();
		const paths = obj?.graphic2d?._paths || [];
		if (paths.length === 0 || (paths[0]?.length || 0) === 0) { obj.delete?.(); this._request(); return; }

		// -------- boolean subtract pathway --------
		if (s.subtract) {
		  // 1) choose target: parent graphic if present, else focus if it is a 2D graphic
		  const focus = _editor?.focus || this.host || _root;
		  const parentCandidate = focus?.parent;
		  const parentIs2D = parentCandidate?.is2D && Array.isArray(parentCandidate.graphic2d?._paths);
		  const focusIs2D  = focus?.is2D && Array.isArray(focus.graphic2d?._paths);
		  const target = parentIs2D ? parentCandidate : (focusIs2D ? focus : null);
		
		  if (!target) {
			// nothing to subtract from — drop the temp eraser and exit
			obj.delete?.(); this.tempObj = null; this._request(); return;
		  }
		
		  // 2) make a valid cutter polygon:
		  //    - if closed: use as-is
		  //    - if open (line/pencil): expand to stroke polygon using half lineWidth
		  let cutter = this._cleanAndClose(path);
		  const isClosed = this._isClosed(cutter);
		
		  if (!isClosed) {
			const half = Math.max(0.1, (lw || 1) * 0.5);
			cutter = this._strokeToPolygon(path, half, /*allowCircle*/ false);
			cutter = this._cleanAndClose(cutter);
		  }
		
		  // degenerate? bail
		  if (cutter.length < 4 || Math.abs(this._signedArea(cutter)) < 1e-9) {
			obj.delete?.(); this.tempObj = null; this._request(); return;
		  }
		
		  // 3) snapshot "before"
		  const before = [{
			obj: target,
			paths: (target.graphic2d._paths || []).map(p => p.map(q => ({ x:q.x, y:q.y })))
		  }];
		
		  // 4) subtract (paths are normalized inside _diffPathsByCutter)
		  const newPaths = this._diffPathsByCutter(target.graphic2d._paths || [], cutter);
		  target.graphic2d._paths = newPaths;
		  target.invalidateGraphic2D?.();
		
		  // 5) remove the eraser temp object
		  obj.delete?.(); this.tempObj = null;
		
		  // 6) snapshot "after"
		  const after = [{
			obj: target,
			paths: (target.graphic2d._paths || []).map(p => p.map(q => ({ x:q.x, y:q.y })))
		  }];
		
		  // 7) history
		  if (_editor?.addStep) {
			_editor.addStep({
			  label: 'Subtract 2D',
			  undo: () => {
				for (const s of before) {
				  s.obj.graphic2d._paths = s.paths.map(p => p.map(q => ({ x:q.x, y:q.y })));
				  s.obj.invalidateGraphic2D?.();
				}
			  },
			  redo: () => {
				for (const s of after) {
				  s.obj.graphic2d._paths = s.paths.map(p => p.map(q => ({ x:q.x, y:q.y })));
				  s.obj.invalidateGraphic2D?.();
				}
			  }
			});
		  }
		
		  _editor?.selectObjects?.([target]);
		  this._request();
		  return; // done
		}
		// -------- end subtract pathway --------

		// center origin for intuitive transforms
		this._centerObject(obj);

		// history (normal draw)
		if (_editor?.addStep) {
			const host = obj.parent || this.host || _root;
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
				_editor?.selectObjects?.([keep]);
			};
			_editor.addStep({ label:'Draw 2D', undo, redo });
		}

		_editor?.selectObjects?.([obj]);
		this._request();
	}

	/* =============== simplify (pixel-aware) =============== */
	_pxToLocalScalar(px) {
		const pr = this.d2drenderer.pixelRatio || 1;
		const vs = this.d2drenderer.viewScale  || 1;
		return px / (pr * vs);
	}
	_rdpSimplify(points, epsilonLocal) {
		if (!points || points.length < 3) return points ? points.slice() : [];
		const sqEps = epsilonLocal * epsilonLocal;
		const sqSegDist = (p, a, b) => {
			let x = a.x, y = a.y;
			let dx = b.x - x, dy = b.y - y;
			if (dx !== 0 || dy !== 0) {
				const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx*dx + dy*dy);
				if (t > 1) { x = b.x; y = b.y; }
				else if (t > 0) { x += dx * t; y += dy * t; }
			}
			dx = p.x - x; dy = p.y - y;
			return dx*dx + dy*dy;
		};
		const keep = new Array(points.length).fill(false);
		keep[0] = keep[points.length - 1] = true;
		const stack = [[0, points.length - 1]];
		while (stack.length) {
			const [first, last] = stack.pop();
			let index = -1, maxSq = -1;
			for (let i = first + 1; i < last; i++) {
				const d = sqSegDist(points[i], points[first], points[last]);
				if (d > maxSq) { index = i; maxSq = d; }
			}
			if (maxSq > sqEps && index !== -1) {
				keep[index] = true;
				stack.push([first, index], [index, last]);
			}
		}
		const out = [];
		for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
		return out;
	}
	_spacingSimplify(points, minStepLocal) {
		if (!points || points.length < 3) return points ? points.slice() : [];
		const out = [points[0]];
		let last = points[0];
		const min2 = minStepLocal * minStepLocal;
		for (let i = 1; i < points.length - 1; i++) {
			const p = points[i];
			const dx = p.x - last.x, dy = p.y - last.y;
			if (dx*dx + dy*dy >= min2) { out.push(p); last = p; }
		}
		out.push(points[points.length - 1]);
		return out;
	}
	_simplifyAdaptive(points, { tool = 'pencil', simplifyPx, minStepPx } = {}) {
		const defaults = { brush:{simplifyPx:1.25,minStepPx:0.75}, pencil:{simplifyPx:2.25,minStepPx:1.25} };
		const cfg = {
			simplifyPx: simplifyPx ?? defaults[tool]?.simplifyPx ?? 2.0,
			minStepPx:  minStepPx  ?? defaults[tool]?.minStepPx  ?? 1.0
		};
		const epsLocal  = this._pxToLocalScalar(cfg.simplifyPx);
		const stepLocal = this._pxToLocalScalar(cfg.minStepPx);
		const rdp = this._rdpSimplify(points, epsLocal);
		return this._spacingSimplify(rdp, stepLocal);
	}

	/* =============== geometry helpers =============== */
	_dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
	_approxPt(a,b){ return Math.abs(a.x-b.x) <= 1e-6 && Math.abs(a.y-b.y) <= 1e-6; }

	_isClosed(pts) {
		if (!pts || pts.length < 3) return false;
		const a = pts[0], b = pts[pts.length - 1];
		return this._approxPt(a, b);
	}

	_makeRectPoints(a,b){
		return [
			{ x:a.x, y:a.y },
			{ x:b.x, y:a.y },
			{ x:b.x, y:b.y },
			{ x:a.x, y:b.y },
			{ x:a.x, y:a.y }
		];
	}

	_makeEllipsePoints(a,b,segs=64){
		const cx=(a.x+b.x)*0.5, cy=(a.y+b.y)*0.5;
		const rx=Math.max(0.1, Math.abs(b.x-a.x)*0.5);
		const ry=Math.max(0.1, Math.abs(b.y-a.y)*0.5);
		const out=[];
		for (let i=0;i<segs;i++){
			const t=(i/segs)*Math.PI*2;
			out.push({ x:cx + Math.cos(t)*rx, y:cy + Math.sin(t)*ry });
		}
		out.push({ x:out[0].x, y:out[0].y });
		return out;
	}

	_cleanAndClose(points){
		const pts=(points||[]).filter(p=>isFinite(p?.x)&&isFinite(p?.y)).map(p=>({x:+p.x,y:+p.y}));
		if (pts.length===0) return pts;
		// collapse consecutive duplicates
		const ded=[pts[0]];
		for (let i=1;i<pts.length;i++) if (!this._approxPt(pts[i], ded[ded.length-1])) ded.push(pts[i]);
		if (ded.length===0) return ded;
		const a=ded[0], b=ded[ded.length-1];
		if (!this._approxPt(a,b)) ded.push({ x:a.x, y:a.y });
		return ded;
	}

	_normals(a,b){ const dx=b.x-a.x, dy=b.y-a.y; const L=Math.hypot(dx,dy)||1; return { x:-dy/L, y:dx/L }; }

	_circlePoly(c,r,segs=24){
		const out=[]; for (let i=0;i<segs;i++){ const t=(i/segs)*Math.PI*2; out.push({x:c.x+Math.cos(t)*r,y:c.y+Math.sin(t)*r}); }
		out.push({ x:out[0].x, y:out[0].y }); return out;
	}

	_strokeToPolygon(pts,radius,allowCircle){
		if (!pts || pts.length<2){
			if (allowCircle && pts && pts.length===1) return this._circlePoly(pts[0], radius);
			return pts ? pts.map(p=>({x:p.x,y:p.y})) : [];
		}
		const simp = pts;
		const left=[], right=[];
		const n=simp.length;
		for (let i=0;i<n;i++){
			const p=simp[i];
			let nrm;
			if (i===0) nrm=this._normals(simp[i],simp[i+1]);
			else if (i===n-1) nrm=this._normals(simp[i-1],simp[i]);
			else {
				const n1=this._normals(simp[i-1],simp[i]);
				const n2=this._normals(simp[i],simp[i+1]);
				const nx=n1.x+n2.x, ny=n1.y+n2.y;
				const l=Math.hypot(nx,ny)||1; nrm={x:nx/l,y:ny/l};
			}
			left.push({ x:p.x+nrm.x*radius, y:p.y+nrm.y*radius });
			right.push({ x:p.x-nrm.x*radius, y:p.y-nrm.y*radius });
		}
		right.reverse();
		const poly=left.concat(right);
		if (poly.length>0) poly.push({ x:poly[0].x, y:poly[0].y });
		return poly;
	}

	_centerObject(obj){
		const paths = Array.isArray(obj?.graphic2d?._paths) ? obj.graphic2d._paths : [];
		if (paths.length===0) return;
		let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
		for (const path of paths){
			for (const p of path){ const x=+p.x||0, y=+p.y||0;
				if (x<minx)minx=x; if (y<miny)miny=y; if (x>maxx)maxx=x; if (y>maxy)maxy=y; }
		}
		if (!isFinite(minx)||!isFinite(miny)||!isFinite(maxx)||!isFinite(maxy)) return;
		const cx=(minx+maxx)*0.5, cy=(miny+maxy)*0.5;
		for (const path of paths) for (const p of path){ p.x -= cx; p.y -= cy; }
		obj.position = { x:(+obj.position?.x||0)+cx, y:(+obj.position?.y||0)+cy, z:+obj.position?.z||0 };
		obj.invalidateGraphic2D?.();
	}

	hex8(v, fallback) {
		if (!v || typeof v !== 'string') return fallback || 'rgba(255,255,255,1)';
		if (v.startsWith('#') && (v.length === 9 || v.length === 7)) {
			if (v.length === 7) return v;
			const r = parseInt(v.slice(1,3),16);
			const g = parseInt(v.slice(3,5),16);
			const b = parseInt(v.slice(5,7),16);
			const a = parseInt(v.slice(7,9),16) / 255;
			return `rgba(${r},${g},${b},${a})`;
		}
		if (v.startsWith('0x')) {
			const n = Number(v);
			const r = (n >> 24) & 0xff;
			const g = (n >> 16) & 0xff;
			const b = (n >> 8) & 0xff;
			const a = (n & 0xff) / 255;
			return `rgba(${r},${g},${b},${a})`;
		}
		return v;
	}

	// ---------- basic boolean helpers (safe) ----------
	_ensureCCW(poly){
	  const p = this._cleanAndClose(poly);
	  if (p.length >= 3 && this._signedArea(p) < 0) p.reverse();
	  return p;
	}
	_signedArea(poly){
		let a=0;
		for (let i=0;i<poly.length-1;i++) a += poly[i].x*poly[i+1].y - poly[i+1].x*poly[i].y;
		return a*0.5;
	}
	_pointInPolygon(p, poly){
		let inside=false;
		for (let i=0, j=poly.length-1; i<poly.length; j=i++){
			const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
			const inter = ((yi>p.y)!==(yj>p.y)) && (p.x < (xj-xi)*(p.y-yi)/((yj-yi)||1e-12) + xi);
			if (inter) inside = !inside;
		}
		return !!inside;
	}
	_segIntersect(a,b,c,d){
		if (!a||!b||!c||!d) return { hit:false };
		const bax=b.x-a.x, bay=b.y-a.y, cdx=d.x-c.x, cdy=d.y-c.y;
		const den = bax*(-cdy) - bay*(-cdx);
		if (Math.abs(den) < 1e-12) return {hit:false};
		const cxax=c.x-a.x, cyay=c.y-a.y;
		const t = (cxax*(-cdy) - cyay*(-cdx)) / den;
		const u = (cxax*(-bay) + cyay*(bax)) / den;
		if (t<-1e-12 || t>1+1e-12 || u<-1e-12 || u>1+1e-12) return {hit:false};
		return {hit:true, t:Math.max(0,Math.min(1,t)), u:Math.max(0,Math.min(1,u)), x:a.x + bax*t, y:a.y + bay*t};
	}

	// ---------- Greiner–Hormann nodes ----------
	_makeNode(p){ return { x:p.x, y:p.y, next:null, prev:null, neighbor:null, alpha:0, entry:false, visited:false, intersect:false, orig:true }; }
	_linkRing(pts){
		const base=(this._approxPt(pts[0], pts[pts.length-1]))? pts.slice(0,-1) : pts.slice();
		if (base.length<3) return null;

		// remove consecutive duplicate vertices
		const clean=[base[0]];
		for (let i=1;i<base.length;i++) if (!this._approxPt(base[i], clean[clean.length-1])) clean.push(base[i]);
		if (clean.length<3) return null;

		const nodes=clean.map(p=>this._makeNode(p));
		const n=nodes.length;
		for (let i=0;i<n;i++){ nodes[i].next = nodes[(i+1)%n]; nodes[i].prev = nodes[(i-1+n)%n]; }
		return nodes[0];
	}
	_insertAfter(a, x){ x.prev=a; x.next=a.next; a.next.prev=x; a.next=x; }
	_nextOriginal(n){ let k=n.next; while (k!==n && k && !k.orig) k=k.next; return k; }
	_ringCountOriginal(head){ let cnt=0, k=head; do{ if (k.orig) cnt++; k=k.next; } while (k!==head); return cnt; }
	_ringToArray(head){
		const out=[]; let n=head; do{ out.push({x:n.x,y:n.y}); n=n.next; } while (n!==head);
		if (!this._approxPt(out[0], out[out.length-1])) out.push({x:out[0].x,y:out[0].y});
		return out;
	}

	// ---------- A - B (simple polygons, no holes) ----------
	_booleanDiffSimple(Ain, Bin){
		// build linked rings
		const A = this._linkRing(Ain);
		const B = this._linkRing(Bin);
		if (!A || !B) return [];
	
		// 1) insert intersections (iterate original edges only)
		let a = A;
		const aEdges = this._ringCountOriginal(A);
		for (let i=0;i<aEdges;i++){
			const ai=a; const aj=this._nextOriginal(ai);
	
			let b = B;
			const bEdges = this._ringCountOriginal(B);
			for (let j=0;j<bEdges;j++){
				const bi=b; const bj=this._nextOriginal(bi);
	
				const inter=this._segIntersect(ai,aj,bi,bj);
				if (inter.hit){
					const an={...this._makeNode({x:inter.x,y:inter.y}), intersect:true, orig:false, alpha:inter.t};
					const bn={...this._makeNode({x:inter.x,y:inter.y}), intersect:true, orig:false, alpha:inter.u};
					an.neighbor=bn; bn.neighbor=an;
	
					let p=ai; while (p.next!==aj && p.next.intersect && p.next.alpha < an.alpha) p=p.next;
					this._insertAfter(p, an);
					p=bi; while (p.next!==bj && p.next.intersect && p.next.alpha < bn.alpha) p=p.next;
					this._insertAfter(p, bn);
				}
				b=this._nextOriginal(b);
			}
			a=this._nextOriginal(a);
		}
	
		// 2) early-out: no intersections
		let anyInter=false; { let t=A; do{ if (t.intersect){ anyInter=true; break; } t=t.next; } while (t!==A); }
		if (!anyInter){
			// We must return A - B even when B is fully inside A (create a hole).
			// Use array forms for robust point tests and to manage winding.
			const Aarr = this._ringToArray(A);	// closed
			const Barr = this._ringToArray(B);	// closed
			if (Aarr.length < 4) return [];
			if (Barr.length < 4) return [Aarr];
	
			const aInsideB = this._pointInPolygon(Aarr[0], Barr);
			const bInsideA = this._pointInPolygon(Barr[0], Aarr);
	
			if (bInsideA && !aInsideB){
				// B fully inside A → return A with a hole B (reverse B so winding is opposite)
				const Aout = Aarr.slice();
				const Bout = Barr.slice();
	
				const areaA = this._signedArea(Aout);
				const areaB = this._signedArea(Bout);
				// ensure opposite sign: if same sign, reverse B
				if ((areaA >= 0 && areaB >= 0) || (areaA <= 0 && areaB <= 0)) Bout.reverse();
	
				return [Aout, Bout];
			}
	
			// if A completely inside B → fully removed; else disjoint → keep A
			return (!aInsideB) ? [Aarr] : [];
		}
	
		// 3) mark entry flags along A (difference toggles as we cross B)
		let inside = this._pointInPolygon({x:A.x,y:A.y}, Bin);
		let cur=A;
		do{
			if (cur.intersect){ cur.entry = !inside; inside = !inside; }
			cur = cur.next;
		} while (cur !== A);
	
		// 4) trace result contours
		const results=[];
		const maxSteps = 10000;
	
		const nextUnvisited = ()=>{
			let k=A; do{ if (k.intersect && !k.visited) return k; k=k.next; } while (k!==A);
			return null;
		};
	
		let start;
		while ((start=nextUnvisited())){
			const out=[];
			let n = start;
			let forward = n.entry;
			let steps=0;
	
			while (steps++ < maxSteps){
				if (n.visited && n===start) break;
				n.visited = true;
				out.push({x:n.x,y:n.y});
	
				if (n.intersect){
					n.neighbor.visited = true;
					n = n.neighbor;          // switch rings
					out.push({x:n.x,y:n.y});
					forward = !forward;      // flip direction on each swap
				}
				n = forward ? n.next : n.prev;
				if (n===start){ out.push({x:n.x,y:n.y}); break; }
			}
	
			const clean=this._cleanAndClose(out);
			if (clean.length>=4) results.push(clean);
		}
	
		return results;
	}

	// ---------- paths − cutter ----------
	_diffPathsByCutter(paths, cutter){
	  if (!Array.isArray(paths) || paths.length===0) return [];
	  const C = this._ensureCCW(cutter);
	  if (C.length<4 || Math.abs(this._signedArea(C)) < 1e-9) return paths.map(p=>p.slice());
	
	  const out=[];
	  for (const P of paths){
		const A = this._ensureCCW(P);
		if (A.length<4 || Math.abs(this._signedArea(A)) < 1e-9){ out.push(P.slice()); continue; }
		const parts = this._booleanDiffSimple(A, C);
		for (const r of parts){
		  const rr = this._cleanAndClose(r);
		  if (rr.length >= 3) {
			if (this._signedArea(rr) < 0) rr.reverse();
			out.push(rr);
		  }
		}
	  }
	  return out;
	}

	/* =============== overlay render (preview + gizmos) =============== */
	render() {
		if (!this._isActive()) return;
		const ctx = this.ctx; if (!ctx) return;

		const tool   = _editor.tool;
		const fc     = this.hex8(_editor.draw2d?.fillColor || '#000000ff', 'rgba(0,0,0,1)');
		const lc     = this.hex8(_editor.draw2d?.lineColor || '#ffffffff', 'rgba(255,255,255,1)');
		const radius = Math.max(0.1, Number(_editor.draw2d?.brushRadius ?? 1));
		const lw     = Math.max(1, Number(_editor.draw2d?.lineWidth ?? 1));
		const br     = Math.max(0, Number(_editor.draw2d?.borderRadius ?? 0));

		const pr = this.d2drenderer.pixelRatio || 1;
		const vs = this.d2drenderer.viewScale  || 1;
		const strokePx = lw * pr * vs;

		const wantFill = _editor.draw2d?.fill !== false;
		const wantLine = _editor.draw2d?.line !== false;

		// helpers (LOCAL-SPACE)
		const isClosedLocal = (pts) => this._isClosed(pts);
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
			const M = this._hostScreenMatrix();
			const pc = new Path2D();
			pc.addPath(localPath, M);
			return pc;
		};
		const drawFillAndStroke = (canvasPath) => {
			if (wantFill) { ctx.fillStyle = fc; ctx.fill(canvasPath); }
			if (wantLine) {
				ctx.lineWidth = strokePx;
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
					? this._simplifyAdaptive(this.localPoints, { tool:'brush', simplifyPx: 1.0, minStepPx: 0.75 })
					: this.localPoints;
				const polyLocal = this._strokeToPolygon(live, radius, true);
				if (polyLocal.length > 1) {
					const rawL = rawPathLocal(polyLocal);
					const roundL = roundedPathLocal(polyLocal, br);
					const pathC = toCanvasPath(roundL || rawL);
					drawFillAndStroke(pathC);
				}
			} else if (tool === 'pencil') {
				if (this.localPoints.length > 1) {
					const pts = this.localPoints.map(p => this._localToCanvas(p));
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
					const a = this._localToCanvas(this.localPoints[0]);
					const b = this._localToCanvas(this.localPoints[1]);
					ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
					ctx.lineCap='round'; ctx.lineJoin='round';
					ctx.lineWidth = strokePx;
					ctx.strokeStyle = lc;
					ctx.stroke();
				}
			} else if (tool === 'square') {
				if (this.localPoints.length >= 2) {
					const polyLocal = this._makeRectPoints(this.localPoints[0], this.localPoints[1]);
					const rawL = rawPathLocal(polyLocal);
					const roundL = roundedPathLocal(polyLocal, br);
					const pathC = toCanvasPath(roundL || rawL);
					drawFillAndStroke(pathC);
				}
			} else if (tool === 'circle') {
				if (this.localPoints.length >= 2) {
					const polyLocal = this._makeEllipsePoints(this.localPoints[0], this.localPoints[1], 48);
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
			const pr = this.d2drenderer.pixelRatio || 1;
			const vs = this.d2drenderer.viewScale  || 1;
			const r = tool === 'brush' ? radius * (pr*vs) : Math.max(1, _editor.draw2d?.lineWidth ?? 1) * 0.5 * (pr*vs);
			ctx.beginPath(); ctx.arc(this.cursor.x, this.cursor.y, r, 0, Math.PI*2);
			ctx.lineWidth = 1; ctx.strokeStyle = tool==='brush' ? fc : lc; ctx.stroke();
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