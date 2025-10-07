// d2dgizmo.js
export default class D2DGizmo {
	constructor(d2drenderer) {
		this.d2drenderer = d2drenderer;
		this.canvas = this.d2drenderer.domElement;
		this.ctx = this.d2drenderer.ctx;

		this.isDragging = false;
		this.dragStart = null;
		this.dragEnd = null;

		this._onPointerDown = this.onPointerDown.bind(this);
		this._onPointerMove = this.onPointerMove.bind(this);
		this._onPointerUp = this.onPointerUp.bind(this);
		this._onDblClick = this.onDblClick.bind(this);

		this.canvas.addEventListener('pointerdown', this._onPointerDown);
		this.canvas.addEventListener('pointermove', this._onPointerMove);
		window.addEventListener('pointerup', this._onPointerUp);
		this.canvas.addEventListener('dblclick', this._onDblClick);
	}

	dispose() {
		this.canvas.removeEventListener('pointerdown', this._onPointerDown);
		this.canvas.removeEventListener('pointermove', this._onPointerMove);
		window.removeEventListener('pointerup', this._onPointerUp);
		this.canvas.removeEventListener('dblclick', this._onDblClick);
	}

	render() {
		// draw marquee if dragging
		if (!this.isDragging || !this.dragStart || !this.dragEnd) return;

		const ctx = this.ctx;
		const r = this._rectFromPoints(this.dragStart, this.dragEnd);

		ctx.save();

		// work in device pixels
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.strokeStyle = 'rgba(0, 153, 255, 1)';
		ctx.fillStyle = 'rgba(0, 153, 255, 0.15)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.rect(r.x, r.y, r.w, r.h);
		ctx.fill();
		ctx.stroke();

		// restore project transform
		ctx.setTransform(
			this.d2drenderer.pixelRatio * this.d2drenderer.viewScale, 0,
			0, this.d2drenderer.pixelRatio * this.d2drenderer.viewScale,
			0, 0
		);
		ctx.restore();
	}

	onPointerDown(e) {
		this.canvas.setPointerCapture?.(e.pointerId);

		const p = this._clientToCanvasPixels(e);
		this.isDragging = true;
		this.dragStart = p;
		this.dragEnd = p;
	}

	onPointerMove(e) {
		if (!this.isDragging) return;
		this.dragEnd = this._clientToCanvasPixels(e);
		// re-render to update marquee
		this.d2drenderer.render();
	}

	onPointerUp(e) {
		if (!this.isDragging) return;

		const wasDrag = this._dragDistance() > 4;
		const shift = e.shiftKey;

		if (wasDrag) {
			// area select
			const rect = this._rectFromPoints(this.dragStart, this.dragEnd);
			const hits = this.hitTestRect(rect);
			this.applySelection(hits, { replace: !shift, toggle: false, add: shift });
		} else {
			// single click
			const pt = this._clientToProjectUnits(e); // for completeness (unused in hit), but we use pixel coords for hit
			const hit = this.hitTestPoint(this._clientToCanvasPixels(e), { preferStroke: true });
			if (hit) {
				if (shift) {
					// toggle selected state
					this.applySelection([hit], { replace: false, toggle: true, add: false });
				} else {
					this.applySelection([hit], { replace: true, toggle: false, add: false });
				}
			} else if (!shift) {
				// clear selection on empty click
				_editor.setSelection([]);
			}
		}

		this.isDragging = false;
		this.dragStart = null;
		this.dragEnd = null;

		this.d2drenderer.render();
	}

	onDblClick(e) {
		const hit = this.hitTestPoint(this._clientToCanvasPixels(e), { preferStroke: true });
		if (!hit) return;

		// If symbol → select the whole d3dobject
		if (hit.host?.symbol) {
			_editor.setSelection([hit.host]);
			this.d2drenderer.render();
			return;
		}

		// Non-symbol:
		// Double-click on a stroke/fill selects the entire graphic (Flash-like "select connected")
		if (hit.kind === 'vector-part') {
			const t = {
				kind: 'vector-part',
				host: hit.host,
				part: { type: 'graphic', graphicIndex: hit.part.graphicIndex }
			};
			_editor.setSelection([t]);
			this.d2drenderer.render();
		}
	}

