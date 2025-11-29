// d2drenderer.js
import * as THREE from 'three';

import D2DGizmo from './d2dgizmo.js';
import D2DEdit from './d2dedit.js';
import D2DDraw from './d2ddraw.js';
import D2DTextInput from './d2dtextinput.js';
import {
	approx,
	hexToRgba
} from './d3dutility.js';
import {
	buildCompoundPathForGraphic,
	worldMatrix,
	worldOpacity,
	toCanvasPaint,
	parseRadialGradient,
	parseLinearGradient,
	hex8ToRgba
} from './d2dutility.js';
import {
	onMouseUp,
	onMouseDown,
	onMouseMove,
	onMouseWheel
} from './d2dingame.js';

const masterUnfocusAlpha = 0.6;

export default class D2DRenderer {
	get pixelRatio() {
		if(this.__pr === undefined)
			this.__pr = 1;
		
		return this.__pr * (this.pixelScale || 1);
	}
	set pixelRatio(v) {
		this.__pr = v;
	}
	
	get viewScale() {
		if(this.__viewScale === undefined)
			this.__viewScale = 1;
			
		if(window._player)
			return this.__viewScale;
		
		return this.__viewScale * this._editor.viewScale;
	}
	set viewScale(v) {
		this.__viewScale = v;
	}
	
	get viewOffset() {
		if(this.__viewOffset === undefined)
			this.__viewOffset = new THREE.Vector2();
		
		if(window._player)
			return this.__viewOffset;
			
		return this.__viewOffset.clone().add(this._editor.viewOffset);
	}
	set viewOffset(v) {
		if(!v)
			this.__viewOffset = new THREE.Vector2();
		if(v.isVector2)
			this.__viewOffset = v;
		else
			this.__viewOffset = new THREE.Vector2(v.x, v.y);
	}
	
	constructor({width, height, pixelRatio, root, addGizmo = false} = {}) {
		this.pixelRatio = pixelRatio ?? (window.devicePixelRatio || 1);
		this.pixelScale = 1;
		this.drawScale = 1;
		this.width = width ?? 760;
		this.height = height ?? 480;
		this.root = root;
		this._dirty = true;
		this._renderObjects = [];
		this._editor = {
			viewScale: 1,
			viewOffset: new THREE.Vector2()
		}
		
		this.domElement = document.createElement('canvas');
		this.domElement.style.display = 'block';
		this.domElement.style.width = '100%';
		this.domElement.style.height = '100%';
		this.ctx = this.domElement.getContext('2d');
		
		this.setSize(this.width, this.height);
		
		if(!window._editor)
			this.textInput = new D2DTextInput(this);
		
		if(addGizmo) {
			this.gizmo = new D2DGizmo(this);
			this.edit = new D2DEdit(this);
			this.drawer = new D2DDraw(this);
		}
		
		if(window._player) {
			_input.addEventListener('mouseup', onMouseUp);
			_input.addEventListener('mousedown', onMouseDown);
			_input.addEventListener('mousemove', onMouseMove);
			_input.addEventListener('wheel', onMouseWheel);
			
			_input.addEventListener('touchend', onMouseUp);
			_input.addEventListener('touchstart', onMouseDown);
			_input.addEventListener('touchmove', onMouseMove);
		}
	}
	
