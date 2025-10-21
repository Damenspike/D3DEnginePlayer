// d2dfill.js
import * as U from './d2dutility.js';

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

	/* ---------------- scene gather ---------------- */
	_all2DInDrawOrder(root){
		// use utility
		return U.all2DInDrawOrder(root);
	}

	/* ---------------- hit test ---------------- */
	_pickFilledTarget(mouse){
		// search topmost → bottom
		const host = _editor.focus;
		const objs = this._all2DInDrawOrder(host);
		const px = mouse.x, py = mouse.y;

		for (let i = objs.length - 1; i >= 0; i--) {
			const obj = objs[i];
			const g = obj.graphic2d;
			if (!g?.fill) continue; // only change color if already filled

			const paths = Array.isArray(g._paths) ? g._paths : [];
			if (paths.length === 0) continue;

			const M = U.childScreenMatrix(this.d2drenderer, obj);

			for (const path of paths) {
				if (!U.isClosedPoints(path)) continue;
				if (path.length < 3) continue;

				// transform to screen
				const sp = path.map(p => {
					const t = new DOMPoint(p.x, p.y).matrixTransform(M);
					return { x: t.x, y: t.y };
				});

				// fast AABB reject
				let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
				for (const p of sp){ if(p.x<minx)minx=p.x; if(p.y<miny)miny=p.y; if(p.x>maxx)maxx=p.x; if(p.y>maxy)maxy=p.y; }
				if (px < minx || px > maxx || py < miny || py > maxy) continue;

				// inside path?
				if (U.pointInPolygon(px, py, sp)) return obj;
			}
		}
		return null;
	}

	/* ---------------- action ---------------- */
	_applyFillColor(obj, color){
		const g = obj.graphic2d;
		const before = { fill: !!g.fill, fillColor: g.fillColor };
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

	/* ---------------- events ---------------- */
	_onDown(e){
		if (!this._isActive()) return;
		e.preventDefault();

		const mouse = U.mouseToCanvas(this.canvas, e);
		const color = _editor.draw2d?.fillColor || '#000000ff';

		const obj = this._pickFilledTarget(mouse);
		if (!obj) return;

		this._applyFillColor(obj, color);
		_editor?.requestRender?.();
	}

	_onMove(e){
		if (!this._isActive()) return;
		this.cursor = U.mouseToCanvas(this.canvas, e);
	}
	_onBlur(){ this.cursor = null; }

	render() {}
}