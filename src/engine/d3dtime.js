export default class D3DTime {
	get fps() {
		return this.delta > 0 ? 1 / this.delta : 0;
	}
	get now() {
		return this._nowMs / 1000;
	}
	get nowms() {
		return this._nowMs;
	}
	constructor() {
		this._nowMs = performance.now();
		this.delta = 0;      // seconds
	}
	tick(nowMs) {            // call once per RAF
		const last = this._nowMs;
		this._nowMs = nowMs;
		const d = (nowMs - last) / 1000;
		// cap pathological hitches (tab switch, breakpoint, etc.)
		this.delta = d > 0.1 ? 0.1 : (d >= 0 ? d : 0);
	}
}