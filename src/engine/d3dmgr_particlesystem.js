// d3dparticlesystemmanager.js
import * as THREE from 'three';
import { parseColor, randUnitVec3 } from './d3dutility.js';
import { rand } from './d3dmath.js';

// ---------- utils ----------
const clamp01 = (v) => v < 0 ? 0 : (v > 1 ? 1 : v);
const lerp    = (a,b,t) => a + (b-a)*t;

function toBlend(mode) {
	switch ((mode || 'add').toLowerCase()) {
		case 'normal':   return THREE.NormalBlending;  // we override to CustomBlending
		case 'multiply': return THREE.MultiplyBlending;
		default:         return THREE.AdditiveBlending;
	}
}

// ---- color/gradient parsing (solid or CSS gradient) ----
function parseColorbestStops(input) {
	if (!input || typeof input !== 'string') return [{ t:0, c:{r:1,g:1,b:1,a:1} }];
	const s = input.trim();
	if (!/gradient\s*\(/i.test(s)) return [{ t:0, c: parseColor(s) }];

	const open = s.indexOf('('), close = s.lastIndexOf(')');
	if (open < 0 || close <= open) return [{ t:0, c:{r:1,g:1,b:1,a:1} }];
	const inner = s.slice(open+1, close).trim();

	const parts = [];
	let buf = '', depth = 0;
	for (let i=0; i<inner.length; i++) {
		const ch = inner[i];
		if (ch === '(') { depth++; buf += ch; continue; }
		if (ch === ')') { depth--; buf += ch; continue; }
		if (ch === ',' && depth === 0) { parts.push(buf.trim()); buf=''; continue; }
		buf += ch;
	}
	if (buf.trim()) parts.push(buf.trim());

	const stops = [];
	for (const p of parts) {
		const m = p.match(/(.*?)\s+([0-9.]+)%$/);
		if (m) stops.push({ colorStr: m[1].trim(), t: parseFloat(m[2]) / 100 });
		else   stops.push({ colorStr: p.trim(),     t: NaN });
	}
	if (!stops.length) return [{ t:0, c:{r:1,g:1,b:1,a:1} }];

	let anyPos = false;
	for (const st of stops) { st.c = parseColor(st.colorStr); if (Number.isFinite(st.t)) anyPos = true; }
	if (!anyPos) {
		for (let i=0; i<stops.length; i++) stops[i].t = (stops.length === 1) ? 0 : (i/(stops.length-1));
	} else {
		if (!Number.isFinite(stops[0].t)) stops[0].t = 0;
		if (!Number.isFinite(stops[stops.length-1].t)) stops[stops.length-1].t = 1;
		let i=0;
		while (i < stops.length) {
			if (Number.isFinite(stops[i].t)) { i++; continue; }
			const j=i-1; let k=i+1; while (k<stops.length && !Number.isFinite(stops[k].t)) k++;
			const t0 = stops[j].t, t1 = (k<stops.length)? stops[k].t : 1, span = (k-j);
			for (let m=i; m<k; m++) stops[m].t = t0 + (t1 - t0) * ((m - j)/span);
			i = k;
		}
	}
	for (const st of stops) st.t = clamp01(st.t);
	stops.sort((a,b)=>a.t-b.t);
	return stops.map(s => ({ t:s.t, c:s.c }));
}

function sampleStops(stops, t) {
	if (!stops || stops.length === 0) return { r:1,g:1,b:1,a:1 };
	if (stops.length === 1) return stops[0].c;
	const x = clamp01(t);
	let i = 0; while (i < stops.length-1 && x > stops[i+1].t) i++;
	const A = stops[i], B = stops[Math.min(i+1, stops.length-1)];
	const span = Math.max(1e-6, B.t - A.t);
	const u = clamp01((x - A.t) / span);
	return { r:lerp(A.c.r,B.c.r,u), g:lerp(A.c.g,B.c.g,u), b:lerp(A.c.b,B.c.b,u), a:lerp(A.c.a,B.c.a,u) };
}

const smoothstep = (a, b, x) => {
	x = clamp01((x - a) / (b - a));
	return x * x * (3 - 2 * x);
};

function hourToEnv(dayNightCycle) {
	const peak = 1;
	const a = dayNightCycle.ambientLightIntensity / peak;
	
	const minNight = 0.015;
	return minNight + (1 - minNight) * clamp01(a);
}

// ---------- manager ----------
export default class D3DParticleSystemManager {
	_texLoadToken = 0;
	_currentMap = null;
	_lastTextureUUID = '';
	_colorStops = [{ t:0, c:{r:1,g:1,b:1,a:1} }];
	_lastSimSpace = undefined;

	_tmpWorldPos = new THREE.Vector3();
	_tmpWorldQuat = new THREE.Quaternion();
	_tmpWorldScl  = new THREE.Vector3(1,1,1);

	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component  = component;

		this._isPaused   = !this.props.playOnAwake;
		this._playedOnce = !!this.props.playOnAwake;
		this._emitCarry  = 0;

		// cpu pools
		this._max   = 0;
		this._alive = this._life = this._ttl = null;
		this._pos   = this._vel  = null;

		// baked per-particle data
		this._vol    = null;  // baked VOL (vec3)
		this._angVel = null;  // float
		this._alpha  = null;  // float
		this._t      = null;  // float
		this._angle  = null;  // float

		// gpu
		this._geom = null;
		this._mat  = null;
		this._points = null;
		this._uniforms = null;

		// temps
		this._tmpLocal   = new THREE.Vector3();
		this._tmpForward = new THREE.Vector3(0,0,1);
		this._tmpP       = new THREE.Vector3();
		this._tmpD       = new THREE.Vector3();
		this._tmpVOL     = new THREE.Vector3();

		// build + attach
		this._rebuild();
		this._colorStops = parseColorbestStops(this.props.color);
		this._buildMaterial(true);

		this._points = new THREE.Points(this._geom, this._mat);
		this._points.frustumCulled = false; // let particles show even if small
		this._points.renderOrder = 9999;

		this._sceneRoot = this._findSceneRoot(this.d3dobject.object3d);
		this._attachPointsForSpace(this.props.simulationSpace);
		this._lastSimSpace = this.props.simulationSpace;

		// prewarm
		if (this.props.prewarm) {
			const lifetime = Math.max(1e-3, +this.props.lifetime || 1);
			const step = 1/60;
			const prevPaused = this._isPaused; this._isPaused = false;
			for (let t=0; t<lifetime; t+=step) this._tick(step, true);
			this._isPaused = prevPaused;
		}
	}

	// live props
	get props(){ return this.component.properties; }

	// accessors
	get emissionRate(){ return this.props.emissionRate; }   set emissionRate(v){ this.props.emissionRate = v|0; }
	get maxParticles(){ return this.props.maxParticles; }   set maxParticles(v){ this.props.maxParticles = v|0; }
	get lifetime(){ return this.props.lifetime; }           set lifetime(v){ this.props.lifetime = +v || 0; }
	get startSpeed(){ return this.props.startSpeed; }       set startSpeed(v){ this.props.startSpeed = +v || 0; }
	get startSize(){ return this.props.startSize; }         set startSize(v){ this.props.startSize = +v || 0.08; }
	get endSize(){ return this.props.endSize; }             set endSize(v){ this.props.endSize = +v || 0; }
	get sizeAttenuation(){ return this.props.sizeAttenuation; } set sizeAttenuation(v){ this.props.sizeAttenuation = !!v; }
	get useDayNight(){ return this.props.useDayNight; } 	set useDayNight(v){ this.props.useDayNight = !!v; }
	get simulationSpace(){ return this.props.simulationSpace; } set simulationSpace(v){ this.props.simulationSpace = v; }
	get looping(){ return this.props.looping; }             set looping(v){ this.props.looping = !!v; }
	get playOnAwake(){ return this.props.playOnAwake; }     set playOnAwake(v){ this.props.playOnAwake = !!v; }
	get prewarm(){ return this.props.prewarm; }             set prewarm(v){ this.props.prewarm = !!v; }

	get shape(){ return this.props.shape; }                 set shape(v){ this.props.shape = v; }
	get shapeRadius(){ return this.props.shapeRadius; }     set shapeRadius(v){ this.props.shapeRadius = +v || 0; }
	get coneAngleDeg(){ return this.props.coneAngleDeg; }   set coneAngleDeg(v){ this.props.coneAngleDeg = +v || 0; }
	get boxSize(){ return this.props.boxSize; }             set boxSize(v){ this.props.boxSize = { x:+v.x||0, y:+v.y||0, z:+v.z||0 }; }

	get texture(){ return this.props.texture; }             set texture(uuid){ this.props.texture = uuid || ''; }
	get blending(){ return this.props.blending; }           set blending(v){ this.props.blending = v; }

	get particleScale(){
		const ps = this.props.particleScale || {x:1,y:1,z:1};
		return { x:+ps.x||1, y:+ps.y||1, z:+ps.z||1 };
	}
	set particleScale(v){
		this.props.particleScale = { x:+(v?.x)||1, y:+(v?.y)||1, z:+(v?.z)||1 };
	}

	get velocityOverLifetimeRandom(){ return this.props.velocityOverLifetimeRandom; }
	set velocityOverLifetimeRandom(v){ this.props.velocityOverLifetimeRandom = !!v; }
	get velocityOverLifetimeRandomMin(){ return this.props.velocityOverLifetimeRandomMin; }
	set velocityOverLifetimeRandomMin(v){ this.props.velocityOverLifetimeRandomMin = v; }
	get velocityOverLifetimeRandomMax(){ return this.props.velocityOverLifetimeRandomMax; }
	set velocityOverLifetimeRandomMax(v){ this.props.velocityOverLifetimeRandomMax = v; }
	
	get angularVelocityOverLifetimeRandom(){ return this.props.angularVelocityOverLifetimeRandom; }
	set angularVelocityOverLifetimeRandom(v){ this.props.angularVelocityOverLifetimeRandom = !!v; }
	get angularVelocityOverLifetimeRandomMin(){ return this.props.angularVelocityOverLifetimeRandomMin; }
	set angularVelocityOverLifetimeRandomMin(v){ this.props.angularVelocityOverLifetimeRandomMin = v; }
	get angularVelocityOverLifetimeRandomMax(){ return this.props.angularVelocityOverLifetimeRandomMax; }
	set angularVelocityOverLifetimeRandomMax(v){ this.props.angularVelocityOverLifetimeRandomMax = v; }
	
	get startRotationRandom(){ return this.props.startRotationRandom; }
	set startRotationRandom(v){ this.props.startRotationRandom = !!v; }
	get startRotationRandomMinDeg(){ return this.props.startRotationRandomMinDeg; }
	set startRotationRandomMinDeg(v){ this.props.startRotationRandomMinDeg = +v || 0; }
	get startRotationRandomMaxDeg(){ return this.props.startRotationRandomMaxDeg; }
	set startRotationRandomMaxDeg(v){ this.props.startRotationRandomMaxDeg = +v || 0; }

	get color(){ return this.props.color; }                 set color(v){ this.props.color = v; }
	get isPlaying() { return !this._isPaused; }
	

	// editor signal
	async updateComponent(force = false) {
		if(!this.component.enabled)
			return;
		
		// capacity
		const targetMax = Math.max(1, this.props.maxParticles|0);
		if (targetMax !== this._max) this._rebuild();
		
		// gradient
		this._colorStops = parseColorbestStops(this.props.color);

		// sim space change → reattach & clear
		if (this.props.simulationSpace !== this._lastSimSpace) {
			this._attachPointsForSpace(this.props.simulationSpace);
			this.clear();
			this._lastSimSpace = this.props.simulationSpace;
		}

		// material / texture
		const textureChanged = (this._lastTextureUUID !== (this.props.texture || ''));
		this._lastTextureUUID = (this.props.texture || '');
		await this._buildMaterial(textureChanged || force);
		
		// uniforms mirror props
		this._uniforms.uStartSize.value  = this.props.startSize || 0.08;
		this._uniforms.uEndSize.value    = (this.props.endSize ?? this.props.startSize) || 0.08;
		this._uniforms.uSizeAtten.value  = !!this.props.sizeAttenuation;
		this._uniforms.uWorldSpace.value = (this.props.simulationSpace === 'world');

		const ps = this.particleScale;
		this._uniforms.uParticleScale.value = Math.max(0.0001, (ps.x + ps.y + ps.z) / 3);

		this._applyBlendMode();
		this._mat.needsUpdate = true;
	}
	
	onSkyDomeReady() {
		if(!this.component.enabled)
			return;
		this.updateComponent(true);
	}

	// controls
	play() { 
		this._isPaused = false;
		this._playedOnce = true;
	}
	pause() {
		this._isPaused = true;
	}
	stop(clear = true) { 
		this._isPaused = true;
		
		if (clear)
			this.clear();
	}

	clear(){
		this._alive.fill(0); this._life.fill(0); this._ttl.fill(0);
		this._emitCarry = 0;
		this._geom.setDrawRange(0, 0);
		for (const k of ['position','color','aAlpha','aT','aAngle']) {
			if (this._geom.attributes[k]) this._geom.attributes[k].needsUpdate = true;
		}
	}

	dispose(){
		if (this._points?.parent) 
			this._points.parent.remove(this._points);
		
		this._points?.geometry?.dispose();
		
		if (this._currentMap) {
			this._currentMap.dispose?.();
			
			if (this._currentMap.image) { 
				try { 
					this._currentMap.image.close(); 
				} catch {} 
			}
			
			this._currentMap = null;
		}
		this._points?.material?.dispose();
		this._points = this._geom = this._mat = this._uniforms = null;
	}

	// ---------- scene parenting ----------
	_findSceneRoot(obj) { let n=obj; while (n.parent) n = n.parent; return n; }

	_attachPointsForSpace(space) {
		if (!this._points) return;
		const wantWorld = (space === 'world');
		const targetParent = wantWorld ? this._sceneRoot : this.d3dobject.object3d;

		// Sync shader interpretation of 'position'
		if (this._uniforms) this._uniforms.uWorldSpace.value = wantWorld;

		// Reparent if needed
		if (this._points.parent !== targetParent) {
			if (this._points.parent) this._points.parent.remove(this._points);
			targetParent.add(this._points);
		}

		if (wantWorld) {
			// World space: freeze transform
			this._points.position.set(0,0,0);
			this._points.rotation.set(0,0,0);
			this._points.scale.set(1,1,1);
			this._points.updateMatrix();
			this._points.matrixAutoUpdate = false;
		} else {
			// Local space
			this._points.matrixAutoUpdate = true;
			this._points.position.set(0,0,0);
			this._points.rotation.set(0,0,0);
			this._points.scale.set(1,1,1);
		}

		this._points.updateMatrixWorld(true);
	}

	// ---------- build ----------
	_rebuild(){
		this._max = Math.max(1, this.props.maxParticles|0);

		this._alive = new Uint8Array(this._max);
		this._life  = new Float32Array(this._max);
		this._ttl   = new Float32Array(this._max);
		this._pos   = new Float32Array(this._max * 3);
		this._vel   = new Float32Array(this._max * 3);

		this._vol     = new Float32Array(this._max * 3);
		this._angVel  = new Float32Array(this._max);
		this._alpha   = new Float32Array(this._max);
		this._t       = new Float32Array(this._max);
		this._angle   = new Float32Array(this._max);

		if (!this._geom) this._geom = new THREE.BufferGeometry();
		this._geom.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
		this._geom.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(this._max * 3), 3));
		this._geom.setAttribute('aAlpha',   new THREE.BufferAttribute(this._alpha, 1));
		this._geom.setAttribute('aT',       new THREE.BufferAttribute(this._t, 1));
		this._geom.setAttribute('aAngle',   new THREE.BufferAttribute(this._angle, 1));
		this._geom.setDrawRange(0, 0);

		this._alive.fill(0);
		this._emitCarry = 0;
	}

	_applyBlendMode() {
		const mode = (this.props.blending || 'add').toLowerCase();
		if (mode === 'normal') {
			this._mat.blending           = THREE.CustomBlending;
			this._mat.blendEquation      = THREE.AddEquation;
			this._mat.blendEquationAlpha = THREE.AddEquation;
			this._mat.blendSrc           = THREE.OneFactor;               // premultiplied src
			this._mat.blendDst           = THREE.OneMinusSrcAlphaFactor;
			this._mat.blendSrcAlpha      = THREE.OneFactor;
			this._mat.blendDstAlpha      = THREE.OneMinusSrcAlphaFactor;
			this._mat.premultipliedAlpha = true;
		} else {
			this._mat.blending            = toBlend(mode);
			this._mat.premultipliedAlpha  = (mode === 'add'); // fine
		}
		// *** Correct depth behavior for particles: integrate with scene ***
		this._mat.transparent = true;
		this._mat.depthWrite  = false; // don't punch holes into depth
		this._mat.depthTest   = true;  // DO respect geometry in front
	}

	async _buildMaterial(reloadTexture){
		if (!this._uniforms) {
			this._uniforms = {
				uMap:           { value: null },
				uUseMap:        { value: false },
				uStartSize:     { value: this.props.startSize || 0.08 },
				uEndSize:       { value: (this.props.endSize ?? this.props.startSize) || 0.08 },
				uSizeAtten:     { value: !!this.props.sizeAttenuation },
				uWorldSpace:    { value: (this.props.simulationSpace === 'world') },
				uParticleScale: { value: 1.0 },
				uEnv: 			{ value: 1.0 }
			};
		}

		if (!this._mat) {
			this._mat = new THREE.ShaderMaterial({
				uniforms: this._uniforms,
				vertexColors: true,          // enables `color` attribute; don't redeclare it in GLSL
				transparent: true,
				depthWrite: false,
				depthTest:  true,            // proper integration
				blending: toBlend(this.props.blending || 'add'),
				vertexShader: `
					// DO NOT redeclare 'attribute vec3 color;' — three injects it when vertexColors=true.
					attribute float aAlpha;   // per-particle alpha
					attribute float aT;       // lifetime fraction
					attribute float aAngle;   // rotation (radians)

					// we keep our own varyings to avoid colliding with three's #defines
					varying vec3  vCol;
					varying float vAlpha;
					varying float vAngle;

					uniform float uStartSize;
					uniform float uEndSize;
					uniform bool  uSizeAtten;
					uniform bool  uWorldSpace;
					uniform float uParticleScale;

					void main() {
						vCol   = color;
						vAlpha = aAlpha;
						vAngle = aAngle;

						float size = mix(uStartSize, uEndSize, aT) * uParticleScale;

						vec4 worldPos = vec4(position, 1.0); // 'position' holds particle position (local or world)
						vec4 mv = uWorldSpace
							? (viewMatrix * worldPos)
							: (modelViewMatrix * worldPos);

						float atten = uSizeAtten ? (300.0 / max(0.0001, -mv.z)) : 1.0;
						gl_PointSize = size * atten;

						gl_Position = projectionMatrix * mv;
					}
				`,
				fragmentShader: `
					uniform sampler2D uMap;
					uniform bool uUseMap;
					uniform float uEnv;

					varying vec3  vCol;
					varying float vAlpha;
					varying float vAngle;

					void main() {
						// rotate the point sprite UV around center using vAngle
						vec2 uv = gl_PointCoord - vec2(0.5);
						float c = cos(vAngle), s = sin(vAngle);
						vec2 ruv = mat2(c, -s, s, c) * uv + vec2(0.5);

						vec4 tex = uUseMap ? texture2D(uMap, ruv) : vec4(1.0);
						vec4 col = vec4(vCol, vAlpha) * tex;
						
						col.rgb *= uEnv;        // apply day/night brightness
						col.rgb *= col.a;       // premultiply

						if (col.a <= 0.001) discard;
						gl_FragColor = col;
					}
				`
			});
		}

		// uniforms mirror props
		this._uniforms.uStartSize.value  = this.props.startSize || 0.08;
		this._uniforms.uEndSize.value    = (this.props.endSize ?? this.props.startSize) || 0.08;
		this._uniforms.uSizeAtten.value  = !!this.props.sizeAttenuation;
		this._uniforms.uWorldSpace.value = (this.props.simulationSpace === 'world');

		const ps = this.particleScale;
		this._uniforms.uParticleScale.value = Math.max(0.0001, (ps.x + ps.y + ps.z) / 3);

		this._applyBlendMode();

		if (reloadTexture) {
			const loadToken = ++this._texLoadToken;
			let newMap = null;
			try {
				const uuid = this.props.texture || '';
				this._lastTextureUUID = uuid;
				if (uuid) {
					const pathInZip = this.d3dobject.root.resolvePath(uuid);
					const entry = this.d3dobject.root.zip.file(pathInZip);
					if (entry) {
						const blob = await entry.async('blob');
						newMap = await this._textureFromBlob(blob);
						newMap.wrapS = newMap.wrapT = THREE.ClampToEdgeWrapping;
					}
				}
				if (loadToken !== this._texLoadToken) return;
				if (this._currentMap) {
					this._currentMap.dispose?.();
					if (this._currentMap.image && typeof this._currentMap.image.close === 'function') { try { this._currentMap.image.close(); } catch {} }
				}
				this._currentMap = newMap;
				this._uniforms.uMap.value = newMap;
				this._uniforms.uUseMap.value = !!newMap;
				this._mat.needsUpdate = true;
			} catch {
				if (loadToken !== this._texLoadToken) return;
				if (this._currentMap) {
					this._currentMap.dispose?.();
					if (this._currentMap.image && typeof this._currentMap.image.close === 'function') { try { this._currentMap.image.close(); } catch {} }
				}
				this._currentMap = null;
				
				if(!this.d3dobject.enabled || !this.component.enabled)
					return;
				
				this._uniforms.uMap.value = null;
				this._uniforms.uUseMap.value = false;
				this._mat.needsUpdate = true;
			}
		} else {
			this._mat.needsUpdate = true;
		}
	}

	// blob -> THREE.Texture
	async _textureFromBlob(blob){
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
			} finally { URL.revokeObjectURL(url); }
		}
	}

	// ---------- emission ----------
	_emitOne(i){
		const p = this.props;

		// spawn in local first
		const local   = this._tmpLocal.set(0,0,0);
		const forward = this._tmpForward.set(0,0,1);

		switch (p.shape) {
			case 'sphere': {
				const r = p.shapeRadius || 0;
				const dir = randUnitVec3();
				local.copy(dir).multiplyScalar(r * Math.random());
				forward.copy(dir);
				break;
			}
			case 'cone': {
				const ang = (p.coneAngleDeg || 0) * Math.PI / 180;
				const u = Math.random(), v = Math.random();
				const theta = 2 * Math.PI * u;
				const phi   = Math.acos(1 - v * (1 - Math.cos(ang)));
				forward.set(Math.sin(phi)*Math.cos(theta), Math.sin(phi)*Math.sin(theta), Math.cos(phi));
				// base disc using shapeRadius
				const R = Math.max(0, +p.shapeRadius || 0);
				if (R > 0) {
					const rr = R * Math.sqrt(Math.random());
					const aa = 2 * Math.PI * Math.random();
					local.set(rr * Math.cos(aa), rr * Math.sin(aa), 0);
				}
				break;
			}
			case 'box': {
				const bs = p.boxSize || {x:1,y:1,z:1};
				local.set(
					(Math.random()-0.5)*(bs.x||0),
					(Math.random()-0.5)*(bs.y||0),
					(Math.random()-0.5)*(bs.z||0)
				);
				forward.set(0,0,1);
				break;
			}
			default: /* point */ break;
		}

		const obj  = this.d3dobject.object3d;
		const outP = this._tmpP;
		const outD = this._tmpD;

		const i3 = i*3;

		if (p.simulationSpace === 'world') {
			// fetch emitter world transform
			obj.updateWorldMatrix(true, false);
			obj.getWorldPosition(this._tmpWorldPos);
			obj.getWorldQuaternion(this._tmpWorldQuat);
			obj.getWorldScale(this._tmpWorldScl);

			// position: local -> world (respect non-uniform scale)
			this._tmpP.copy(local)
				.multiply(this._tmpWorldScl)
				.applyQuaternion(this._tmpWorldQuat)
				.add(this._tmpWorldPos);

			// direction: rotate only
			this._tmpD.copy(forward).applyQuaternion(this._tmpWorldQuat).normalize();

			this._pos[i3+0] = this._tmpP.x;
			this._pos[i3+1] = this._tmpP.y;
			this._pos[i3+2] = this._tmpP.z;
		} else {
			// local space; parented to emitter
			outP.copy(local);
			outD.copy(forward);
			this._pos[i3+0] = outP.x;
			this._pos[i3+1] = outP.y;
			this._pos[i3+2] = outP.z;
		}

		// initial velocity
		const spd = +p.startSpeed || 0;
		this._vel[i3+0] = outD.x * spd;
		this._vel[i3+1] = outD.y * spd;
		this._vel[i3+2] = outD.z * spd;

		// lifetime
		const lt = +p.lifetime || 1;
		this._life[i] = lt;
		this._ttl[i]  = lt;

		// baked VOL (space-consistent)
		if (p.velocityOverLifetimeRandom == true) {
			const mn = p.velocityOverLifetimeRandomMin || {x:0,y:0,z:0};
			const mx = p.velocityOverLifetimeRandomMax || {x:0,y:0,z:0};
			this._tmpVOL.set(
				rand(+mn.x||0, +mx.x||0),
				rand(+mn.y||0, +mx.y||0),
				rand(+mn.z||0, +mx.z||0)
			);
		} else {
			const volBase = p.velocityOverLifetime || {x:0,y:0,z:0};
			this._tmpVOL.set(+volBase.x||0, +volBase.y||0, +volBase.z||0);
		}
		
		if (p.simulationSpace === 'world') {
			this._tmpVOL.applyQuaternion(this._tmpWorldQuat); // rotate only
		}
		
		this._vol[i3+0] = this._tmpVOL.x;
		this._vol[i3+1] = this._tmpVOL.y;
		this._vol[i3+2] = this._tmpVOL.z;
		
		// baked angular velocity (Z spin radians/sec)
		if (p.angularVelocityOverLifetimeRandom == true) {
			const mn = p.angularVelocityOverLifetimeRandomMin || {x:0,y:0,z:0};
			const mx = p.angularVelocityOverLifetimeRandomMax || {x:0,y:0,z:0};
			this._angVel[i] = rand(+mn.z||0, +mx.z||0);
		} else {
			const av = p.angularVelocityOverLifetime || {x:0,y:0,z:0};
			this._angVel[i] = +av.z || 0;
		}
		
		// start rotation (deg -> radians)
		if (p.startRotationRandom == true) {
			const mn = +p.startRotationRandomMinDeg || 0;
			const mx = +p.startRotationRandomMaxDeg || 0;
			this._angle[i] = THREE.MathUtils.degToRad(rand(mn, mx));
		} else {
			const startDeg = +p.startRotationDeg || 0;
			this._angle[i] = THREE.MathUtils.degToRad(startDeg);
		}
		
		this._t[i]     = 0;
		this._alpha[i] = 1;
		this._alive[i] = 1;
	}

	_emit(n){
		for (let k=0; k<n; k++) {
			let slot = -1;
			for (let i=0; i<this._max; i++) { if (this._alive[i] === 0) { slot = i; break; } }
			if (slot === -1) return;
			this._emitOne(slot);
		}
	}

	// ---------- sim ----------
	_tick(dt, force=false) {
		// Update day night lighting
		this.updateDayNightLighting();
		
		if (!Number.isFinite(dt) || dt <= 0) return;
		if (!force && this._isPaused) return;

		// (optional) simulate only if selected in editor
		if (window._editor && !_editor.isSelected(this.d3dobject) && !force) return;

		// keep particleScale live
		if (this._uniforms) {
			const ps = this.particleScale;
			this._uniforms.uParticleScale.value = Math.max(0.0001, (ps.x + ps.y + ps.z) / 3);
		}

		const p = this.props;

		// emission
		const rate = p.emissionRate | 0;
		if (rate > 0) {
			this._emitCarry += rate * dt;
			if (this._emitCarry >= 1) {
				const whole = this._emitCarry | 0;
				this._emit(whole);
				this._emitCarry -= whole;
			}
		}

		// integrate
		const pos = this._pos, vel = this._vel, life = this._life, ttl = this._ttl, alive = this._alive;
		const colors = this._geom.getAttribute('color').array;

		const g = +p.gravity || 0;

		let aliveCount = 0;

		for (let i=0; i<this._max; i++) {
			if (alive[i] === 0) continue;

			life[i] -= dt;
			if (life[i] <= 0) { alive[i] = 0; continue; }

			aliveCount++;

			// gravity on Y velocity
			vel[i*3+1] += g * dt;

			// base velocity
			pos[i*3+0] += vel[i*3+0] * dt;
			pos[i*3+1] += vel[i*3+1] * dt;
			pos[i*3+2] += vel[i*3+2] * dt;

			// baked VOL
			pos[i*3+0] += this._vol[i*3+0] * dt;
			pos[i*3+1] += this._vol[i*3+1] * dt;
			pos[i*3+2] += this._vol[i*3+2] * dt;

			// angular velocity (Z spin)
			const avz = this._angVel[i];
			if (avz) this._angle[i] += avz * dt;

			// lifetime fraction & gradient color
			const t = 1 - clamp01(life[i] / ttl[i]);
			this._t[i] = t;
			const col = sampleStops(this._colorStops, t);
			this._alpha[i] = col.a;

			const j3 = i*3;
			colors[j3+0] = col.r;
			colors[j3+1] = col.g;
			colors[j3+2] = col.b;
		}

		this._geom.setDrawRange(0, aliveCount);
		this._geom.attributes.position.needsUpdate = true;
		this._geom.attributes.color.needsUpdate    = true;
		this._geom.attributes.aAlpha.needsUpdate   = true;
		this._geom.attributes.aT.needsUpdate       = true;
		this._geom.attributes.aAngle.needsUpdate   = true;

		if (!p.looping && this._playedOnce && aliveCount === 0) this._isPaused = true;
	}
	updateDayNightLighting() {
		if(!this.useDayNight)
			return;
	
		const dayNightCycle = this.d3dobject.root._dayNightCycle;
		if(!dayNightCycle)
			return;
		
		const env = hourToEnv(dayNightCycle);
		
		if(this._uniforms)
			this._uniforms.uEnv.value = env;
	}

	__onInternalEnterFrame(dt = _time.delta) { 
		this._tick(dt, false); 
		
		if(!this._firstRun && this.d3dobject.root.__loaded) {
			this.onSkyDomeReady();
			this._firstRun = true;
		}
	}
}