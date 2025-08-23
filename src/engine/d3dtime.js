export default class D3DTime {
	get fps() {
		return 1 / this.delta;
	}
	get now() {
		return new Date().getTime() / 1000;
	}
	get nowms() {
		return new Date().getTime();
	}
	
	constructor() {
		this.lastRender = 0;
		this.delta = 0;
	}
}