import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const GrayscaleShader = {
	uniforms: { tDiffuse: { value: null } },
	vertexShader: `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: `
		uniform sampler2D tDiffuse;
		varying vec2 vUv;
		void main() {
			vec4 c = texture2D(tDiffuse, vUv);
			float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
			gl_FragColor = vec4(vec3(g * 0.6), c.a); // desaturate + dim
		}
	`
};