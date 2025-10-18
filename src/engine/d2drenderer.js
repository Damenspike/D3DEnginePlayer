// d2drenderer.js
import D2DGizmo from './d2dgizmo.js';
import D2DEdit from './d2dedit.js';
import D2DDraw from './d2ddraw.js';
import {
	approx,
	hexToRgba
} from './d3dutility.js';

export default class D2DRenderer {
	constructor({width, height, pixelRatio, root, addGizmo = false} = {}) {
		this.pixelRatio = pixelRatio ?? (window.devicePixelRatio || 1);
		this.width = width ?? 760;
		this.height = height ?? 480;
		this.root = root;
		this._dirty = true;
		
		this.domElement = document.createElement('canvas');
		this.domElement.style.display = 'block';
		this.domElement.style.width = '100%';
		this.domElement.style.height = '100%';
		this.ctx = this.domElement.getContext('2d');
		
		this.setSize(this.width, this.height);
		
		if(addGizmo) {
			this.gizmo = new D2DGizmo(this);
			this.edit = new D2DEdit(this);
			this.drawer = new D2DDraw(this);
		}
	}
	
	refreshSize() {
		this.setSize(this.width, this.height);
	}
	setSize(width, height) {
		const projectWidth = this.root.manifest.width || 760;
		const projectHeight = this.root.manifest.height || 480;
		
		// Calculate scale to fit canvas within parent while preserving aspect ratio
		const scale = Math.min(width / Math.max(projectWidth, 1), height / Math.max(projectHeight, 1)) || 1;
		const displayWidth = Math.round(projectWidth * scale);
		const displayHeight = Math.round(projectHeight * scale);
	
		// Ensure canvas is positioned absolutely relative to the absolute parent
		this.domElement.style.position = 'absolute';
		this.domElement.style.width = `${displayWidth}px`;
		this.domElement.style.height = `${displayHeight}px`;
		this.domElement.style.left = `${(width - displayWidth) / 2}px`;
		this.domElement.style.top = `${(height - displayHeight) / 2}px`;
	
		// Set canvas backing store size (accounting for device pixel ratio)
		this.domElement.width = displayWidth * this.pixelRatio;
		this.domElement.height = displayHeight * this.pixelRatio;
		
		this.viewScale = scale;
		this.width = width;
		this.height = height;
	
		// Apply transform to context for proper scaling
		this.ctx.setTransform(
			this.pixelRatio * scale, 0,
			0, this.pixelRatio * scale,
			0, 0
		);
	}
	setPixelRatio(pixelRatio) {
		this.pixelRatio = Number(pixelRatio) || 1;
		this.setSize(this.width, this.height);
	}
	clear() {
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.clearRect(0, 0, this.domElement.width, this.domElement.height);
		
		this.ctx.setTransform(
			this.pixelRatio * this.viewScale, 0,
			0, this.pixelRatio * this.viewScale,
			0, 0
		);
	}
	render() {
		if(!this._dirty)
			return;
		
		this.clear();
		
		const ctx = this.ctx;
		
		// ---- Apply view (pan+zoom) once for the whole scene ----
		const pr  = this.pixelRatio || 1;
		const vs  = this.viewScale  || 1;                 // >= 1
		const off = this.viewOffset || { x: 0, y: 0 };    // in device pixels
		
		ctx.save();
		// pan is in device pixels; then scale in device pixels
		ctx.translate(off.x, off.y);
		ctx.scale(pr * vs, pr * vs);
		
		// Do the draw
		this.renderParent(this.root);
		
		ctx.restore();
		
		//this._dirty = false;
	}
	renderParent(d3dobject) {
		this.draw(d3dobject);
		
		[...d3dobject.children]
		.sort((a, b) => (a.depth || 0) - (b.depth || 0))
		.forEach(d3dchild => this.renderParent(d3dchild));
	}
	renderGizmos() {
		this.gizmo?.render();
		this.edit?.render();
		this.drawer?.render();
	}
	draw(d3dobject) {
		const graphic = d3dobject.graphic2d;
		
		if(!graphic) 
			return;
		
		this.drawVector(d3dobject);
		
		if(d3dobject.hasComponent('Text2D'))
			this.drawText(d3dobject);
			
		if(d3dobject.hasComponent('Bitmap2D'))
			this.drawBitmap(d3dobject);
	}
	drawBitmap(d3dobject) {
		const ctx = this.ctx;
		if (!d3dobject.visible) return;
	
		const bitmap2d = d3dobject.getComponent('Bitmap2D');
		if (!bitmap2d) return;
	
		const props = bitmap2d.bitmapProperties;
		const zip = d3dobject.root.zip;
		const uri = d3dobject.root.resolvePath(props.source);
		if (!uri) return;
	
		// ---- rect from graphic2d ----
		const pts = d3dobject.graphic2d._paths[0];
		let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
		for (let i = 1; i < pts.length; i++) {
			const p = pts[i];
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.y > maxY) maxY = p.y;
		}
		const boxX = minX, boxY = minY, boxW = maxX - minX, boxH = maxY - minY;
		if (boxW <= 0 || boxH <= 0) return;
	
