export default class D2DTextInput {
	constructor(renderer) {
		this.r = renderer;

		this.active = null;      // { obj, text2d, t2d }
		this.dragging = false;

		this.anchor = 0;
		this.caret  = 0;
		this.selA   = 0;
		this.selB   = 0;

		this._blinkT0 = performance.now();
		this.registry = [];      // fields registered THIS FRAME (topmost last)

		this._installIME();
		this._installPointer();
	}

	beginFrame() { this.registry.length = 0; }
	endFrame()   { /* reserved */ }

	// --- Per-frame registration from drawText ---
	// payload should include:
	//  m, box{x,y,w,h}, padL, padT, contentW, align, wrap, scrollX, lineGap, letterSpacing, font,
	//  lines: string[] OR {text,start,end,w}[], and (optionally) text: full string
	registerField(d3dobject, payload) {
		const ctx = this.r.ctx;
		const text2d = d3dobject.getComponent('Text2D');
		const t2d = text2d?.textProperties || {};
		const fullText = typeof payload.text === 'string'
			? payload.text
			: String(t2d.text ?? '');

		const font          = payload.font || '16px sans-serif';
		const letterSpacing = Number(payload.letterSpacing || 0);

		// --- width helper that mirrors drawText (letterSpacing-aware) ---
		const widthOf = (s) => {
			if (!s) return 0;
			ctx.save();
			ctx.setTransform(1,0,0,1,0,0);
			ctx.font = font;
			let w = 0;
			if (!letterSpacing) {
				w = ctx.measureText(s).width;
			} else {
				for (let i=0;i<s.length;i++) w += ctx.measureText(s[i]).width;
				if (s.length > 1) w += letterSpacing * (s.length - 1);
			}
			ctx.restore();
			return w;
		};

		// --- Normalize lines to [{text,start,end,w}] in FULL TEXT coordinates ---
		const linesIn = payload.lines || [];
		const out = [];

		if (linesIn.length && typeof linesIn[0] === 'object' && linesIn[0] !== null) {
			// Already indexed; just ensure width exists.
			for (const ln of linesIn) {
				const s = String(ln.text ?? '');
				const w = Number.isFinite(ln.w) ? ln.w : widthOf(s);
				const start = Number.isFinite(ln.start) ? ln.start : 0;
				const end   = Number.isFinite(ln.end)   ? ln.end   : (start + s.length);
				out.push({ text:s, start, end, w });
			}
		} else {
			// We only got the DISPLAYED wrapped strings; map them back into fullText
			// by scanning forward so indices always match IME’s value.
			let cursor = 0;
			for (const s0 of linesIn) {
				const s = String(s0 ?? '');
				if (!s) {
					out.push({ text:'', start:cursor, end:cursor, w:0 });
					continue;
				}
				let start = fullText.indexOf(s, cursor);
				if (start < 0) {
					// Fallback: if not found (e.g., leading spaces trimmed during wrap),
					// pin to cursor; this still keeps monotonic indices.
					start = cursor;
				}
				const end = start + s.length;
				const w = widthOf(s);
				out.push({ text:s, start, end, w });
				cursor = end;
			}
			// If nothing was passed (empty editable field), ensure one empty line:
			if (out.length === 0) out.push({ text:'', start:0, end:0, w:0 });
		}

		this.registry.push({
			obj: d3dobject,
			text: fullText,
			...payload,
			letterSpacing,
			font,
			lines: out
		});
	}

	// --- State queried by drawText for caret/selection/blink ---
	getStateFor(d3dobject) {
		const isActive = !!(this.active && this.active.obj === d3dobject);
		const now = performance.now();
		const blinkOn = (((now - this._blinkT0) / 500 | 0) % 2) === 0;
		return {
			active: isActive,
			caret: this.caret,
			selA: this.selA,
			selB: this.selB,
			blinkOn
		};
	}

