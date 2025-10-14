export default class D2DPanZoom {
	constructor(d2drenderer, {
		maxScale = 10,
		zoomSpeed = 1.12,
		panSpeed = 1.0
	} = {}) {
		this.r = d2drenderer;
		this.canvas = d2drenderer.domElement;

		this.maxScale = maxScale;
		this.zoomSpeed = zoomSpeed;
		this.panSpeed = panSpeed;

		this._panning = false;
		this._last = null;
		this._activePointerId = null;

		this._onWheel  = this._onWheel.bind(this);
		this._onPDown  = this._onPDown.bind(this);
		this._onPMove  = this._onPMove.bind(this);
		this._onPUp    = this._onPUp.bind(this);
		this._onKey    = this._onKey.bind(this);
		this._onCtx    = this._onCtx.bind(this);

		this._attach();

		this.r.viewScale  = 1;
		this.r.viewOffset = this.r.viewOffset ?? { x: 0, y: 0 };
	}

	destroy() { this._detach(); }

	_attach() {
		// wheel: two-finger pan; ctrl+wheel: pinch zoom → zoom about center
		this.canvas.addEventListener('wheel', this._onWheel, { passive: false });

		// pointer events for robust right-drag panning (with capture)
		this.canvas.addEventListener('pointerdown', this._onPDown, { passive: false });
		window.addEventListener('pointermove', this._onPMove, { passive: false });
		window.addEventListener('pointerup', this._onPUp, { passive: false });
		window.addEventListener('pointercancel', this._onPUp, { passive: false });

		// keyboard zoom (⌘ + / ⌘ - / ⌘ 0) about center
		window.addEventListener('keydown', this._onKey, { passive: false });

		// suppress context menu only while we are panning
		this.canvas.addEventListener('contextmenu', this._onCtx, { passive: false });
	}

	_detach() {
		this.canvas.removeEventListener('wheel', this._onWheel);
		this.canvas.removeEventListener('pointerdown', this._onPDown);
		window.removeEventListener('pointermove', this._onPMove);
		window.removeEventListener('pointerup', this._onPUp);
		window.removeEventListener('pointercancel', this._onPUp);
		window.removeEventListener('keydown', this._onKey);
		this.canvas.removeEventListener('contextmenu', this._onCtx);
	}

	_center() { return { x: this.canvas.width * 0.5, y: this.canvas.height * 0.5 }; }

	_pointerToCanvas(e) {
		const r = this.canvas.getBoundingClientRect();
		const x = (e.clientX - r.left) * (this.canvas.width / r.width);
		const y = (e.clientY - r.top)  * (this.canvas.height / r.height);
		return { x, y };
	}

	_clampScale(s) { return Math.max(1, Math.min(this.maxScale, s)); }

	_setScaleAbout(anchor, newScale) {
		const pr = (this.r.pixelRatio || 1);
		const old = this.r.viewScale || 1;
		newScale = this._clampScale(newScale);
		if (newScale === old) return false;

		const sOld = pr * old;
		const sNew = pr * newScale;
		const off = this.r.viewOffset || { x: 0, y: 0 };

		const offX = anchor.x - (sNew / sOld) * (anchor.x - off.x);
		const offY = anchor.y - (sNew / sOld) * (anchor.y - off.y);

		this.r.viewScale = newScale;
		this.r.viewOffset = { x: offX, y: offY };
		return true;
	}

	_onWheel(e) {
		e.preventDefault();

		const dm = e.deltaMode; // 0=pixel, 1=line, 2=page
		const unit = dm === 1 ? 16 : (dm === 2 ? this.canvas.height : 1);
		const dx = e.deltaX * unit;
		const dy = e.deltaY * unit;

		// pinch-to-zoom often reports ctrlKey on macOS
		if (e.ctrlKey) {
			const anchor = this._center(); // always zoom to center
			const dir = dy > 0 ? 1 : -1;
			const factor = dir > 0 ? (1 / this.zoomSpeed) : this.zoomSpeed;
			const target = (this.r.viewScale || 1) * factor;
			if (this._setScaleAbout(anchor, target)) this._req();
			return;
		}

		// two-finger scroll → pan
		const off = this.r.viewOffset || { x: 0, y: 0 };
		this.r.viewOffset = { x: off.x - dx * this.panSpeed, y: off.y - dy * this.panSpeed };
		this._req();
	}

	_onPDown(e) {
		// right button OR ctrl+left acts as right on mac
		const isRight = (e.button === 2) || (e.ctrlKey && e.button === 0);
		if (!isRight) return;

		e.preventDefault();

		// capture the pointer so contextmenu / focus changes don't kill the drag
		this.canvas.setPointerCapture?.(e.pointerId);
		this._activePointerId = e.pointerId;

		this._panning = true;
		this._last = this._pointerToCanvas(e);
		this.canvas.style.cursor = 'grab';
	}

	_onPMove(e) {
		if (!this._panning) return;
		// ignore moves from other pointers
		if (this._activePointerId != null && e.pointerId !== this._activePointerId) return;

		e.preventDefault();
		const cur = this._pointerToCanvas(e);
		const dx = cur.x - this._last.x;
		const dy = cur.y - this._last.y;
		this._last = cur;

		const off = this.r.viewOffset || { x: 0, y: 0 };
		this.r.viewOffset = { x: off.x + dx, y: off.y + dy };

		this._req();
	}

	_onPUp(e) {
		if (!this._panning) return;
		// only end if it's our captured pointer (or no capture available)
		if (this._activePointerId != null && e.pointerId !== this._activePointerId) return;

		this._panning = false;
		this._activePointerId = null;
		try { this.canvas.releasePointerCapture?.(e.pointerId); } catch {}
		this.canvas.style.cursor = 'default';
	}

	_onCtx(e) {
		// while panning, kill the context menu so the drag isn't interrupted
		if (this._panning) e.preventDefault();
	}

	_onKey(e) {
		if (!e.metaKey) return;
		const anchor = this._center();

		if (e.key === '=' || e.key === '+') {
			e.preventDefault();
			const target = (this.r.viewScale || 1) * this.zoomSpeed;
			if (this._setScaleAbout(anchor, target)) this._req();
		} else if (e.key === '-') {
			e.preventDefault();
			const target = (this.r.viewScale || 1) / this.zoomSpeed;
			if (this._setScaleAbout(anchor, target)) this._req();
		} else if (e.key === '0') {
			e.preventDefault();
			if (this._setScaleAbout(anchor, 1)) {
				this.r.viewOffset = { x: 0, y: 0 };
				this._req();
			}
		}
	}

	_req() {
		_editor?.requestRender?.() || this.r.render?.();
	}
}