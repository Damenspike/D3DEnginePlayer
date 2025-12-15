export default class D3DDimensions {
	constructor() {
		this.update();
	}
	
	get isMobile() {
		return navigator.userAgentData?.mobile === true || (/Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent));
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
	
	get pixelRatio2D() {
		return _host.renderer2d?.getPixelRatio() ?? 1;
	}
	set pixelRatio2D(v) {
		if(_host.renderer2d === undefined) {
			throw new Error('2D renderer is not ready');
		}
		_host.renderer2d.setPixelRatio(v);
	}
	
	get pixelRatio3D() {
		return _host.renderer3d?.getPixelRatio() ?? 1;
	}
	set pixelRatio3D(v) {
		if(_host.renderer3d === undefined) {
			throw new Error('3D renderer is not ready');
		}
		_host.renderer3d.setPixelRatio(v);
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
	
	get canvasSize2D() {
		return {
			width: _host.renderer2d.domElement.width,
			height: _host.renderer2d.domElement.height
		}
	}
	get canvasSize3D() {
		return {
			width: _host.renderer3d.domElement.width,
			height: _host.renderer3d.domElement.height
		}
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
	setSize(width, height) {
		if(!width || !height || isNaN(width) || isNaN(height))
			throw new Error('Invalid width or height');
		
		_root.manifest.width = width;
		_root.manifest.height = height;
		
		_host.renderer2d.refreshSize();
	}
}