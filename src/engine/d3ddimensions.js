export default class D3DDimensions {
	constructor() {
		this.update();
	}

	update() {
		const pr = window.devicePixelRatio || 1;
		
		// --- screen + viewport ---
		this.screenWidth  = (window.screen?.width  || 0) * pr;
		this.screenHeight = (window.screen?.height || 0) * pr;
		this.viewportWidth  = window.innerWidth  | 0;
		this.viewportHeight = window.innerHeight | 0;
		this.pixelRatio = pr;

		// --- project (root) logical size ---
		this.width  = window._root?.manifest?.width  || 0;
		this.height = window._root?.manifest?.height || 0;

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

			this.pixelWidth  = p1.x; // full pixel width (root space)
			this.pixelHeight = p1.y; // full pixel height (root space)
		} else {
			this.left = this.top = 0;
			this.right = this.pixelWidth = this.width;
			this.bottom = this.pixelHeight = this.height;
		}
	}
}