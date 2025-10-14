export default class D2DFill {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = d2drenderer.domElement;
		this.ctx = d2drenderer.ctx;

		this.cursor = null;

		this._onDown = this._onDown.bind(this);
		this._onMove = this._onMove.bind(this);
		this._onBlur = this._onBlur.bind(this);

		this._attach();
	}

	destroy(){ this._detach(); }

	_attach(){
		if (!this.canvas) return;
		this.canvas.addEventListener('mousedown', this._onDown, { passive:false });
		window.addEventListener('mousemove', this._onMove, { passive:true });
		window.addEventListener('blur', this._onBlur, { passive:false });
	}
	_detach(){
		if (!this.canvas) return;
		this.canvas.removeEventListener('mousedown', this._onDown);
		window.removeEventListener('mousemove', this._onMove);
		window.removeEventListener('blur', this._onBlur);
	}

	_isActive(){ return _editor?.tool === 'fill'; }

	// ---------------- coords & matrices ----------------
	_mouseToCanvas(e){
		const r = this.canvas.getBoundingClientRect();
		const x = (e.clientX - r.left) * (this.canvas.width  / r.width);
		const y = (e.clientY - r.top)  * (this.canvas.height / r.height);
		return { x, y };
	}

	_worldDOMMatrix(node){
		let m = new DOMMatrix();
		const stack = [];
		for (let n = node; n; n = n.parent) stack.push(n);
		stack.reverse();
		for (const o of stack){
			const tx = +o.position?.x || 0;
			const ty = +o.position?.y || 0;
			const rz = +o.rotation?.z || 0;
			const sx = +o.scale?.x || 1;
			const sy = +o.scale?.y || 1;
			m = m.translate(tx,ty).rotate(rz*180/Math.PI).scale(sx,sy);
		}
		return m;
	}

	_viewMatrix(){
		const pr  = this.d2drenderer.pixelRatio || 1;
		const vs  = this.d2drenderer.viewScale  || 1;
		const off = this.d2drenderer.viewOffset || { x:0, y:0 };
		return new DOMMatrix().translate(off.x, off.y).scale(pr * vs);
	}

	_screenMatrixFor(obj){
		return this._viewMatrix().multiply(this._worldDOMMatrix(obj));
	}

	// ---------------- scene gather ----------------
	_all2D(root){
		const out = [];
		root.children.forEach(n => {
			if (n.is2D && Array.isArray(n.graphic2d?._points)) out.push(n);
		});
		// draw order: later = topmost
		return out.sort((a,b)=>(a.position?.z||0)-(b.position?.z||0));
	}

	// ---------------- hit test ----------------
	_isClosed(points){
		if (points.length < 3) return false;
		const a = points[0], b = points[points.length-1];
		return Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) <= 1e-6;
	}

	_pointInPoly(px,py,poly){
		let inside=false;
		for (let i=0,j=poly.length-1;i<poly.length;j=i++){
			const xi=poly[i].x, yi=poly[i].y;
			const xj=poly[j].x, yj=poly[j].y;
			const inter=((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/((yj-yi)||1e-12)+xi);
			if (inter) inside=!inside;
		}
		return inside;
	}

	_pickFilledTarget(mouse){
		// search topmost → bottom
		const host = _editor.focus; // guaranteed to exist per your note
		const objs = this._all2D(host);
		const px = mouse.x, py = mouse.y;

		for (let i = objs.length - 1; i >= 0; i--) {
			const obj = objs[i];
			const g = obj.graphic2d;
			if (!g.fill) continue; // we only change color if already filled
			const pts = g._points;
			if (pts.length < 3) continue;

			const M  = this._screenMatrixFor(obj);
			const sp = pts.map(p => {
				const t = new DOMPoint(p.x, p.y).matrixTransform(M);
				return { x: t.x, y: t.y };
			});

			// fast AABB reject
			let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
			for (const p of sp){ if(p.x<minx)minx=p.x; if(p.y<miny)miny=p.y; if(p.x>maxx)maxx=p.x; if(p.y>maxy)maxy=p.y; }
			if (px < minx || px > maxx || py < miny || py > maxy) continue;

			// inside test (works for brush-polygons and other closed shapes)
			if (this._isClosed(pts) && this._pointInPoly(px, py, sp)) {
				return obj;
			}
		}
		return null;
	}

	// ---------------- action ----------------
	_applyFillColor(obj, color){
		const g = obj.graphic2d;
		const before = { fill: !!g.fill, fillColor: g.fillColor };
		// Only update color if fill is enabled
		if (!g.fill) return false;

		g.fillColor = color || g.fillColor || '#000000ff';
		obj.invalidateGraphic2D?.();

		if (_editor?.addStep){
			const after = { fill: !!g.fill, fillColor: g.fillColor };
			_editor.addStep({
				label: 'Change Fill Color',
				undo: () => { g.fill = before.fill; g.fillColor = before.fillColor; obj.invalidateGraphic2D?.(); },
				redo: () => { g.fill = after.fill;  g.fillColor = after.fillColor;  obj.invalidateGraphic2D?.(); }
			});
		}
		_editor?.selectObjects?.([obj]);
		return true;
	}

	// ---------------- events ----------------
	_onDown(e){
		if (!this._isActive()) return;
		e.preventDefault();

		const mouse = this._mouseToCanvas(e);
		const color = _editor.draw2d?.fillColor || '#000000ff';

		const obj = this._pickFilledTarget(mouse);
		if (!obj) return; // click on empty space or on non-filled shapes does nothing

		this._applyFillColor(obj, color);
		_editor?.requestRender?.();
	}

	_onMove(e){
		if (!this._isActive()) return;
		this.cursor = this._mouseToCanvas(e);
	}
	_onBlur(){ this.cursor = null; }

	render() {}
}