	applySelection(items, mode) {
		// items: array of either d3dobjects or vector-part tokens
		if (mode.replace) {
			_editor.setSelection(items);
			return;
		}
		if (mode.toggle) {
			for (const it of items) {
				// naive toggle: try remove, else add
				if (_editor.removeSelection) {
					_editor.removeSelection([it]);
				} else {
					// fallback: if there's addSelection only, just add
					_editor.addSelection([it]);
				}
			}
			return;
		}
		if (mode.add) {
			_editor.addSelection(items);
		}
	}

	/* ---------------------------- Hit Testing ---------------------------- */

	hitTestPoint(pixelPoint, opts = { preferStroke: true }) {
		// Iterate from topmost (largest z) to back
		const list = this.d2drenderer
			.gather(this.d2drenderer.root)
			.sort((a, b) => b.position.z - a.position.z);

		const ctx = this.ctx;

		for (const d3dobject of list) {
			const graphic2d = d3dobject.graphic2d;
			if (!graphic2d || !Array.isArray(graphic2d._graphics)) continue;

			let world = this._accumulateTransform(d3dobject);

			// set same transform as drawing (device pixels coordinate space)
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.translate(world.pixelTx, world.pixelTy);
			if (world.rot) ctx.rotate(world.rot);
			if (world.sx !== 1 || world.sy !== 1) ctx.scale(world.sx, world.sy);

			// test each graphic; prefer stroke first if requested
			const indices = [...graphic2d._graphics.keys()];
			const order = opts.preferStroke ? [ 'stroke', 'fill' ] : [ 'fill', 'stroke' ];

			for (const pref of order) {
				for (const gi of indices) {
					const g = graphic2d._graphics[gi];
					const path = this._buildPath2D(g);

					if (pref === 'stroke' && g.line !== false) {
						ctx.lineWidth = Math.max(0.001, Number(g.lineWidth ?? 1)) * this.d2drenderer.pixelRatio * this.d2drenderer.viewScale;
						if (ctx.isPointInStroke(path, pixelPoint.x - world.canvasLeft, pixelPoint.y - world.canvasTop)) {
							ctx.restore();
							return this._makeHitToken(d3dobject, g, gi, 'stroke');
						}
					}

					if (pref === 'fill' && g.fill !== false) {
						if (ctx.isPointInPath(path, pixelPoint.x - world.canvasLeft, pixelPoint.y - world.canvasTop)) {
							ctx.restore();
							return this._makeHitToken(d3dobject, g, gi, 'fill');
						}
					}
				}
			}

			ctx.restore();
		}
		return null;
	}

	hitTestRect(pixelRect) {
		// Basic area select: collect anything whose transformed bounding box intersects rect
		const list = this.d2drenderer
			.gather(this.d2drenderer.root)
			.sort((a, b) => a.position.z - b.position.z);

		const results = [];

		for (const d3dobject of list) {
			const graphic2d = d3dobject.graphic2d;
			if (!graphic2d || !Array.isArray(graphic2d._graphics)) continue;

			const world = this._accumulateTransform(d3dobject);

			for (let gi = 0; gi < graphic2d._graphics.length; gi++) {
				const g = graphic2d._graphics[gi];
				const bbox = this._graphicPixelBounds(g, world);
				if (this._rectsIntersect(pixelRect, bbox)) {
					// symbol → select object; non-symbol → select graphic part (whole graphic)
					if (d3dobject.symbol) {
						results.push(d3dobject);
					} else {
						results.push({
							kind: 'vector-part',
							host: d3dobject,
							part: { type: 'graphic', graphicIndex: gi }
						});
					}
				}
			}
		}
		return results;
	}

	_makeHitToken(d3dobject, g, graphicIndex, which) {
		if (d3dobject.symbol) {
			return d3dobject;
		}
		return {
			kind: 'vector-part',
			host: d3dobject,
			part: { type: which, graphicIndex }
		};
	}