	refreshSize() {
		this.setSize(this.width, this.height);
	}
	applyDeviceTransform() {
		const pr  = this.pixelRatio || 1;
		const s   = this.viewScale  || 1;
		const off = this.viewOffset || { x: 0, y: 0 };
		this.ctx.setTransform(pr * s, 0, 0, pr * s, off.x, off.y);
	}
	setSize(width, height) {
		const pr = this.pixelRatio || 1;
		const projW = Math.max(this.root.manifest.width  | 0, 1) * this.drawScale;
		const projH = Math.max(this.root.manifest.height | 0, 1) * this.drawScale;
	
		// CSS size = window size
		this.domElement.style.position = 'absolute';
		this.domElement.style.left = '0';
		this.domElement.style.top  = '0';
		this.domElement.style.width  = `${width}px`;
		this.domElement.style.height = `${height}px`;
	
		// backing store size (device pixels)
		this.domElement.width  = Math.max(1, Math.round(width  * pr));
		this.domElement.height = Math.max(1, Math.round(height * pr));
	
		// letterbox scale in *CSS* pixels
		const scale = Math.min(width / projW, height / projH);
		this.viewScale = scale;
	
		// content size in *device* pixels
		const contentW = projW * pr * scale;
		const contentH = projH * pr * scale;
	
		// letterbox offset in *device* pixels
		this.viewOffset = {
			x: (this.domElement.width  - contentW) * 0.5,
			y: (this.domElement.height - contentH) * 0.5
		};
	
		this.width = width;
		this.height = height;
	
		// don't bake view here—call it at draw time
		this.ctx.setTransform(1,0,0,1,0,0);
	}
	getPixelRatio() {
		return this.pixelRatio;
	}
	setPixelRatio(pixelRatio) {
		this.pixelRatio = Number(pixelRatio) || 1;
		this.refreshSize();
	}
	getPixelScale() {
		return this.pixelScale;
	}
	setPixelScale(s) {
		this.pixelScale = s;
		this.refreshSize();
	}
	getDrawScale() {
		return this.drawScale;
	}
	setDrawScale(s) {
		this.drawScale = s;
		this.refreshSize();
	}
	clear() {
		const ctx = this.ctx;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, this.domElement.width, this.domElement.height);
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
		
		this.textInput?.beginFrame();
		
		this._renderObjects = [];
		
		// Do the draw
		this.renderParent(this.root);
		
		// Draw focus
		if(window._editor) {
			if(_editor.focus && _editor.focus != this.root) {
				this.drawFocusOverlay();
				this.renderParent(_editor.focus);
			}
			
			// Draw project frame
			this.drawProjectFrame();
		}
		
		this.textInput?.endFrame();
		
