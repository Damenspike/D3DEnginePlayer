export default class D3DGraphics {
	constructor() {
		
	}
	
	get ssao() {
		return window._host.ssaoPass;
	}
	get gtao() {
		return window._host.gtaoPass;
	}
	get render() {
		return window._host.renderPass;
	}
}