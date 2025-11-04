export default class D3DDimensions {
	constructor() {
		this.update();
	}
	
	get width() {
		return window._root?.manifest?.width;
	}
	get height() {
		return window._root?.manifest?.height;
	}
	
	get pixelScale2D() {
		return _host.renderer2d?.getPixelScale() ?? 1;
	}
	set pixelScale2D(v) {
		if(_host.renderer2d === undefined) {
			throw new Error('2D renderer is not ready');
		}
		_host.renderer2d.setPixelScale(v);
	}
	get drawScale2D() {
		return _host.renderer2d?.getDrawScale() ?? 1;
	}
	set drawScale2D(v) {
		if(_host.renderer2d === undefined) {
			throw new Error('2D renderer is not ready');
		}
		_host.renderer2d.setDrawScale(v);
	}

	update() {
		const pr = window.devicePixelRatio || 1;
		
		// --- screen + viewport ---
		this.screenWidth  = (window.screen?.width  || 0) * pr;
		this.screenHeight = (window.screen?.height || 0) * pr;
		this.viewportWidth  = window.innerWidth  | 0;
		this.viewportHeight = window.innerHeight | 0;
		this.pixelRatio = pr;

		// --- renderer2d extents (includes letterbox) ---
		const r = window._host?.renderer2d;
		if (r && r.domElement) {
			const gs  = (r.pixelRatio || 1) * (r.viewScale || 1);
			const off = r.viewOffset || { x: 0, y: 0 };

			// invert device transform: Scale(1/gs) * Translate(-off)
			const inv = new DOMMatrix()
				.scaleSelf(1 / gs, 1 / gs)
				.translateSelf(-off.x, -off.y);

			const p0 = new DOMPoint(0, 0).matrixTransform(inv);
			const p1 = new DOMPoint(r.domElement.width, r.domElement.height).matrixTransform(inv);

			this.left   = p0.x;
			this.top    = p0.y;
			this.right  = p1.x;
			this.bottom = p1.y;

			this.gameWidth  = this.right  - this.left;
			this.gameHeight = this.bottom - this.top;
		} else {
			this.left = this.top = 0;
			this.right = this.width;
			this.bottom = this.height;

			// NEW fallbacks
			this.gameWidth  = this.right  - this.left;   // == this.width
			this.gameHeight = this.bottom - this.top;    // == this.height
		}
	}
}