		// ---- transform chain (match drawVector) ----
		let m = new DOMMatrix();
		const chain = [];
		for (let n = d3dobject; n; n = n.parent) chain.push(n);
		chain.reverse();
		for (const o of chain) {
			m = m
				.translate(Number(o.position.x) || 0, Number(o.position.y) || 0)
				.rotate((Number(o.rotation.z) || 0) * 180 / Math.PI)
				.scale(Number(o.scale.x) || 1, Number(o.scale.y) || 1);
		}
	
		const gs = (this.pixelRatio || 1) * (this.viewScale || 1);
		const isInFocus = window._player || (_editor.focus === d3dobject) || (_editor.focus.containsChild(d3dobject));
		const masterAlpha = isInFocus ? 1 : 0.2;
		const alpha = Math.max(0, Math.min(1, d3dobject.opacity ?? 1));
		if (alpha <= 0) return;
	
		// ---- image cache ----
		this._imageCache = this._imageCache || new Map();
		let entry = this._imageCache.get(uri);
		if (!entry) {
			entry = { status: 'loading', img: null, w: 0, h: 0, objectURL: null };
			this._imageCache.set(uri, entry);
	
			const file = zip.file(uri);
			if (file) {
				file.async('blob').then(blob => {
					const url = URL.createObjectURL(blob);
					const img = new Image();
					img.onload = () => {
						entry.status = 'ready';
						entry.img = img;
						entry.w = img.naturalWidth || img.width;
						entry.h = img.naturalHeight || img.height;
						entry.objectURL = url;
					};
					img.onerror = () => { entry.status = 'error'; URL.revokeObjectURL(url); };
					img.src = url;
				});
			} else {
				const img = new Image();
				img.crossOrigin = 'anonymous';
				img.onload = () => {
					entry.status = 'ready';
					entry.img = img;
					entry.w = img.naturalWidth || img.width;
					entry.h = img.naturalHeight || img.height;
				};
				img.onerror = () => { entry.status = 'error'; };
				img.src = uri;
			}
			return;
		}
		if (entry.status !== 'ready') return;
	
		// ---- render params ----
		const fit = props.fit || 'contain';
		const alignX = props.alignX || 'center';
		const alignY = props.alignY || 'center';
		const smoothing = props.imageSmoothing !== false;
		const flipX = !!props.flipX, flipY = !!props.flipY;
	
		let sx = 0, sy = 0, sw = entry.w, sh = entry.h;
		if (props.sourceRect) {
			sx = props.sourceRect.x | 0;
			sy = props.sourceRect.y | 0;
			sw = props.sourceRect.w | 0;
			sh = props.sourceRect.h | 0;
		}
	
		const srcAspect = sw / sh;
		const boxAspect = boxW / boxH;
		let dw = boxW, dh = boxH;
	
		if (fit === 'contain') {
			if (srcAspect > boxAspect) { dw = boxW; dh = dw / srcAspect; }
			else { dh = boxH; dw = dh * srcAspect; }
		} else if (fit === 'cover') {
			if (srcAspect > boxAspect) { dh = boxH; dw = dh * srcAspect; }
			else { dw = boxW; dh = dw / srcAspect; }
		} else if (fit === 'none') {
			dw = Math.min(sw, boxW); dh = Math.min(sh, boxH);
		}
	
