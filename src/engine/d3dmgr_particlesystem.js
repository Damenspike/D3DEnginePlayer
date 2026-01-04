import * as THREE from 'three';
import { parseColor, randUnitVec3 } from './d3dutility.js';
import { rand } from './d3dmath.js';

const clamp01 = (v) => (v < 0 ? 0 : (v > 1 ? 1 : v));
const lerp = (a, b, t) => a + (b - a) * t;

function toBlend(mode) {
	switch ((mode || 'add').toLowerCase()) {
		case 'normal': return THREE.CustomBlending;
		case 'multiply': return THREE.MultiplyBlending;
		default: return THREE.AdditiveBlending;
	}
}

function parseColorStops(input) {
	if (!input || typeof input !== 'string')
		return [{ t: 0, c: { r: 1, g: 1, b: 1, a: 1 } }];

	const s = input.trim();
	if (!/gradient\s*\(/i.test(s))
		return [{ t: 0, c: parseColor(s) }];

	const open = s.indexOf('(');
	const close = s.lastIndexOf(')');
	if (open < 0 || close <= open)
		return [{ t: 0, c: { r: 1, g: 1, b: 1, a: 1 } }];

	const inner = s.slice(open + 1, close).trim();

	const parts = [];
	let buf = '';
	let depth = 0;

	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i];
		if (ch === '(') { depth++; buf += ch; continue; }
		if (ch === ')') { depth--; buf += ch; continue; }
		if (ch === ',' && depth === 0) { parts.push(buf.trim()); buf = ''; continue; }
		buf += ch;
	}

	if (buf.trim())
		parts.push(buf.trim());

	const stops = [];
	for (const p of parts) {
		const m = p.match(/(.*?)\s+([0-9.]+)%$/);
		if (m) stops.push({ t: clamp01(parseFloat(m[2]) / 100), c: parseColor(m[1].trim()) });
		else stops.push({ t: NaN, c: parseColor(p.trim()) });
	}

	if (!stops.length)
		return [{ t: 0, c: { r: 1, g: 1, b: 1, a: 1 } }];

	let anyPos = false;
	for (const st of stops)
		if (Number.isFinite(st.t)) anyPos = true;

	if (!anyPos) {
		const n = stops.length;
		for (let i = 0; i < n; i++)
			stops[i].t = (n === 1) ? 0 : i / (n - 1);
	} else {
		if (!Number.isFinite(stops[0].t)) stops[0].t = 0;
		if (!Number.isFinite(stops[stops.length - 1].t)) stops[stops.length - 1].t = 1;

		let i = 0;
		while (i < stops.length) {
			if (Number.isFinite(stops[i].t)) { i++; continue; }

			const j = i - 1;
			let k = i + 1;
			while (k < stops.length && !Number.isFinite(stops[k].t)) k++;

			const t0 = stops[j].t;
			const t1 = (k < stops.length) ? stops[k].t : 1;
			const span = (k - j);

			for (let m = i; m < k; m++)
				stops[m].t = t0 + (t1 - t0) * ((m - j) / span);

			i = k;
		}
	}

	stops.sort((a, b) => a.t - b.t);
	return stops.map(s => ({ t: clamp01(s.t), c: s.c }));
}

function sampleStops(stops, t) {
	if (!stops || stops.length < 1)
		return { r: 1, g: 1, b: 1, a: 1 };

	if (stops.length === 1)
		return stops[0].c;

	const x = clamp01(t);

	let i = 0;
	while (i < stops.length - 1 && x > stops[i + 1].t) i++;

	const A = stops[i];
	const B = stops[Math.min(i + 1, stops.length - 1)];
	const span = Math.max(1e-6, B.t - A.t);
	const u = clamp01((x - A.t) / span);

	return {
		r: lerp(A.c.r, B.c.r, u),
		g: lerp(A.c.g, B.c.g, u),
		b: lerp(A.c.b, B.c.b, u),
		a: lerp(A.c.a, B.c.a, u)
	};
}

function hourToEnv(dayNightCycle) {
	const peak = 1;
	const a = (dayNightCycle.ambientLightIntensity || 0) / peak;
	const minNight = 0.015;
	return minNight + (1 - minNight) * clamp01(a);
}