	_buildPath2D(g) {
		const pts = g._points || [];
		const path = new Path2D();
		if (pts.length < 1) return path;

		// if you want rounded corners for hit too, you can replicate your rounded logic here
		path.moveTo(pts[0].x, pts[0].y);
		for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
		// treat as closed when first == last
		const first = pts[0];
		const last = pts[pts.length - 1];
		const isClosed = pts.length >= 3 && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;
		if (isClosed) path.closePath();
		return path;
	}

	_graphicPixelBounds(g, world) {
		// transform each point into device pixels and bound
		const pts = g._points || [];
		let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;

		const cos = Math.cos(world.rot || 0);
		const sin = Math.sin(world.rot || 0);

		for (const p of pts) {
			// local -> scaled -> rotated -> translated (project) -> to canvas pixels
			let lx = p.x * world.sx;
			let ly = p.y * world.sy;
			let rx = lx * cos - ly * sin;
			let ry = lx * sin + ly * cos;
			let px = (rx + world.tx) * world.dprScale + world.canvasLeft; // device pixels
			let py = (ry + world.ty) * world.dprScale + world.canvasTop;

			if (px < minx) minx = px;
			if (py < miny) miny = py;
			if (px > maxx) maxx = px;
			if (py > maxy) maxy = py;
		}

		// inflate by stroke width for strokes
		const lw = Math.max(0.001, Number(g.lineWidth ?? 1)) * world.dprScale * 0.5;
		minx -= lw; miny -= lw; maxx += lw; maxy += lw;

		return { x: minx, y: miny, w: (maxx - minx), h: (maxy - miny) };
	}

	_rectFromPoints(a, b) {
		const x = Math.min(a.x, b.x);
		const y = Math.min(a.y, b.y);
		const w = Math.abs(a.x - b.x);
		const h = Math.abs(a.y - b.y);
		return { x, y, w, h };
	}

	_rectsIntersect(a, b) {
		return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
	}

	_clientToCanvasPixels(e) {
		const rect = this.canvas.getBoundingClientRect();
		const xCss = e.clientX - rect.left;
		const yCss = e.clientY - rect.top;
		const scaleX = this.canvas.width / rect.width;
		const scaleY = this.canvas.height / rect.height;
		return { x: xCss * scaleX, y: yCss * scaleY };
	}

	_clientToProjectUnits(e) {
		// if needed elsewhere
		const p = this._clientToCanvasPixels(e);
		const s = this.d2drenderer.pixelRatio * this.d2drenderer.viewScale || 1;
		return { x: p.x / s, y: p.y / s };
	}

	_accumulateTransform(d3dobject) {
		// world transform in project units
		let tx = 0, ty = 0, sx = 1, sy = 1, rot = 0;
		let n = d3dobject;
		while (n) {
			tx += Number(n.position?.x) || 0;
			ty += Number(n.position?.y) || 0;
			sx *= (Number(n.scale?.x) || 1);
			sy *= (Number(n.scale?.y) || 1);
			rot += (Number(n.rotation?.z) || 0);
			n = n.parent;
		}

		// mapping project units → device pixels
		const dprScale = (this.d2drenderer.pixelRatio || 1) * (this.d2drenderer.viewScale || 1);

		// canvas CSS offset in device pixels
		const rect = this.canvas.getBoundingClientRect();
		const cssToPixelsX = this.canvas.width / rect.width;
		const cssToPixelsY = this.canvas.height / rect.height;
		const canvasLeft = 0; // we already converted to canvas pixel space before subtracting in isPointInPath

		return {
			tx, ty, sx, sy, rot,
			dprScale,
			pixelTx: tx * dprScale,
			pixelTy: ty * dprScale,
			canvasLeft: 0,
			canvasTop: 0
		};
	}
	_dragDistance() {
		if (!this.dragStart || !this.dragEnd)
			return 0;
	
		const dx = this.dragEnd.x - this.dragStart.x;
		const dy = this.dragEnd.y - this.dragStart.y;
		return Math.sqrt(dx * dx + dy * dy);
	}
}