	// ---------------- IME ----------------
	_installIME() {
		const el = document.createElement('textarea');
		el.autocapitalize = 'off';
		el.autocomplete   = 'off';
		el.spellcheck     = false;
		el.style.position = 'absolute';
		el.style.opacity  = '0';
		el.style.pointerEvents = 'none';
		el.style.resize   = 'none';
		el.style.overflow = 'hidden';
		el.style.whiteSpace = 'pre';
		el.style.transform  = 'translate(-10000px,-10000px)';
		document.body.appendChild(el);
		this.ime = el;
	
		const syncFromIME = () => {
			if (!this.active) return;
			const t2d = this.active.t2d;
			t2d.text  = el.value;                              // includes \n
			this.selA = el.selectionStart ?? 0;
			this.selB = el.selectionEnd   ?? this.selA;
			this.caret = this.selB;
			this._blinkT0 = performance.now();                 // reset caret blink
			this.r._dirty = true;
		};
	
		// 1) Fires after text changes (incl. Enter)
		el.addEventListener('input', syncFromIME);
	
		// 2) Some selection moves only fire on keyup
		el.addEventListener('keyup', syncFromIME);
	
		// 3) On keydown, request a microtask sync so Enter updates this frame
		el.addEventListener('keydown', (ev) => {
			if (!this.active) return;
		
			// prevent page scrolling on vertical nav keys
			if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown' ||
				ev.key === 'PageUp'  || ev.key === 'PageDown') {
				ev.preventDefault();
			}
		
			if (ev.key === 'Enter') {
				// Do newline ourselves so caret updates immediately this frame.
				ev.preventDefault();
		
				const a = el.selectionStart | 0;
				const b = el.selectionEnd   | 0;
				const v = el.value || '';
		
				// Insert \n at selection, collapse after it
				const nv = v.slice(0, a) + '\n' + v.slice(b);
				const newCaret = a + 1;
		
				el.value = nv;
				try { el.setSelectionRange(newCaret, newCaret); } catch {}
		
				// mirror to component + state
				if (this.active) this.active.t2d.text = nv;
				this.selA = this.selB = this.caret = newCaret;
		
				this._blinkT0 = performance.now();
				this.r._dirty = true;
				return; // done
			}
		
			// mark dirty for any other key
			this.r._dirty = true;
		});
	
		el.addEventListener('blur', () => {
			this.active = null;
			this.r._dirty = true;
		});
	
