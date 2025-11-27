import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export default class D3DGraphics {
	constructor() {
		
	}
	
	addShaderPass(shaderObj, uniforms = {}, opts = {}) {
		if (!shaderObj)
			return null;
	
		const composer = _host.composer;
		const renderer = _host.renderer3d;
		
		if (!composer || !renderer)
			return null;
	
		// Ensure shader has a uniforms object
		if (!shaderObj.uniforms)
			shaderObj.uniforms = {};
	
		const shaderPass = new ShaderPass(shaderObj);
	
		// Initialise resolution uniform if present
		const size = new THREE.Vector2();
		renderer.getSize(size);
		if (shaderPass.uniforms.resolution?.value) {
			shaderPass.uniforms.resolution.value.copy(size);
		}
	
		// ------------------------------------------
		// Apply custom uniforms
		// ------------------------------------------
		for (const key in uniforms) {
			const src = uniforms[key];
			const dst = shaderPass.uniforms[key];
		
			const srcIsUniformObject =
				src &&
				typeof src === "object" &&
				!("length" in src) &&    // ignore arrays
				Object.prototype.hasOwnProperty.call(src, "value");
		
			// Existing uniform
			if (dst) {
				if ("value" in dst && !srcIsUniformObject) {
					// src is a primitive (number/bool/string)
					dst.value = src;
				} else if (srcIsUniformObject) {
					// src is { value: X }
					dst.value = src.value;
				} else {
					// fallback: copy properties
					Object.assign(dst, src);
				}
			}
			else {
				// New uniform
				if (srcIsUniformObject) {
					shaderPass.uniforms[key] = { value: src.value };
				} else {
					shaderPass.uniforms[key] = { value: src };
				}
			}
		}
	
		// ------------------------------------------
		// Insert at index
		// ------------------------------------------
		const passes = composer.passes;
	
		let index = opts.index;
	
		if (typeof index !== "number") {
			// default: insert second-to-last (before final screen pass)
			index = Math.max(0, passes.length - 1);
		} else {
			// clamp index to valid range
			index = Math.max(0, Math.min(index, passes.length));
		}
	
		passes.splice(index, 0, shaderPass);
	
		// ------------------------------------------
		// Fix renderToScreen flags
		// Only the final pass should render to screen
		// ------------------------------------------
		for (let i = 0; i < passes.length; i++) {
			passes[i].renderToScreen = (i === passes.length - 1);
		}
	
		return shaderPass;
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