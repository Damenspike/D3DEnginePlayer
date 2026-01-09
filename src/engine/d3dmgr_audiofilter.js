import * as THREE from 'three';

export default class D3DAudioFilterManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.__setup = false;

		this.__nodes = [];
		this.__ownedListener = null;
		this.__lastSig = '';
	}

	updateComponent() {
		if(!this.__setup)
			this.setup();

		this._rebuild();
	}

	setup() {
		this.__setup = true;
	}

	dispose() {
		this._releaseListener();
	}

	_releaseListener() {
		const l = this.__ownedListener;
		if(!l) return;

		if(l.__d3dAudioFilterOwner !== this)
			return;

		this._clearChain(l);

		delete l.__d3dAudioFilterOwner;

		this.__ownedListener = null;
		this.__lastSig = '';
	}

	_tryAcquireListener() {
		const l = _host.audioListener;
		if(!l || !l.__d3dInput || !l.gain)
			return null;

		if(!l.__d3dAudioFilterOwner) {
			l.__d3dAudioFilterOwner = this;
			this.__ownedListener = l;
			return l;
		}

		if(l.__d3dAudioFilterOwner === this) {
			this.__ownedListener = l;
			return l;
		}

		return null;
	}

	_clearChain(l) {
		const input = l.__d3dInput;

		try { input.disconnect(); } catch {}
		for(const n of this.__nodes) {
			try { n.disconnect(); } catch {}
		}
		this.__nodes.length = 0;

		try { input.connect(l.gain); } catch {}
	}

	_rebuild() {
		if(!this.component.enabled) {
			this._releaseListener();
			return;
		}

		const l = this._tryAcquireListener();
		if(!l) return;

		const sig = this._signature();
		if(sig === this.__lastSig)
			return;

		this.__lastSig = sig;

		this._clearChain(l);

		const ctx = l.context;
		const input = l.__d3dInput;

		const chain = this._buildFxList(ctx);
		if(!chain.length)
			return;

		try { input.disconnect(); } catch {}

		let prev = input;

		for(const fx of chain) {
			try { prev.connect(fx.in); } catch {}
			prev = fx.out;

			if(fx.nodes?.length) this.__nodes.push(...fx.nodes);
			else this.__nodes.push(fx.in);
		}

		try { prev.connect(l.gain); } catch {}
	}

	_signature() {
		const p = this.component.properties || {};
		return [
			p.enableLowpass ? 1 : 0,
			Number(p.lowpassFrequency ?? 1200),
			Number(p.lowpassQ ?? 0.7),

			p.enableHighpass ? 1 : 0,
			Number(p.highpassFrequency ?? 120),
			Number(p.highpassQ ?? 0.7),

			p.enableReverb ? 1 : 0,
			Number(p.reverbWet ?? 0.25),
			Number(p.reverbDecay ?? 0.6),
			Number(p.reverbTime ?? 0.03),
			Number(p.reverbTone ?? 1800),

			p.enableGain ? 1 : 0,
			Number(p.gain ?? 1)
		].join('|');
	}

	_buildFxList(ctx) {
		const p = this.component.properties || {};
		const list = [];

		if(p.enableLowpass) {
			const node = ctx.createBiquadFilter();
			node.type = 'lowpass';
			node.frequency.value = Math.max(0, Number(p.lowpassFrequency ?? 1200) || 0);
			node.Q.value = Math.max(0, Number(p.lowpassQ ?? 0.7) || 0);
			list.push({ in: node, out: node, nodes: [node] });
		}

		if(p.enableHighpass) {
			const node = ctx.createBiquadFilter();
			node.type = 'highpass';
			node.frequency.value = Math.max(0, Number(p.highpassFrequency ?? 120) || 0);
			node.Q.value = Math.max(0, Number(p.highpassQ ?? 0.7) || 0);
			list.push({ in: node, out: node, nodes: [node] });
		}

		if(p.enableReverb) {
			const wet = this._clamp01(Number(p.reverbWet ?? 0.25));
			const decay = Math.max(0, Math.min(0.95, Number(p.reverbDecay ?? 0.6)));
			const time = Math.max(0.001, Number(p.reverbTime ?? 0.03));
			const tone = Math.max(60, Number(p.reverbTone ?? 1800));

			const inNode = ctx.createGain();
			const outNode = ctx.createGain();

			const dryGain = ctx.createGain();
			const wetGain = ctx.createGain();
			dryGain.gain.value = 1 - wet;
			wetGain.gain.value = wet;

			const delay = ctx.createDelay();
			delay.delayTime.value = time;

			const feedback = ctx.createGain();
			feedback.gain.value = decay;

			const lp = ctx.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.value = tone;
			lp.Q.value = 0.7;

			inNode.connect(dryGain);
			dryGain.connect(outNode);

			inNode.connect(delay);
			delay.connect(lp);
			lp.connect(feedback);
			feedback.connect(delay);

			lp.connect(wetGain);
			wetGain.connect(outNode);

			list.push({ in: inNode, out: outNode, nodes: [inNode, outNode, dryGain, wetGain, delay, feedback, lp] });
		}

		if(p.enableGain) {
			const node = ctx.createGain();
			node.gain.value = Number(p.gain ?? 1);
			list.push({ in: node, out: node, nodes: [node] });
		}

		return list;
	}

	_clamp01(x) {
		x = Number(x) || 0;
		if(x < 0) return 0;
		if(x > 1) return 1;
		return x;
	}
}