		let dx = boxX, dy = boxY;
		if (alignX === 'left') dx = boxX;
		else if (alignX === 'right') dx = boxX + (boxW - dw);
		else dx = boxX + (boxW - dw) * 0.5;
	
		if (alignY === 'top') dy = boxY;
		else if (alignY === 'bottom') dy = boxY + (boxH - dh);
		else dy = boxY + (boxH - dh) * 0.5;
	
		// ---- draw ----
		ctx.save();
		ctx.globalAlpha *= alpha * masterAlpha;
	
		ctx.setTransform(gs, 0, 0, gs, 0, 0);
		ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
	
		ctx.beginPath();
		ctx.rect(boxX, boxY, boxW, boxH);
		ctx.clip();
	
		ctx.imageSmoothingEnabled = smoothing;
	
		if (flipX || flipY) {
			const cx = dx + dw * 0.5, cy = dy + dh * 0.5;
			ctx.translate(cx, cy);
			ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
			ctx.translate(-cx, -cy);
		}
	
		ctx.drawImage(entry.img, sx, sy, sw, sh, dx, dy, dw, dh);
		ctx.restore();
	}
	drawText(d3dobject) {
		const ctx = this.ctx;
		if (!d3dobject?.visible) return;
	
		const text2d = d3dobject.getComponent('Text2D');
		if (!text2d) return;
	
		const t2d = text2d.textProperties || {};
		const text = String(t2d.text ?? '');
		if (!text) return;
	
		const alpha = Number.isFinite(d3dobject.opacity) ? Math.max(0, Math.min(1, d3dobject.opacity)) : 1;
		if (alpha <= 0) return;
	
		// ---------- font / paint ----------
		const fontSize = Number(t2d.fontSize ?? 16);
		const fontFamily = t2d.fontFamily ?? 'sans-serif';
		const fontStyle = t2d.fontStyle ?? 'normal';
		const fontVariant = t2d.fontVariant ?? 'normal';
		const fontWeight = t2d.fontWeight ?? 'normal';
		const fill = t2d.fill !== false;
		const fillStyle = t2d.fillStyle ?? '#000';
		const stroke = t2d.stroke === true;
		const strokeStyle = t2d.strokeStyle ?? '#000';
		const strokeWidth = Number(t2d.strokeWidth ?? 0);
	
		// ---------- layout ----------
		const align = t2d.align ?? 'left'; // left|center|right
		const lineHeight = (fontSize * 1.25) * Number(t2d.lineHeight ?? 1);
		const wrap = (t2d.wrap ?? true);
		const breakWords = (t2d.breakWords ?? false);
		const letterSpacing = Number(t2d.letterSpacing ?? 0);
	
		const padL = Number(t2d.paddingLeft ?? 0);
		const padR = Number(t2d.paddingRight ?? 0);
		const padT = Number(t2d.paddingTop ?? 0);
		const padB = Number(t2d.paddingBottom ?? 0);
	
		// ---------- scrolling (on component) ----------
		const scrollX = Number.isFinite(text2d.scrollX) ? text2d.scrollX : 0;
		const scrollY = Number.isFinite(text2d.scrollY) ? text2d.scrollY : 0;
	
		// ---------- derive textbox from graphic2d rect ----------
		const g2d = d3dobject.graphic2d || {};
		const path0 = (Array.isArray(g2d._paths) && g2d._paths[0] && g2d._paths[0].length) ? g2d._paths[0] : null;
	
		const pathBounds = (pts) => {
			if (!pts || !pts.length) return { x:0, y:0, w:0, h:0, ok:false };
			let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
			for (let i=1;i<pts.length;i++) {
				const p = pts[i];
				if (!p) continue;
				if (p.x < minX) minX = p.x;
				if (p.x > maxX) maxX = p.x;
				if (p.y < minY) minY = p.y;
				if (p.y > maxY) maxY = p.y;
			}
			return { x:minX, y:minY, w:Math.max(0, maxX-minX), h:Math.max(0, maxY-minY), ok:true };
		};
	
		const box = pathBounds(path0);
		// If there is no rect geometry, we can't sensibly place text; bail early
		if (!box.ok || box.w <= 0 || box.h <= 0) return;
	
		// ---------- transform chain (match drawVector) ----------
		let m = new DOMMatrix();
		const chain = [];
		for (let n = d3dobject; n; n = n.parent) chain.push(n);
		chain.reverse();
		for (const o of chain) {
			const tx = Number(o.position?.x) || 0;
			const ty = Number(o.position?.y) || 0;
			const rz = Number(o.rotation?.z) || 0;
			const sx = Number(o.scale?.x) || 1;
			const sy = Number(o.scale?.y) || 1;
			m = m.translate(tx, ty).rotate(rz * 180 / Math.PI).scale(sx, sy);
		}
	
		const gs = (this.pixelRatio || 1) * (this.viewScale || 1);
		const isInFocus = window._player || (_editor?.focus === d3dobject) || (_editor?.focus?.containsChild?.(d3dobject));
		const masterAlpha = isInFocus ? 1 : 0.2;
	
		// ---------- helpers ----------
		const buildFont = () => `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}px ${fontFamily}`;
		const measure = (s) => ctx.measureText(s);
	
		const lineWidthAdv = (s) => {
			if (!letterSpacing) return measure(s).width;
			let w = 0;
			for (let i=0;i<s.length;i++) w += measure(s[i]).width;
			if (s.length > 1) w += letterSpacing * (s.length - 1);
			return w;
		};
	
		const wrapLine = (raw, contentW) => {
			if (!contentW || !wrap) return [raw];
			const words = raw.split(/(\s+)/); // keep spaces
			const out = [];
			let cur = '';
			const pushCur = () => { if (cur) { out.push(cur); cur = ''; } };
			for (let i=0;i<words.length;i++) {
				const w = words[i];
				if (!w) continue;
				const fitsToken = lineWidthAdv(w) <= contentW;
				if (!breakWords && !fitsToken) {
					pushCur();
					let part = '';
					for (let j=0;j<w.length;j++) {
						const next = part + w[j];
						if (lineWidthAdv(next) > contentW) {
							if (part) out.push(part);
							part = w[j];
						} else {
							part = next;
						}
					}
					if (part) out.push(part);
					continue;
				}
				if (!cur) {
					cur = w.trimStart();
					if (!cur && w.trim() === '') cur = w; // preserve leading space token if any
					if (lineWidthAdv(cur) > contentW) {
						let part = '';
						for (let j=0;j<cur.length;j++) {
							const next = part + cur[j];
							if (lineWidthAdv(next) > contentW) {
								if (part) out.push(part);
								part = cur[j];
							} else {
								part = next;
							}
						}
						cur = part;
					}
					continue;
				}
				const test = cur + w;
				if (lineWidthAdv(test) <= contentW) {
					cur = test;
				} else {
					out.push(cur);
					cur = w.trimStart();
				}
			}
			pushCur();
			return out;
		};
	
		const buildLines = (contentW) => {
			const rawLines = text.split('\n');
			const lines = [];
			for (let i=0;i<rawLines.length;i++) {
				const segs = wrapLine(rawLines[i], contentW);
				for (let k=0;k<segs.length;k++) lines.push(segs[k]);
			}
			return lines;
		};
	
		const drawSpaced = (method, s, x, y) => {
			if (!letterSpacing) { ctx[method](s, x, y); return; }
			let acc = 0;
			for (let i=0;i<s.length;i++) {
				const ch = s[i];
				ctx[method](ch, x + acc, y);
				acc += measure(ch).width + letterSpacing;
			}
		};
	
		// ---------- paint setup ----------
		ctx.save();
		ctx.globalAlpha *= alpha * masterAlpha;
	
		// Match the transform pipeline used by vectors
		ctx.setTransform(gs, 0, 0, gs, 0, 0);
		ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
	
		ctx.font = buildFont();
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		ctx.shadowBlur = Number(t2d.shadowBlur ?? 0);
		ctx.shadowColor = t2d.shadowColor ?? 'rgba(0,0,0,0)';
		ctx.shadowOffsetX = Number(t2d.shadowOffsetX ?? 0);
		ctx.shadowOffsetY = Number(t2d.shadowOffsetY ?? 0);
	
		// Textbox & content area (all in local space after transform)
		const boxX = box.x, boxY = box.y, boxW = box.w, boxH = box.h;
		const contentW = Math.max(0, boxW - padL - padR);
	
		const lines = buildLines(contentW || null);
		const totalHeight = padT + (lines.length * lineHeight) + padB;
	
		// Clip to the rect (like vectors do with their paths)
		if (boxW > 0 && boxH > 0) {
			ctx.beginPath();
			ctx.rect(boxX, boxY, boxW, boxH);
			ctx.clip();
		}
	
		// Scroll + alignment (local coords)
		const baseX = boxX + padL - (wrap ? 0 : scrollX);
		let y = boxY + padT - scrollY;
	
		for (let i=0;i<lines.length;i++) {
			const s = lines[i];
			let x = baseX;
	
			if (contentW) {
				const w = lineWidthAdv(s);
				if (align === 'center') x += Math.max(0, (contentW - w) * 0.5);
				else if (align === 'right') x += Math.max(0, (contentW - w));
			}
	
			if (stroke && strokeWidth > 0) {
				ctx.lineWidth = Math.max(0.001, strokeWidth);
				ctx.strokeStyle = (typeof hexToRgba === 'function') ? hexToRgba(strokeStyle) : strokeStyle;
				drawSpaced('strokeText', s, x, y);
			}
			if (fill) {
				ctx.fillStyle = (typeof hexToRgba === 'function') ? hexToRgba(fillStyle) : fillStyle;
				drawSpaced('fillText', s, x, y);
			}
			y += lineHeight;
		}
	
		ctx.restore();
	}
	drawVector(d3dobject) {
		const ctx = this.ctx;
		
		if (!d3dobject?.visible) return;
	
		const alpha   = Number.isFinite(d3dobject.opacity) ? Math.max(0, Math.min(1, d3dobject.opacity)) : 1;
		const graphic = d3dobject.graphic2d || {};
	
		const gLineEnabled = graphic.line !== false;
		const gLineWidth   = Number(graphic.lineWidth ?? 1);
		const gLineColor   = graphic.lineColor ?? '#ffffff';
		const lineCap      = graphic.lineCap  ?? 'round';
		const lineJoin     = graphic.lineJoin ?? 'round';
		const miterLimit   = Number(graphic.miterLimit ?? 10);
	
		const fillEnabled  = graphic.fill !== false;
		const fillColor    = graphic.fillColor ?? '#ffffffff';
		const borderRadius = Math.max(0, Number(graphic.borderRadius ?? 0));
	
		const outlineOn    = graphic.outline === true;
		const outlineColor = graphic.outlineColor ?? gLineColor;
		// Treat outlineWidth as the *visual* thickness outside the shape:
		const outlineWidth = Number(graphic.outlineWidth ?? gLineWidth);
	
		let paths = Array.isArray(graphic._paths) ? graphic._paths.filter(p => Array.isArray(p)) : [];
		if (Array.isArray(graphic._points)) { paths.push([...graphic._points]); delete graphic._points; }
		graphic._paths = paths;
		if (paths.length === 0) return;
	
		const makeRawPath = (pts, closed) => {
			const p = new Path2D();
			p.moveTo(pts[0].x, pts[0].y);
			for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
			if (closed) p.closePath();
			return p;
		};
	
		const makeRoundedPath = (pts, radius) => {
			const base = pts.slice(0, -1);
			const count = base.length;
			if (count < 3) return null;
			const get = i => base[(i + count) % count];
			const p = new Path2D();
			for (let i = 0; i < count; i++) {
				const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1);
				const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
				const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
				const len1 = Math.hypot(v1x, v1y) || 1;
				const len2 = Math.hypot(v2x, v2y) || 1;
				const r = Math.min(radius, len1 / 2, len2 / 2);
				const inX  = p1.x - (v1x / len1) * r, inY  = p1.y - (v1y / len1) * r;
				const outX = p1.x + (v2x / len2) * r, outY = p1.y + (v2y / len2) * r;
				if (i === 0) p.moveTo(inX, inY); else p.lineTo(inX, inY);
				p.quadraticCurveTo(p1.x, p1.y, outX, outY);
			}
			p.closePath();
			return p;
		};
	
		let m = new DOMMatrix();
		const chain = [];
		for (let n = d3dobject; n; n = n.parent) chain.push(n);
		chain.reverse();
		for (const o of chain) {
			const tx = Number(o.position?.x) || 0;
			const ty = Number(o.position?.y) || 0;
			const rz = Number(o.rotation?.z) || 0;
			const sx = Number(o.scale?.x) || 1;
			const sy = Number(o.scale?.y) || 1;
			m = m.translate(tx, ty).rotate(rz * 180 / Math.PI).scale(sx, sy);
		}
	
		const gs = (this.pixelRatio || 1) * (this.viewScale || 1);
		const isInFocus = window._player || (_editor?.focus === d3dobject) || (_editor?.focus?.containsChild?.(d3dobject));
		const masterAlpha = isInFocus ? 1 : 0.2;
	
		// Build a combined (union-style) path for all CLOSED contours to support even-odd fill/holes.
		const combo = new Path2D();
		const closedPaths = [];
		const openStrokes = [];
	
		for (const pts of paths) {
			if (!Array.isArray(pts) || pts.length === 0) continue;
			const points = pts.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
			if (points.length === 0) continue;
	
			const first = points[0], last = points[points.length - 1];
			const isClosed = points.length >= 3 && approx(first.x, last.x) && approx(first.y, last.y);
	
			if (isClosed) {
				const raw = makeRawPath(points, true);
				const rounded = (borderRadius > 0 && points.length >= 3) ? makeRoundedPath(points, borderRadius) : null;
				const path = rounded || raw;
				combo.addPath(path);
				closedPaths.push({ path, points });
			} else {
				openStrokes.push(points);
			}
		}
	
		const BIG = 1e6;
	
		ctx.save();
		ctx.globalAlpha *= alpha * masterAlpha;
		ctx.setTransform(gs, 0, 0, gs, 0, 0);
		ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
	
		// FILL (even-odd so overlaps subtract and holes render correctly)
		if (fillEnabled && closedPaths.length) {
			ctx.fillStyle = hexToRgba(fillColor);
			ctx.fill(combo, 'evenodd');
		}
	
		// OUTLINE: outside-only around the combined closed shape.
		// We clip to the "outside" region (big rect minus combo) and stroke with 2x width.
		if (outlineOn && closedPaths.length && outlineWidth > 0) {
			ctx.save();
			const outside = new Path2D();
			outside.rect(-BIG, -BIG, BIG * 2, BIG * 2); // huge rect
			outside.addPath(combo);                      // subtract with even-odd clip
			ctx.clip(outside, 'evenodd');
	
			ctx.lineWidth   = Math.max(0.001, outlineWidth * 2); // draw 2×, show only the outer half
			ctx.strokeStyle = hexToRgba(outlineColor);
			ctx.lineCap     = lineCap;
			ctx.lineJoin    = lineJoin;
			ctx.miterLimit  = miterLimit;
			ctx.stroke(combo);
			ctx.restore();
		}
	
		// Regular LINE strokes (centered). Keeps previous behaviour for open/closed as “line” style.
		if (gLineEnabled) {
			// closed
			for (const { path } of closedPaths) {
				ctx.lineWidth   = Math.max(0.001, gLineWidth);
				ctx.strokeStyle = hexToRgba(gLineColor);
				ctx.lineCap     = lineCap;
				ctx.lineJoin    = lineJoin;
				ctx.miterLimit  = miterLimit;
				ctx.stroke(path);
			}
			// open
			for (const points of openStrokes) {
				if (points.length < 2) continue;
				ctx.beginPath();
				ctx.moveTo(points[0].x, points[0].y);
				for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
				ctx.lineWidth   = Math.max(0.001, gLineWidth);
				ctx.strokeStyle = hexToRgba(gLineColor);
				ctx.lineCap     = lineCap;
				ctx.lineJoin    = lineJoin;
				ctx.miterLimit  = miterLimit;
				ctx.stroke();
			}
		}
	
		ctx.restore();
	}
}