		//this._dirty = false;
	}
	renderParent(d3dobject) {
		if(!d3dobject.visible || d3dobject.__editorState.hidden || !d3dobject.enabled)
			return;
		
		this.draw(d3dobject);
		this._renderObjects.push(d3dobject);
		
		[...d3dobject.children]
		.sort((a, b) => (a.depth || 0) - (b.depth || 0))
		.forEach(d3dchild => this.renderParent(d3dchild));
	}
	renderGizmos() {
		this.gizmo?.render();
		this.edit?.render();
		this.drawer?.render();
		
		this.edit?.afterRender();
	}
	draw(d3dobject) {
		const graphic = d3dobject.graphic2d;
		
		if(!graphic) 
			return;
			
		const ctx = this.ctx;
		
		// Collect all ancestor nodes that have graphic2d.mask === true
		const maskAncestors = [];
		for (let n = d3dobject.parent; n; n = n.parent) {
			const g2d = n.graphic2d;
			if (g2d?.mask === true) 
				maskAncestors.push(n);
		}
		
		let clipped = false;
		if (maskAncestors.length > 0) {
			const pr  = this.pixelRatio || 1;
			const vs  = this.viewScale  || 1;
			const gs  = pr * vs;
			const off = this.viewOffset || { x: 0, y: 0 };
			
			// match the draw pipeline: Translate(off) * Scale(gs)
			const dev = new DOMMatrix().translateSelf(off.x, off.y).scaleSelf(gs, gs);
			
			ctx.save();
			// start from identity; we’ll clip with pre-transformed Path2Ds
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			
			for (const anc of maskAncestors) {
				const maskPathLocal = buildCompoundPathForGraphic(anc.graphic2d);
				if (!maskPathLocal) continue;
				
				// transform mask into device coords: device * world(ancestor)
				const mWorld = worldMatrix(anc);
				const mDev = dev.multiply(mWorld);
				
				const maskDevice = new Path2D();
				maskDevice.addPath(maskPathLocal, mDev);
				
				// intersect clips by calling clip multiple times
				ctx.clip(maskDevice, 'evenodd');
				clipped = true;
			}
		}
		
		this.drawVector(d3dobject);
		
		if (d3dobject.hasComponent('Text2D'))
			this.drawText(d3dobject);
		
		if (d3dobject.hasComponent('Bitmap2D'))
			this.drawBitmap(d3dobject);
		
		if (clipped) 
			ctx.restore(); // pop mask stack
	}
	drawBitmap(d3dobject) {
		const ctx = this.ctx;
	
		const bitmap2d = d3dobject.getComponent('Bitmap2D');
		if (!bitmap2d) return;
	
		const props = bitmap2d.component.properties;
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
		const masterAlpha = isInFocus ? 1 : masterUnfocusAlpha;
		const alpha = worldOpacity(d3dobject);
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
	
		this.applyDeviceTransform();
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
	
		const text2d = d3dobject.getComponent('Text2D');
		if (!text2d) return;
	
		const t2d  = text2d.textProperties || {};
		const text = String(t2d.text ?? '');
	
		// Gate input logic (do nothing if editor is open)
		const inputEnabled = (t2d.isInput === true) && !window._editor && !!this.textInput;
	
		// Only bail on empty text if NOT an input (inputs still need caret/selection)
		if (!text && !inputEnabled) return;
	
		const alpha = worldOpacity(d3dobject);
		if (alpha <= 0) return;
	
		// ---------- font / paint ----------
		const fontSize    = Number(t2d.fontSize ?? 16);
		const fontFamily  = t2d.fontFamily ?? 'sans-serif';
		const fontStyle   = t2d.fontStyle ?? 'normal';
		const fontVariant = t2d.fontVariant ?? 'normal';
		const fontWeight  = t2d.fontWeight ?? 'normal';
	
		const fill        = t2d.fill !== false;
		const fillStyle   = t2d.fillStyle ?? '#000';
	
		// Keep original stroke/outline semantics
		const strokeOn    = (t2d.stroke === true);
		const strokeStyle = t2d.strokeStyle ?? '#000';
		const strokeWidth = Math.max(0, Number(t2d.strokeWidth ?? 0));
	
		// ---------- layout ----------
		const align         = t2d.align  ?? 'left';   // left|center|right
		const valign        = t2d.valign ?? 'top';    // top|middle|bottom
		const lineHeightMul = Number(t2d.lineHeight ?? 1) || 1;
		const lineHeight    = (fontSize * 1.25) * lineHeightMul;
		const multiline		= !!(t2d.multiline ?? true);
		const wrap          = !!(t2d.wrap ?? true) && multiline;
		const breakWords    = !!(t2d.breakWords ?? false);
		const letterSpacing = Number(t2d.letterSpacing ?? 0);
	
		const padL = t2d.padding ? Number(t2d.paddingLeft   ?? 0) : 0;
		const padR = t2d.padding ? Number(t2d.paddingRight  ?? 0) : 0;
		const padT = t2d.padding ? Number(t2d.paddingTop    ?? 0) : 0;
		const padB = t2d.padding ? Number(t2d.paddingBottom ?? 0) : 0;
		
		const inputFormat = t2d.inputFormat || 'text';      // 'text' | 'password'
		const isPassword  = (inputFormat === 'password');
		const maskChar    = t2d.passwordMask || '•';
	
		// ---------- scrolling (on component) ----------
		const scrollX = Number.isFinite(text2d.scrollX) ? text2d.scrollX : 0;
		const scrollY = Number.isFinite(text2d.scrollY) ? text2d.scrollY : 0;
	
		// ---------- derive textbox from graphic2d rect ----------
		const g2d    = d3dobject.graphic2d || {};
		const path0  = (Array.isArray(g2d._paths) && g2d._paths[0] && g2d._paths[0].length) ? g2d._paths[0] : null;
	
		const visualCharAt = (i) => {
			if (!isPassword) 
				return text[i] ?? '';
			else
				return maskChar;
		};
		const pathBounds = (pts) => {
			if (!pts || !pts.length) return { x:0, y:0, w:0, h:0, ok:false };
			let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
			for (let i = 1; i < pts.length; i++) {
				const p = pts[i]; if (!p) continue;
				if (p.x < minX) minX = p.x;
				if (p.x > maxX) maxX = p.x;
				if (p.y < minY) minY = p.y;
				if (p.y > maxY) maxY = p.y;
			}
			return {
				x: minX,
				y: minY,
				w: Math.max(0, maxX - minX),
				h: Math.max(0, maxY - minY),
				ok: true
			};
		};
	
		const box = pathBounds(path0);
		if (!box.ok || box.w <= 0 || box.h <= 0) return;
	
		// ---------- transform chain (match drawVector) ----------
		let m = new DOMMatrix();
		{
			const chain = [];
			for (let n = d3dobject; n; n = n.parent) chain.push(n);
			chain.reverse();
			for (const o of chain) {
				const tx = Number(o.position?.x) || 0;
				const ty = Number(o.position?.y) || 0;
				const rz = Number(o.rotation?.z) || 0;
				const sx = Number(o.scale?.x)    || 1;
				const sy = Number(o.scale?.y)    || 1;
				m = m.translate(tx, ty).rotate(rz * 180 / Math.PI).scale(sx, sy);
			}
		}
	
		const gs = (this.pixelRatio || 1) * (this.viewScale || 1); // kept for parity, even if unused
		const isInFocus = window._player ||
			(_editor?.focus === d3dobject) ||
			(_editor?.focus?.containsChild?.(d3dobject));
		const masterAlpha = isInFocus ? 1 : masterUnfocusAlpha;
	
		// ---------- helpers ----------
		const buildFont = () => `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}px ${fontFamily}`;
		const measure   = (s) => ctx.measureText(s);
	
		const lineWidthAdv = (s) => {
			if (!s) return 0;
			if (!letterSpacing) return measure(s).width;
			let w = 0;
			for (let i = 0; i < s.length; i++) w += measure(s[i]).width;
			if (s.length > 1) w += letterSpacing * (s.length - 1);
			return w;
		};
	
		const wrapLine = (raw, contentW) => {
			if (!multiline || !contentW || !wrap) 
				return [raw];
	
			const words = raw.split(/(\s+)/); // keep spaces
			const out   = [];
			let cur     = '';
	
			const pushCur = () => { out.push(cur); cur = ''; };
	
			for (let i = 0; i < words.length; i++) {
				const w = words[i];
				if (!w) continue;
	
				const fitsToken = lineWidthAdv(w) <= contentW;
	
				if (!breakWords && !fitsToken) {
					if (cur) { out.push(cur); cur = ''; }
	
					let part = '';
					for (let j = 0; j < w.length; j++) {
						const next = part + w[j];
						if (lineWidthAdv(next) > contentW) {
							out.push(part);
							part = w[j];
						} else {
							part = next;
						}
					}
					out.push(part);
					continue;
				}
	
				if (!cur) {
					cur = w.trimStart();
					if (!cur && w.trim() === '') cur = w; // preserve space-only token
					if (lineWidthAdv(cur) > contentW) {
						let part = '';
						for (let j = 0; j < cur.length; j++) {
							const next = part + cur[j];
							if (lineWidthAdv(next) > contentW) {
								out.push(part);
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
				if (lineWidthAdv(test) <= contentW) cur = test;
				else { out.push(cur); cur = w.trimStart(); }
			}
	
			pushCur(); // push even empty line segments
			return out;
		};
	
		const drawSpaced = (method, s, x, y) => {
			if (!letterSpacing) {
				ctx[method](s, x, y);
				return;
			}
			let acc = 0;
			for (let i = 0; i < s.length; i++) {
				const ch = s[i];
				ctx[method](ch, x + acc, y);
				acc += measure(ch).width + letterSpacing;
			}
		};
	
		// ---------- paint setup ----------
		ctx.save();
		ctx.globalAlpha *= alpha * masterAlpha;
	
		// Match transform pipeline
		this.applyDeviceTransform();
		ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
	
		ctx.font          = buildFont();
		ctx.textBaseline  = 'top';
		ctx.textAlign     = 'left';
		ctx.shadowBlur    = Number(t2d.shadowBlur ?? 0);
		ctx.shadowColor   = t2d.shadowColor ?? 'rgba(0,0,0,0)';
		ctx.shadowOffsetX = Number(t2d.shadowOffsetX ?? 0);
		ctx.shadowOffsetY = Number(t2d.shadowOffsetY ?? 0);
	
		// Textbox & content area
		const boxX = box.x, boxY = box.y, boxW = box.w, boxH = box.h;
		const contentW = Math.max(0, boxW - padL - padR);
	
		// ---- build visual lines + indexed ranges (absolute indices into `text`) ----
		const rawLines = [];
		
		if (isPassword) {
			// Single visual line, but preserve true text length for indices.
			const visible = maskChar.repeat(text.length);
			rawLines.push({ start: 0, end: text.length, str: visible });
			if (rawLines.length === 0) rawLines.push({ start: 0, end: 0, str: '' });
		} else {
			let i = 0, start = 0;
			while (i <= text.length) {
				if (i === text.length || text[i] === '\n') {
					rawLines.push({ start, end: i, str: text.slice(start, i) });
					start = i + 1; // skip the newline
				}
				i++;
			}
			if (rawLines.length === 0) rawLines.push({ start: 0, end: 0, str: '' }); // empty input
		}
	
		const linesIdx = [];
		const lines    = [];
	
		for (const rl of rawLines) {
			const segs = wrapLine(rl.str, contentW || null);
			if (segs.length === 0) {
				linesIdx.push({ text: '', start: rl.start, end: rl.start, w: 0 });
				lines.push('');
				continue;
			}
			let cursor = rl.start; // absolute index in `text` for this raw line
			for (const seg of segs) {
				const s     = String(seg ?? '');
				const start = cursor;
				const end   = start + s.length;
				linesIdx.push({ text: s, start, end, w: lineWidthAdv(s) });
				lines.push(s);
				cursor = end;
			}
		}
	
		// ---------- vertical align ----------
		const contentH = Math.max(0, boxH - padT - padB);
		const textH    = lines.length * lineHeight;
		let vAlignOffset = 0;
	
		if (contentH > textH) {
			if (valign === 'middle') {
				vAlignOffset = (contentH - textH) * 0.5;
			} else if (valign === 'bottom') {
				vAlignOffset = (contentH - textH);
			}
			// 'top' => 0
		}
	
		// Clip to rect
		ctx.beginPath();
		ctx.rect(boxX, boxY, boxW, boxH);
		ctx.clip();
	
		// Scroll + baseline (with vertical align)
		const baseX = boxX + padL - (wrap ? 0 : scrollX);
		let y       = boxY + padT + vAlignOffset - scrollY;
	
		// ---------- INPUT FIELD (register + selection) ----------
		let inputState = null;
		if (inputEnabled) {
			this.textInput.registerField(d3dobject, {
				m,
				box: { x: boxX, y: boxY, w: boxW, h: boxH },
				padL,
				padT: padT + vAlignOffset,
				contentW, align, wrap, scrollX, scrollY,
				lineGap: lineHeight,
				letterSpacing,
				font: ctx.font,
				lines: linesIdx,
				text
			});
			inputState = this.textInput.getStateFor(d3dobject);
	
			// Selection background before drawing text
			if (inputState.active && inputState.selA !== inputState.selB) {
				const selA = inputState.selA, selB = inputState.selB;
				ctx.save();
				ctx.fillStyle = 'rgba(64,128,255,0.35)';
				for (let i = 0; i < linesIdx.length; i++) {
					const ln = linesIdx[i];
					const a  = Math.max(selA, ln.start);
					const b  = Math.min(selB, ln.end);
					if (a >= b) continue;
	
					let ax = 0;
					if (contentW) {
						const d = Math.max(0, contentW - ln.w);
						ax = (align === 'center') ? d * 0.5 : (align === 'right' ? d : 0);
					}
	
					let xa = baseX + ax, xb = baseX + ax;
					if (!letterSpacing) {
						xa += ctx.measureText(ln.text.slice(0, a - ln.start)).width;
						xb += ctx.measureText(ln.text.slice(0, b - ln.start)).width;
					} else {
						for (let k = ln.start; k < a; k++) {
							xa += ctx.measureText(visualCharAt(k)).width + letterSpacing;
						}
						for (let k = ln.start; k < b; k++) {
							xb += ctx.measureText(visualCharAt(k)).width + letterSpacing;
						}
					}
					const yy = (boxY + padT + vAlignOffset - scrollY) + i * lineHeight;
					ctx.fillRect(xa, yy, Math.max(1, xb - xa), lineHeight);
				}
				ctx.restore();
			}
		}
	
		// ---------- DRAW TEXT ----------
		for (let i = 0; i < lines.length; i++) {
			const s = lines[i];
			let x   = baseX;
	
			if (contentW) {
				const w = lineWidthAdv(s);
				if (align === 'center') x += Math.max(0, (contentW - w) * 0.5);
				else if (align === 'right') x += Math.max(0, (contentW - w));
			}
	
			if (strokeOn && strokeWidth > 0) {
				ctx.lineWidth   = Math.max(0.001, strokeWidth);
				ctx.strokeStyle = (typeof hexToRgba === 'function') ? hexToRgba(strokeStyle) : strokeStyle;
				drawSpaced('strokeText', s, x, y);
			}
			if (fill) {
				ctx.fillStyle = (typeof hexToRgba === 'function') ? hexToRgba(fillStyle) : fillStyle;
				drawSpaced('fillText', s, x, y);
			}
			y += lineHeight;
		}
	
		// ---------- CARET (after text, so it draws on top) ----------
		if (inputEnabled && inputState && inputState.active && inputState.blinkOn) {
			const caret = Math.max(0, inputState.caret | 0);
	
			// Find or clamp to the best visual line
			let li = 0;
			if (linesIdx.length) {
				for (let i = 0; i < linesIdx.length; i++) {
					const L = linesIdx[i];
					if (caret >= L.start && caret <= L.end) { li = i; break; }
					if (caret > L.end) li = i; // clamp forward
				}
			}
	
			const ln = linesIdx[li] || { text:'', start:0, end:0, w:0 };
	
			// Align offset (mirror draw)
			let ax = 0;
			const lnW = Number.isFinite(ln.w) ? ln.w : 0;
			if (contentW) {
				const d = Math.max(0, contentW - lnW);
				ax = (align === 'center') ? (d * 0.5) : (align === 'right' ? d : 0);
			}
	
			// Local index within this visual line
			const localIdx = Math.max(0, Math.min(ln.text.length, caret - ln.start));
	
			// Base X for this line
			let cx = baseX + ax;
	
			// Advance by width of characters up to localIdx (letterSpacing-aware)
			if (!letterSpacing) {
				cx += ctx.measureText(ln.text.slice(0, localIdx)).width;
			} else {
				for (let j = 0; j < localIdx; j++) {
					const ch = ln.text[j];
					cx += ctx.measureText(ch).width;
					if (j < ln.text.length - 1) cx += letterSpacing;
				}
			}
	
			// Y for this line (with vertical align)
			const cy = (boxY + padT + vAlignOffset - scrollY) + (li * lineHeight);
	
			// Draw caret
			ctx.save();
			ctx.strokeStyle = t2d.caretColor || '#0080ff';
			ctx.lineWidth   = Math.max(1, Number(t2d.caretWidth ?? 1));
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.lineTo(cx, cy + lineHeight);
			ctx.stroke();
			ctx.restore();
		}
	
		ctx.restore();
	}
	drawVector(d3dobject) {
		const ctx = this.ctx;
		
		const alpha = worldOpacity(d3dobject);
		if (alpha <= 0) return;
		
		const graphic = d3dobject.graphic2d || {};
	
		const gLineEnabled = graphic.line !== false;
		const gLineWidth   = Number(graphic.lineWidth ?? 1);
		const gLineColor   = graphic.lineColor ?? '#ffffff';
		const lineCap      = graphic.lineCap  ?? 'round';
		const lineJoin     = graphic.lineJoin ?? 'round';
		const miterLimit   = Number(graphic.miterLimit ?? 10);
	
		const fillEnabled  = graphic.fill !== false;
		const fillPaintVal = graphic.fillColor ?? '#ffffffff';
		const borderRadius = Math.max(0, Number(graphic.borderRadius ?? 0));
	
		const outlineOn    = graphic.outline === true;
		const outlinePaintVal = graphic.outlineColor ?? gLineColor;
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
		{
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
		}
	
		const isInFocus = window._player || (_editor?.focus === d3dobject) || (_editor?.focus?.containsChild?.(d3dobject));
		const masterAlpha = isInFocus ? 1 : masterUnfocusAlpha;
	
		// Build combined closed path + collect bounds for gradient paints
		const combo = new Path2D();
		const closedPaths = [];
		const openStrokes = [];
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	
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
	
				// local bounds for gradient mapping
				for (const p of points) {
					if (p.x < minX) minX = p.x;
					if (p.y < minY) minY = p.y;
					if (p.x > maxX) maxX = p.x;
					if (p.y > maxY) maxY = p.y;
				}
			} else {
				openStrokes.push(points);
			}
		}
		const haveBounds = isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY);
		const bounds = haveBounds ? { x:minX, y:minY, w:Math.max(0, maxX-minX), h:Math.max(0, maxY-minY) } : { x:0,y:0,w:1,h:1 };
	
		const BIG = 1e6;
	
		ctx.save();
		ctx.globalAlpha *= alpha * masterAlpha;
		this.applyDeviceTransform();
		ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
	
		// FILL
		if (fillEnabled && closedPaths.length) {
			ctx.fillStyle = toCanvasPaint(ctx, fillPaintVal, bounds);
			ctx.fill(combo, 'evenodd');
		}
	
		// OUTLINE (outside-only)
		if (outlineOn && closedPaths.length && outlineWidth > 0) {
			ctx.save();
			const outside = new Path2D();
			outside.rect(-BIG, -BIG, BIG * 2, BIG * 2);
			outside.addPath(combo);
			ctx.clip(outside, 'evenodd');
	
			ctx.lineWidth   = Math.max(0.001, outlineWidth * 2);
			ctx.strokeStyle = toCanvasPaint(ctx, outlinePaintVal, bounds);
			ctx.lineCap     = lineCap;
			ctx.lineJoin    = lineJoin;
			ctx.miterLimit  = miterLimit;
			ctx.stroke(combo);
			ctx.restore();
		}
	
		// LINE strokes (centered)
		if (gLineEnabled) {
			// closed
			for (const { path } of closedPaths) {
				ctx.lineWidth   = Math.max(0.001, gLineWidth);
				ctx.strokeStyle = toCanvasPaint(ctx, gLineColor, bounds);
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
				ctx.strokeStyle = toCanvasPaint(ctx, gLineColor, bounds);
				ctx.lineCap     = lineCap;
				ctx.lineJoin    = lineJoin;
				ctx.miterLimit  = miterLimit;
				ctx.stroke();
			}
		}
	
		ctx.restore();
	}
	drawProjectFrame() {
		// Project logical size
		const projW = Math.max(this.root?.manifest?.width  | 0, 1);
		const projH = Math.max(this.root?.manifest?.height | 0, 1);
	
		// Device-space mapping (letterbox math you already compute)
		const pr  = this.pixelRatio || 1;
		const s   = this.viewScale  || 1;
		const off = this.viewOffset || { x: 0, y: 0 };
	
		// Device-space rect that contains the whole project content
		const x = off.x;
		const y = off.y;
		const w = projW * pr * s;
		const h = projH * pr * s;
	
		const ctx = this.ctx;
		ctx.save();
	
		// Draw in pure device space so stroke is always 1px regardless of zoom/scale
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.lineWidth   = 1;
	
		// Two-pass hairline (black then white) for visibility on any background
		// Outer stroke
		ctx.strokeStyle = 'rgba(0,0,0,0.75)';
		ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(w) + 1, Math.round(h) + 1);
	
		// Inner stroke (slight inset)
		ctx.strokeStyle = 'rgba(255,255,255,0.9)';
		ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.max(0, Math.round(w) - 1), Math.max(0, Math.round(h) - 1));
	
		ctx.restore();
	}
	drawFocusOverlay() {
		const ctx = this.ctx;
		
		ctx.save();
		
		ctx.setTransform(1,0,0,1,0,0);
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = 'rgba(0,0,0,0.35)'; // tweak opacity here
		ctx.fillRect(0, 0, this.domElement.width, this.domElement.height);
		
		ctx.restore();
	}
}