		// Safety: if active loses focus, snap it back on next key press
		document.addEventListener('keydown', () => {
			if (this.active && document.activeElement !== el) {
				el.focus({ preventScroll: true });
			}
		});
	}

	_focusIME(text, a, b) {
		const el = this.ime;
		if (document.activeElement !== el) el.focus({ preventScroll: true });
		if (el.value !== text) el.value = text;
		try {
			el.setSelectionRange(a, b);
		} catch {
			// Retry after focus settles
			setTimeout(() => {
				if (document.activeElement !== el) el.focus({ preventScroll: true });
				try { el.setSelectionRange(a, b); } catch(_) {}
			}, 0);
		}
		this._blinkT0 = performance.now();
	}

	// -------------- Pointer / picking / index mapping --------------
	_installPointer() {
		const cvs = this.r.domElement;

		const getMouseWorld = (e) => {
			const rect = cvs.getBoundingClientRect();
			const sx = cvs.width  / rect.width;
			const sy = cvs.height / rect.height;
			const px = (e.clientX - rect.left) * sx;
			const py = (e.clientY - rect.top)  * sy;
			const pr  = this.r.pixelRatio || 1;
			const vs  = this.r.viewScale  || 1;
			const off = this.r.viewOffset || { x:0, y:0 };
			return { x: (px - off.x) / (pr * vs), y: (py - off.y) / (pr * vs) };
		};

		const pickField = (e) => {
			if (!this.registry.length) return null;
			const wpt = getMouseWorld(e);
			// topmost first (last registered was drawn last)
			for (let i = this.registry.length - 1; i >= 0; i--) {
				const f = this.registry[i];
				// inverse local transform
				const inv = f.m.inverse();
				const lx = inv.a * wpt.x + inv.c * wpt.y + inv.e;
				const ly = inv.b * wpt.x + inv.d * wpt.y + inv.f;
				if (lx >= f.box.x && ly >= f.box.y && lx <= f.box.x + f.box.w && ly <= f.box.y + f.box.h) {
					return { field: f, local: { x: lx, y: ly } };
				}
			}
			return null;
		};

		const localToIndex = (f, local) => {
			// --- find line (mirror drawText vertical math) ---
			const relY = local.y - (f.box.y + f.padT - f.scrollY);
			let li = Math.floor(relY / f.lineGap);
			li = Math.max(0, Math.min(f.lines.length - 1, li));
			let ln = f.lines[li] || { text:'', start:0, end:0, w:0 };

			// ensure width (should already be there)
			if (!Number.isFinite(ln.w)) {
				const ctx = this.r.ctx;
				ctx.save();
				ctx.setTransform(1,0,0,1,0,0);
				ctx.font = f.font;
				let w = 0;
				if (!f.letterSpacing) w = ctx.measureText(ln.text).width;
				else {
					for (let i=0;i<ln.text.length;i++) w += ctx.measureText(ln.text[i]).width;
					if (ln.text.length > 1) w += f.letterSpacing * (ln.text.length - 1);
				}
				ctx.restore();
				ln = { ...ln, w };
			}

			// --- horizontal alignment offset (same as drawText) ---
			let ax = 0;
			if (f.contentW > 0) {
				const d = Math.max(0, f.contentW - ln.w);
				ax = (f.align === 'center') ? d * 0.5 : (f.align === 'right' ? d : 0);
			}

			// base x (same as drawText baseX for that line)
			const baseX = f.box.x + f.padL - (f.wrap ? 0 : f.scrollX) + ax;
			let x = local.x - baseX;

			// clamp to line
			if (x <= 0) return ln.start;
			if (x >= ln.w) return ln.end;

			// walk glyphs with spacing; snap to midpoints
			const ctx = this.r.ctx;
			ctx.save();
			ctx.setTransform(1,0,0,1,0,0);
			ctx.font = f.font;

			const s  = ln.text;
			const ls = f.letterSpacing || 0;
			let acc  = 0;

			for (let i = 0; i < s.length; i++) {
				const w = ctx.measureText(s[i]).width;
				const step = w + (i < s.length - 1 ? ls : 0);
				if (acc + step * 0.5 >= x) { ctx.restore(); return ln.start + i; }
				acc += step;
			}
			ctx.restore();
			return ln.end;
		};

		const onDown = (e) => {
			const hit = pickField(e);
			if (!hit) { this.active = null; this.r._dirty = true; return; }

			const { field, local } = hit;
			const text2d = field.obj.getComponent('Text2D');
			const t2d = text2d?.textProperties || {};
			if (t2d.isInput !== true) { this.active = null; this.r._dirty = true; return; }

			this.active = { obj: field.obj, text2d, t2d };

			const idx = localToIndex(field, local);
			this.anchor = idx;
			this.caret  = idx;
			this.selA   = idx;
			this.selB   = idx;

			this._focusIME(String(t2d.text ?? ''), this.selA, this.selB);

			this.dragging = true;
			e.preventDefault();
			this.r._dirty = true;
		};

		const onMove = (e) => {
			if (!this.dragging || !this.active) return;
			const hit = pickField(e);
			if (!hit || hit.field.obj !== this.active.obj) return;

			const idx = localToIndex(hit.field, hit.local);
			this.selA  = Math.min(this.anchor, idx);
			this.selB  = Math.max(this.anchor, idx);
			this.caret = idx;

			this._focusIME(this.ime.value, this.selA, this.selB);
			this.r._dirty = true;
		};

		const onUp  = () => { this.dragging = false; };
		const onDbl = (e) => {
			const hit = pickField(e);
			if (!hit || !this.active || hit.field.obj !== this.active.obj) return;

			const f = hit.field;
			const idx = localToIndex(f, hit.local);
			const str = this.ime.value;

			let a = idx, b = idx;
			while (a > 0 && /\w/.test(str[a-1])) a--;
			while (b < str.length && /\w/.test(str[b])) b++;

			this.selA = a; this.selB = b; this.caret = b;
			this._focusIME(str, a, b);
			this.r._dirty = true;
		};

		cvs.addEventListener('mousedown', onDown);
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		cvs.addEventListener('dblclick', onDbl);
	}
}