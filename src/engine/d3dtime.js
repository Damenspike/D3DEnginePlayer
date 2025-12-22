import {
	timestr,
	justTime,
	clockStr
} from './d3dutility.js';

export default class D3DTime {
	get fps() {
		return this.delta > 0 ? 1 / this.delta : 0;
	}
	get now() {
		return this._nowS;
	}
	get nowMs() {
		return this._nowMs;
	}
	get sinceStart() {
		return this.now - this._start;
	}
	get date() {
		return new Date();
	}
	constructor() {
		this._nowMs = performance.now();
		this._nowS = this._nowMs / 1000;
		this._start = this.now;
		this.delta = 0;      // seconds
	}
	tick(nowMs) {            // call once per RAF
		const last = this._nowS;
		this._nowMs = nowMs;
		this._nowS = nowMs / 1000;
		const d = this._nowS - last;
		// cap pathological hitches (tab switch, breakpoint, etc.)
		this.delta = d > 0.1 ? 0.1 : (d >= 0 ? d : 0);
	}
	just(seconds, ...args) {
		return justTime(seconds ?? this.now, ...args);
	}
	str(seconds) {
		return timestr(seconds ?? 0);
	}
	clock(seconds) {
		return clockStr(seconds);
	}
	setPlaying(playing) {
		_host.paused = !playing;
	}
}