export default class D3DParticleSystemManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.__setup = false;

		this.texLoadToken = 0;
		this.currentMap = null;
		this.lastTextureUUID = '';
		this.colorStops = [{ t: 0, c: { r: 1, g: 1, b: 1, a: 1 } }];
		this.lastSimSpace = undefined;

		this.isPaused = !this.props.playOnAwake;
		this.playedOnce = !!this.props.playOnAwake;
		this.emitCarry = 0;

		this.max = 0;
		this.alive = null;
		this.life = null;
		this.ttl = null;
		this.pos = null;
		this.vel = null;

		this.vol = null;
		this.angVel = null;
		this.alpha = null;
		this.t = null;
		this.angle = null;

		this.geom = null;
		this.mat = null;
		this.points = null;
		this.uniforms = null;

		this.sceneRoot = null;

		this.tmpLocal = new THREE.Vector3();
		this.tmpForward = new THREE.Vector3(0, 0, 1);
		this.tmpP = new THREE.Vector3();
		this.tmpD = new THREE.Vector3();
		this.tmpVOL = new THREE.Vector3();

		this.tmpWorldPos = new THREE.Vector3();
		this.tmpWorldQuat = new THREE.Quaternion();
		this.tmpWorldScl = new THREE.Vector3(1, 1, 1);

		if (this.component.enabled)
			this.setupComponent();
	}

	get props() { return this.component.properties; }

	get emissionRate() { return this.props.emissionRate; } set emissionRate(v) { this.props.emissionRate = v | 0; }
	get maxParticles() { return this.props.maxParticles; } set maxParticles(v) { this.props.maxParticles = v | 0; }
	get lifetime() { return this.props.lifetime; } set lifetime(v) { this.props.lifetime = +v || 0; }
	get startSpeed() { return this.props.startSpeed; } set startSpeed(v) { this.props.startSpeed = +v || 0; }
	get startSize() { return this.props.startSize; } set startSize(v) { this.props.startSize = +v || 0.08; }
	get endSize() { return this.props.endSize; } set endSize(v) { this.props.endSize = +v || 0; }
	get sizeAttenuation() { return this.props.sizeAttenuation; } set sizeAttenuation(v) { this.props.sizeAttenuation = !!v; }
	get useDayNight() { return this.props.useDayNight; } set useDayNight(v) { this.props.useDayNight = !!v; }
	get simulationSpace() { return this.props.simulationSpace; } set simulationSpace(v) { this.props.simulationSpace = v; }
	get looping() { return this.props.looping; } set looping(v) { this.props.looping = !!v; }
	get playOnAwake() { return this.props.playOnAwake; } set playOnAwake(v) { this.props.playOnAwake = !!v; }
	get prewarm() { return this.props.prewarm; } set prewarm(v) { this.props.prewarm = !!v; }

	get shape() { return this.props.shape; } set shape(v) { this.props.shape = v; }
	get shapeRadius() { return this.props.shapeRadius; } set shapeRadius(v) { this.props.shapeRadius = +v || 0; }
	get coneAngleDeg() { return this.props.coneAngleDeg; } set coneAngleDeg(v) { this.props.coneAngleDeg = +v || 0; }
	get boxSize() { return this.props.boxSize; } set boxSize(v) { this.props.boxSize = { x: +v.x || 0, y: +v.y || 0, z: +v.z || 0 }; }

	get texture() { return this.props.texture; } set texture(uuid) { this.props.texture = uuid || ''; }
	get blending() { return this.props.blending; } set blending(v) { this.props.blending = v; }

	get particleScale() {
		const ps = this.props.particleScale || { x: 1, y: 1, z: 1 };
		return { x: +ps.x || 1, y: +ps.y || 1, z: +ps.z || 1 };
	}
	set particleScale(v) {
		this.props.particleScale = { x: +(v?.x) || 1, y: +(v?.y) || 1, z: +(v?.z) || 1 };
	}

	get velocityOverLifetimeRandom() { return this.props.velocityOverLifetimeRandom; }
	set velocityOverLifetimeRandom(v) { this.props.velocityOverLifetimeRandom = !!v; }
	get velocityOverLifetimeRandomMin() { return this.props.velocityOverLifetimeRandomMin; }
	set velocityOverLifetimeRandomMin(v) { this.props.velocityOverLifetimeRandomMin = v; }
	get velocityOverLifetimeRandomMax() { return this.props.velocityOverLifetimeRandomMax; }
	set velocityOverLifetimeRandomMax(v) { this.props.velocityOverLifetimeRandomMax = v; }

	get angularVelocityOverLifetimeRandom() { return this.props.angularVelocityOverLifetimeRandom; }
	set angularVelocityOverLifetimeRandom(v) { this.props.angularVelocityOverLifetimeRandom = !!v; }
	get angularVelocityOverLifetimeRandomMin() { return this.props.angularVelocityOverLifetimeRandomMin; }
	set angularVelocityOverLifetimeRandomMin(v) { this.props.angularVelocityOverLifetimeRandomMin = v; }
	get angularVelocityOverLifetimeRandomMax() { return this.props.angularVelocityOverLifetimeRandomMax; }
	set angularVelocityOverLifetimeRandomMax(v) { this.props.angularVelocityOverLifetimeRandomMax = v; }

	get startRotationRandom() { return this.props.startRotationRandom; }
	set startRotationRandom(v) { this.props.startRotationRandom = !!v; }
	get startRotationRandomMinDeg() { return this.props.startRotationRandomMinDeg; }
	set startRotationRandomMinDeg(v) { this.props.startRotationRandomMinDeg = +v || 0; }
	get startRotationRandomMaxDeg() { return this.props.startRotationRandomMaxDeg; }
	set startRotationRandomMaxDeg(v) { this.props.startRotationRandomMaxDeg = +v || 0; }

	get color() { return this.props.color; } set color(v) { this.props.color = v; }

	get isPlaying() { return !this.isPaused; }

	setupComponent() {
		if (this.__setup)
			return;

		this.__setup = true;

		this.buildArrays();

		this.colorStops = parseColorStops(this.props.color);

		this.buildMaterial(true);

		this.points = new THREE.Points(this.geom, this.mat);
		this.points.frustumCulled = false;
		this.points.renderOrder = 9999;

		this.sceneRoot = this.findSceneRoot(this.d3dobject.object3d);
		this.attachForSpace(this.props.simulationSpace);
		this.lastSimSpace = this.props.simulationSpace;

		if (this.props.playOnAwake) {
			this.isPaused = false;
			this.playedOnce = true;
		} else {
			this.isPaused = true;
		}

		if (this.props.prewarm) {
			const lifetime = Math.max(1e-3, +this.props.lifetime || 1);
			const step = 1 / 60;
			const prev = this.isPaused;
			this.isPaused = false;
			for (let t = 0; t < lifetime; t += step)
				this.tick(step, true);
			this.isPaused = prev;
		}
	}

	async updateComponent(force = false) {
		if (!this.component.enabled)
			return;

		if (!this.__setup)
			this.setupComponent();

		const targetMax = Math.max(1, this.props.maxParticles | 0);
		if (targetMax !== this.max)
			this.buildArrays();

		this.colorStops = parseColorStops(this.props.color);

		if (this.props.simulationSpace !== this.lastSimSpace) {
			this.attachForSpace(this.props.simulationSpace);
			this.clear();
			this.lastSimSpace = this.props.simulationSpace;
		}

		const textureChanged = (this.lastTextureUUID !== (this.props.texture || ''));
		this.lastTextureUUID = (this.props.texture || '');

		await this.buildMaterial(textureChanged || force);

		this.uniforms.uStartSize.value = this.props.startSize || 0.08;
		this.uniforms.uEndSize.value = (this.props.endSize ?? this.props.startSize) || 0.08;
		this.uniforms.uSizeAtten.value = !!this.props.sizeAttenuation;
		this.uniforms.uWorldSpace.value = (this.props.simulationSpace === 'world');

		const ps = this.particleScale;
		this.uniforms.uParticleScale.value = Math.max(0.0001, (ps.x + ps.y + ps.z) / 3);

		this.applyBlendMode();
		this.mat.needsUpdate = true;
	}

	onSkyDomeReady() {
		if (!this.component.enabled)
			return;
		this.updateComponent(true);
	}

	play() { this.isPaused = false; this.playedOnce = true; }
	pause() { this.isPaused = true; }
	stop(clear = true) { this.isPaused = true; if (clear) this.clear(); }

	clear() {
		if (!this.__setup) return;
		this.alive.fill(0);
		this.life.fill(0);
		this.ttl.fill(0);
		this.emitCarry = 0;
		this.geom.setDrawRange(0, 0);
		const a = this.geom.attributes;
		if (a.position) a.position.needsUpdate = true;
		if (a.color) a.color.needsUpdate = true;
		if (a.aAlpha) a.aAlpha.needsUpdate = true;
		if (a.aT) a.aT.needsUpdate = true;
		if (a.aAngle) a.aAngle.needsUpdate = true;
	}

	dispose() {
		this.__setup = false;

		if (this.points?.parent)
			this.points.parent.remove(this.points);

		if (this.currentMap) {
			this.currentMap.dispose?.();
			if (this.currentMap.image && typeof this.currentMap.image.close === 'function') { try { this.currentMap.image.close(); } catch {} }
			this.currentMap = null;
		}

		this.points?.geometry?.dispose?.();
		this.points?.material?.dispose?.();

		this.points = null;
		this.geom = null;
		this.mat = null;
		this.uniforms = null;

		this.max = 0;
		this.alive = this.life = this.ttl = null;
		this.pos = this.vel = null;
		this.vol = null;
		this.angVel = null;
		this.alpha = null;
		this.t = null;
		this.angle = null;

		this.emitCarry = 0;
		this.lastSimSpace = undefined;
	}

	findSceneRoot(obj) {
		let n = obj;
		while (n.parent) n = n.parent;
		return n;
	}

	attachForSpace(space) {
		if (!this.points) return;

		const wantWorld = (space === 'world');
		const parent = wantWorld ? this.sceneRoot : this.d3dobject.object3d;

		if (this.uniforms)
			this.uniforms.uWorldSpace.value = wantWorld;

		if (this.points.parent !== parent) {
			if (this.points.parent) this.points.parent.remove(this.points);
			parent.add(this.points);
		}

		this.points.matrixAutoUpdate = !wantWorld;

		this.points.position.set(0, 0, 0);
		this.points.rotation.set(0, 0, 0);
		this.points.scale.set(1, 1, 1);

		if (wantWorld) {
			this.points.updateMatrix();
			this.points.matrixAutoUpdate = false;
		}

		this.points.updateMatrixWorld(true);
	}

	buildArrays() {
		this.max = Math.max(1, this.props.maxParticles | 0);

		this.alive = new Uint8Array(this.max);
		this.life = new Float32Array(this.max);
		this.ttl = new Float32Array(this.max);
		this.pos = new Float32Array(this.max * 3);
		this.vel = new Float32Array(this.max * 3);

		this.vol = new Float32Array(this.max * 3);
		this.angVel = new Float32Array(this.max);
		this.alpha = new Float32Array(this.max);
		this.t = new Float32Array(this.max);
		this.angle = new Float32Array(this.max);

		if (!this.geom)
			this.geom = new THREE.BufferGeometry();

		this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
		this.geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.max * 3), 3));
		this.geom.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
		this.geom.setAttribute('aT', new THREE.BufferAttribute(this.t, 1));
		this.geom.setAttribute('aAngle', new THREE.BufferAttribute(this.angle, 1));
		this.geom.setDrawRange(0, 0);

		this.alive.fill(0);
		this.emitCarry = 0;
	}

	applyBlendMode() {
		const mode = (this.props.blending || 'add').toLowerCase();

		this.mat.transparent = true;
		this.mat.depthWrite = false;
		this.mat.depthTest = true;

		if (mode === 'normal') {
			this.mat.blending = THREE.CustomBlending;
			this.mat.blendEquation = THREE.AddEquation;
			this.mat.blendEquationAlpha = THREE.AddEquation;
			this.mat.blendSrc = THREE.OneFactor;
			this.mat.blendDst = THREE.OneMinusSrcAlphaFactor;
			this.mat.blendSrcAlpha = THREE.OneFactor;
			this.mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
			this.mat.premultipliedAlpha = true;
		} else {
			this.mat.blending = toBlend(mode);
			this.mat.premultipliedAlpha = (mode === 'add');
		}
	}

	async buildMaterial(reloadTexture) {
		if (!this.uniforms) {
			this.uniforms = {
				uMap: { value: null },
				uUseMap: { value: false },
				uStartSize: { value: this.props.startSize || 0.08 },
				uEndSize: { value: (this.props.endSize ?? this.props.startSize) || 0.08 },
				uSizeAtten: { value: !!this.props.sizeAttenuation },
				uWorldSpace: { value: (this.props.simulationSpace === 'world') },
				uParticleScale: { value: 1.0 },
				uEnv: { value: 1.0 }
			};
		}

		if (!this.mat) {
			this.mat = new THREE.ShaderMaterial({
				uniforms: this.uniforms,
				vertexColors: true,
				transparent: true,
				depthWrite: false,
				depthTest: true,
				blending: toBlend(this.props.blending || 'add'),
				vertexShader: `
					attribute float aAlpha;
					attribute float aT;
					attribute float aAngle;

					varying vec3 vCol;
					varying float vAlpha;
					varying float vAngle;

					uniform float uStartSize;
					uniform float uEndSize;
					uniform bool  uSizeAtten;
					uniform bool  uWorldSpace;
					uniform float uParticleScale;

					void main() {
						vCol = color;
						vAlpha = aAlpha;
						vAngle = aAngle;

						float size = mix(uStartSize, uEndSize, aT) * uParticleScale;

						vec4 wp = vec4(position, 1.0);
						vec4 mv = uWorldSpace ? (viewMatrix * wp) : (modelViewMatrix * wp);

						float atten = uSizeAtten ? (300.0 / max(0.0001, -mv.z)) : 1.0;
						gl_PointSize = size * atten;

						gl_Position = projectionMatrix * mv;
					}
				`,
				fragmentShader: `
					uniform sampler2D uMap;
					uniform bool uUseMap;
					uniform float uEnv;

					varying vec3 vCol;
					varying float vAlpha;
					varying float vAngle;

					void main() {
						vec2 uv = gl_PointCoord - vec2(0.5);
						float c = cos(vAngle), s = sin(vAngle);
						vec2 ruv = mat2(c, -s, s, c) * uv + vec2(0.5);

						vec4 tex = uUseMap ? texture2D(uMap, ruv) : vec4(1.0);
						vec4 col = vec4(vCol, vAlpha) * tex;

						col.rgb *= uEnv;
						col.rgb *= col.a;

						if (col.a <= 0.001) discard;
						gl_FragColor = col;
					}
				`
			});
		}

		this.uniforms.uStartSize.value = this.props.startSize || 0.08;
		this.uniforms.uEndSize.value = (this.props.endSize ?? this.props.startSize) || 0.08;
		this.uniforms.uSizeAtten.value = !!this.props.sizeAttenuation;
		this.uniforms.uWorldSpace.value = (this.props.simulationSpace === 'world');

		const ps = this.particleScale;
		this.uniforms.uParticleScale.value = Math.max(0.0001, (ps.x + ps.y + ps.z) / 3);

		this.applyBlendMode();

		if (!reloadTexture) {
			this.mat.needsUpdate = true;
			return;
		}

		const loadToken = ++this.texLoadToken;
		let newMap = null;

		try {
			const uuid = this.props.texture || '';
			this.lastTextureUUID = uuid;

			if (uuid) {
				const pathInZip = this.d3dobject.root.resolvePath(uuid);
				const entry = this.d3dobject.root.zip.file(pathInZip);
				if (entry) {
					const blob = await entry.async('blob');
					newMap = await this.textureFromBlob(blob);
					newMap.wrapS = newMap.wrapT = THREE.ClampToEdgeWrapping;
				}
			}

			if (loadToken !== this.texLoadToken)
				return;

			if (this.currentMap) {
				this.currentMap.dispose?.();
				if (this.currentMap.image && typeof this.currentMap.image.close === 'function') { try { this.currentMap.image.close(); } catch {} }
			}

			this.currentMap = newMap;
			this.uniforms.uMap.value = newMap;
			this.uniforms.uUseMap.value = !!newMap;
			this.mat.needsUpdate = true;
		} catch {
			if (loadToken !== this.texLoadToken)
				return;

			if (this.currentMap) {
				this.currentMap.dispose?.();
				if (this.currentMap.image && typeof this.currentMap.image.close === 'function') { try { this.currentMap.image.close(); } catch {} }
				this.currentMap = null;
			}

			if (!this.d3dobject.enabled || !this.component.enabled)
				return;

			this.uniforms.uMap.value = null;
			this.uniforms.uUseMap.value = false;
			this.mat.needsUpdate = true;
		}
	}

	async textureFromBlob(blob) {
		try {
			const bmp = await createImageBitmap(blob);
			const tex = new THREE.Texture(bmp);
			tex.needsUpdate = true;
			return tex;
		} catch {
			const url = URL.createObjectURL(blob);
			try {
				const img = await new Promise((res, rej) => {
					const im = new Image();
					im.onload = () => res(im);
					im.onerror = rej;
					im.src = url;
				});
				const tex = new THREE.Texture(img);
				tex.needsUpdate = true;
				return tex;
			} finally {
				URL.revokeObjectURL(url);
			}
		}
	}

	emitOne(i) {
		const p = this.props;

		const local = this.tmpLocal.set(0, 0, 0);
		const forward = this.tmpForward.set(0, 0, 1);

		switch (p.shape) {
			case 'sphere': {
				const r = +p.shapeRadius || 0;
				const dir = randUnitVec3();
				local.copy(dir).multiplyScalar(r * Math.random());
				forward.copy(dir);
				break;
			}
			case 'cone': {
				const ang = (+p.coneAngleDeg || 0) * Math.PI / 180;
				const u = Math.random();
				const v = Math.random();
				const theta = 2 * Math.PI * u;
				const phi = Math.acos(1 - v * (1 - Math.cos(ang)));
				forward.set(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));

				const R = Math.max(0, +p.shapeRadius || 0);
				if (R > 0) {
					const rr = R * Math.sqrt(Math.random());
					const aa = 2 * Math.PI * Math.random();
					local.set(rr * Math.cos(aa), rr * Math.sin(aa), 0);
				}
				break;
			}
			case 'box': {
				const bs = p.boxSize || { x: 1, y: 1, z: 1 };
				local.set(
					(Math.random() - 0.5) * (+bs.x || 0),
					(Math.random() - 0.5) * (+bs.y || 0),
					(Math.random() - 0.5) * (+bs.z || 0)
				);
				forward.set(0, 0, 1);
				break;
			}
			default:
				break;
		}

		const obj = this.d3dobject.object3d;

		const i3 = i * 3;

		if (p.simulationSpace === 'world') {
			obj.updateWorldMatrix(true, false);
			obj.getWorldPosition(this.tmpWorldPos);
			obj.getWorldQuaternion(this.tmpWorldQuat);
			obj.getWorldScale(this.tmpWorldScl);

			this.tmpP.copy(local)
				.multiply(this.tmpWorldScl)
				.applyQuaternion(this.tmpWorldQuat)
				.add(this.tmpWorldPos);

			this.tmpD.copy(forward).applyQuaternion(this.tmpWorldQuat).normalize();

			this.pos[i3 + 0] = this.tmpP.x;
			this.pos[i3 + 1] = this.tmpP.y;
			this.pos[i3 + 2] = this.tmpP.z;
		} else {
			this.tmpP.copy(local);
			this.tmpD.copy(forward);

			this.pos[i3 + 0] = this.tmpP.x;
			this.pos[i3 + 1] = this.tmpP.y;
			this.pos[i3 + 2] = this.tmpP.z;
		}

		const spd = +p.startSpeed || 0;
		this.vel[i3 + 0] = this.tmpD.x * spd;
		this.vel[i3 + 1] = this.tmpD.y * spd;
		this.vel[i3 + 2] = this.tmpD.z * spd;

		const lt = +p.lifetime || 1;
		this.life[i] = lt;
		this.ttl[i] = lt;

		if (p.velocityOverLifetimeRandom == true) {
			const mn = p.velocityOverLifetimeRandomMin || { x: 0, y: 0, z: 0 };
			const mx = p.velocityOverLifetimeRandomMax || { x: 0, y: 0, z: 0 };
			this.tmpVOL.set(
				rand(+mn.x || 0, +mx.x || 0),
				rand(+mn.y || 0, +mx.y || 0),
				rand(+mn.z || 0, +mx.z || 0)
			);
		} else {
			const volBase = p.velocityOverLifetime || { x: 0, y: 0, z: 0 };
			this.tmpVOL.set(+volBase.x || 0, +volBase.y || 0, +volBase.z || 0);
		}

		if (p.simulationSpace === 'world')
			this.tmpVOL.applyQuaternion(this.tmpWorldQuat);

		this.vol[i3 + 0] = this.tmpVOL.x;
		this.vol[i3 + 1] = this.tmpVOL.y;
		this.vol[i3 + 2] = this.tmpVOL.z;

		if (p.angularVelocityOverLifetimeRandom == true) {
			const mn = p.angularVelocityOverLifetimeRandomMin || { x: 0, y: 0, z: 0 };
			const mx = p.angularVelocityOverLifetimeRandomMax || { x: 0, y: 0, z: 0 };
			this.angVel[i] = rand(+mn.z || 0, +mx.z || 0);
		} else {
			const av = p.angularVelocityOverLifetime || { x: 0, y: 0, z: 0 };
			this.angVel[i] = +av.z || 0;
		}

		if (p.startRotationRandom == true) {
			const mn = +p.startRotationRandomMinDeg || 0;
			const mx = +p.startRotationRandomMaxDeg || 0;
			this.angle[i] = THREE.MathUtils.degToRad(rand(mn, mx));
		} else {
			const startDeg = +p.startRotationDeg || 0;
			this.angle[i] = THREE.MathUtils.degToRad(startDeg);
		}

		this.t[i] = 0;
		this.alpha[i] = 1;
		this.alive[i] = 1;
	}

	emit(n) {
		for (let k = 0; k < n; k++) {
			let slot = -1;
			for (let i = 0; i < this.max; i++) {
				if (this.alive[i] === 0) { slot = i; break; }
			}
			if (slot === -1)
				return;
			this.emitOne(slot);
		}
	}

	updateDayNightLighting() {
		if (!this.useDayNight)
			return;

		const dayNightCycle = this.d3dobject.root._dayNightCycle;
		if (!dayNightCycle)
			return;

		const env = hourToEnv(dayNightCycle);
		if (this.uniforms)
			this.uniforms.uEnv.value = env;
	}

	tick(dt, force = false) {
		this.updateDayNightLighting();

		if (!Number.isFinite(dt) || dt <= 0)
			return;

		if (!force && this.isPaused)
			return;

		if (window._editor && !_editor.isSelected(this.d3dobject) && !force)
			return;

		if (this.uniforms) {
			const ps = this.particleScale;
			this.uniforms.uParticleScale.value = Math.max(0.0001, (ps.x + ps.y + ps.z) / 3);
		}

		const p = this.props;

		const rate = p.emissionRate | 0;
		if (rate > 0) {
			this.emitCarry += rate * dt;
			if (this.emitCarry >= 1) {
				const whole = this.emitCarry | 0;
				this.emit(whole);
				this.emitCarry -= whole;
			}
		}

		const pos = this.pos;
		const vel = this.vel;
		const life = this.life;
		const ttl = this.ttl;
		const alive = this.alive;

		const colors = this.geom.getAttribute('color').array;

		const g = +p.gravity || 0;

		let aliveCount = 0;

		for (let i = 0; i < this.max; i++) {
			if (alive[i] === 0)
				continue;

			life[i] -= dt;
			if (life[i] <= 0) {
				alive[i] = 0;
				continue;
			}

			aliveCount++;

			const i3 = i * 3;

			vel[i3 + 1] += g * dt;

			pos[i3 + 0] += vel[i3 + 0] * dt;
			pos[i3 + 1] += vel[i3 + 1] * dt;
			pos[i3 + 2] += vel[i3 + 2] * dt;

			pos[i3 + 0] += this.vol[i3 + 0] * dt;
			pos[i3 + 1] += this.vol[i3 + 1] * dt;
			pos[i3 + 2] += this.vol[i3 + 2] * dt;

			const avz = this.angVel[i];
			if (avz)
				this.angle[i] += avz * dt;

			const t = 1 - clamp01(life[i] / ttl[i]);
			this.t[i] = t;

			const col = sampleStops(this.colorStops, t);
			this.alpha[i] = col.a;

			colors[i3 + 0] = col.r;
			colors[i3 + 1] = col.g;
			colors[i3 + 2] = col.b;
		}

		this.geom.setDrawRange(0, aliveCount);
		this.geom.attributes.position.needsUpdate = true;
		this.geom.attributes.color.needsUpdate = true;
		this.geom.attributes.aAlpha.needsUpdate = true;
		this.geom.attributes.aT.needsUpdate = true;
		this.geom.attributes.aAngle.needsUpdate = true;

		if (!p.looping && this.playedOnce && aliveCount === 0)
			this.isPaused = true;
	}

	__onInternalEnterFrame(dt = _time.delta) {
		if (!this.component.enabled)
			return;

		if (!this.__setup)
			this.setupComponent();

		this.tick(dt, false);

		if (!this.firstRun && this.d3dobject.root.__loaded) {
			this.onSkyDomeReady();
			this.firstRun = true;
		}
	}
}