import { importModelFromZip } from './glb-instancer.js';
import { fileName } from './d3dutility.js';
import { clamp01 } from './d3dmath.js';

export default class MeshManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.zip = this.d3dobject.root.zip;
		this.isSubMesh = (this.component.type === 'SubMesh');
		this.aoEnabled = true;
		
		if(!_root.__texShared)
			_root.__texShared = new Map();
	}

	// =====================================================
	// GETTERS / SETTERS
	// =====================================================

	get mesh() {
		return this.component.properties?.mesh;
	}
	set mesh(v) {
		this.component.properties.mesh = v;
	}

	get materials() {
		return this.component.properties?.materials;
	}
	set materials(v) {
		this.component.properties.materials = v;
	}

	get castShadow() {
		return !!this.component.properties.castShadow;
	}
	set castShadow(v) {
		this.component.properties.castShadow = !!v;
		this._applyShadows();
	}

	get receiveShadow() {
		return !!this.component.properties.receiveShadow;
	}
	set receiveShadow(v) {
		this.component.properties.receiveShadow = !!v;
		this._applyShadows();
	}
	
	get ambientOcclusion() {
		return !!this.component.properties.ambientOcclusion;
	}
	set ambientOcclusion(v) {
		this.component.properties.ambientOcclusion = !!v;
		this._applyAmbientOcclusion();
	}
	
	get morphTargets() {
		return this.component.properties?.morphTargets || {};
	}
	set morphTargets(v) {
		this.component.properties.morphTargets = v || {};
		this._applyMorphTargets();
	}
	
	get instancing() {
		return !!this.component.properties.instancing;
	}
	set instancing(v) {
		this.component.properties.instancing = !!v;
	}
	
	get instancingId() {
		return this.component.properties.instancingId;
	}
	set instancingId(v) {
		this.component.properties.instancingId = v;
	}

	// =====================================================
	// HELPER FUNCTIONS
	// =====================================================

	_norm(p) {
		return p ? p.replace(/\/+/g, '/').replace(/^\.\//, '') : p;
	}

	_safeModelBase(p) {
		if (!p) return 'model';
		const fn = p.split('/').pop() || p;
		const dot = fn.lastIndexOf('.');
		const base = dot >= 0 ? fn.slice(0, dot) : fn;
		return (base.replace(/[^\w\-\.]+/g, '_') || 'model');
	}

	_mimeFromExt(p) {
		const ext = (p.split('.').pop() || '').toLowerCase();
		if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
		if (ext === 'png')  return 'image/png';
		if (ext === 'webp') return 'image/webp';
		if (ext === 'ktx2') return 'image/ktx2';
		return 'application/octet-stream';
	}

	_fixColor(val) {
		if (val == null) return val;
		if (typeof val === 'number') return val;
		const s = String(val).trim();
		if (!s) return val;
		if (s.startsWith('#')) return s;
		if (/^0x/i.test(s)) return parseInt(s.slice(2), 16);
		if (/^[0-9a-fA-F]{6}$/.test(s)) return parseInt(s, 16);
		if (/^\d+$/.test(s)) return Number(s);
		return s;
	}
	
	_applyRenderMode(m, params) {
		if(!m || !params)
			return;
	
		// legacy: if people still set transparent/opacity directly, don't fight it.
		const mode = params.renderMode || null;
	
		// defaults
		if(params.depthWrite !== undefined)
			m.depthWrite = !!params.depthWrite;
	
		if(params.alphaTest !== undefined)
			m.alphaTest = clamp01(params.alphaTest);
	
		if(mode === 'opaque') {
			m.transparent = false;
			m.opacity = 1;
			m.alphaTest = 0;
			if(params.depthWrite === undefined) m.depthWrite = true;
		}else
		if(mode === 'cutout') {
			m.transparent = false;
			m.opacity = 1;
			m.alphaTest = params.alphaTest !== undefined ? clamp01(params.alphaTest) : 0.5;
			if(params.depthWrite === undefined) m.depthWrite = true;
		}else
		if(mode === 'fade') {
			m.transparent = true;
			// keep user opacity
			if(typeof params.opacity === 'number')
				m.opacity = clamp01(params.opacity);
			m.alphaTest = 0;
			if(params.depthWrite === undefined) m.depthWrite = false;
		}
	
		m.needsUpdate = true;
	}

	async _readTextByUUID(uuid) {
		if (!uuid) return null;
		const rel = this.d3dobject.resolvePathNoAssets(uuid);
		if (!rel) return null;
		const zf = this.zip.file(this._norm('assets/' + rel));
		return zf ? await zf.async('string') : null;
	}

	async _loadTextureShared(uuid, isColor = false) {
		if(!uuid)
			return null;
	
		const shared = _root.__texShared;
		let entry = shared.get(uuid);
		if(entry) {
			entry.owners.add(this.d3dobject);
			return entry.tex;
		}
	
		const rel = this.d3dobject.resolvePathNoAssets(uuid);
		if(!rel)
			return null;
	
		const zf = this.zip.file(this._norm('assets/' + rel));
		if(!zf)
			return null;
	
		const buf  = await zf.async('arraybuffer');
		const blob = new Blob([buf], { type: this._mimeFromExt(rel) });
		const bmp  = await createImageBitmap(blob);
	
		const tex = new THREE.Texture(bmp);
		tex.flipY = false;
	
		if(isColor) {
			if('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
			else tex.encoding = THREE.sRGBEncoding;
		}
	
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.needsUpdate = true;
	
		if(!tex.userData) tex.userData = {};
		tex.userData._assetUUID = uuid;
	
		entry = {
			tex,
			owners: new Set([this.d3dobject])
		};
		
		shared.set(uuid, entry);
		return tex;
	}
	async _setMapRel(mat, key, uuid, isColor = false) {
		if(!(key in mat))
			return;
			
		// remove previous ownership
		if(mat[key]?.userData?._assetUUID) {
			const old = _root.__texShared.get(mat[key].userData._assetUUID);
			if(old)
				old.owners.delete(this.d3dobject);
		}
	
		if(!uuid) {
			if(mat[key]) {
				mat[key] = null;
				mat.needsUpdate = true;
			}
			return;
		}
	
		// already correct
		if(mat[key]?.userData?._assetUUID === uuid)
			return;
	
		const tex = await this._loadTextureShared(uuid, isColor);
		if(!tex)
			return;
	
		mat[key] = tex;
		mat.needsUpdate = true;
	}

	_stripIncompatible(params, type) {
		const {
			// your custom / non-three keys:
			renderMode,
		
			maps, doubleSided,
			mapOffset, mapRepeat,
			normalMapOffset, normalMapRepeat,
			emissiveMapOffset, emissiveMapRepeat,
			map, normalMap, roughnessMap, metalnessMap, emissiveMap, aoMap, alphaMap,
			...rest
		} = params;
		
		delete rest.mapOffset; delete rest.mapRepeat;
		delete rest.normalMapOffset; delete rest.normalMapRepeat;
		delete rest.doubleSided; delete rest.maps;
		delete rest.map; delete rest.normalMap;
		delete rest.roughnessMap; delete rest.metalnessMap;
		delete rest.emissiveMap; delete rest.aoMap; delete rest.alphaMap;
		delete rest.emissiveMapOffset; delete rest.emissiveMapRepeat;
	
		if (doubleSided === true) rest.side = THREE.DoubleSide;
	
		if (type === 'MeshBasicMaterial') {
			delete rest.metalness;
			delete rest.roughness;
			delete rest.emissive;
			delete rest.emissiveIntensity;
			delete rest.envMapIntensity;
		}
	
		const mergedMaps = {
			...(maps || {}),
			...(map ? { map } : null),
			...(normalMap ? { normalMap } : null),
			...(roughnessMap ? { roughnessMap } : null),
			...(metalnessMap ? { metalnessMap } : null),
			...(emissiveMap ? { emissiveMap } : null),
			...(aoMap ? { aoMap } : null),
			...(alphaMap ? { alphaMap } : null),
		};
	
		return {
			ctorParams: rest,
			pulled: {
				maps: mergedMaps,
				mapOffset, mapRepeat,
				normalMapOffset, normalMapRepeat,
				emissiveMapOffset, emissiveMapRepeat,
				renderMode
			}
		};
	}

	async _buildMaterialFromParams(paramsIn) {
		if (!paramsIn) return null;
	
		const params = { ...paramsIn };
		const type   = params.type || 'MeshStandardMaterial';
	
		// Keep it simple: only normal Three material types here
		if ('color' in params)    params.color    = this._fixColor(params.color);
		if ('emissive' in params) params.emissive = this._fixColor(params.emissive);
	
		if (params.opacity !== undefined && params.opacity < 1 && params.transparent !== true)
			params.transparent = true;
	
		if (typeof params.side === 'string' && THREE[params.side] !== undefined)
			params.side = THREE[params.side];
	
		const Ctor = THREE[type];
		if (!Ctor) return null;
	
		const { ctorParams } = this._stripIncompatible(params, type);
		const m = new Ctor(ctorParams);
		
		this._applyRenderMode(m, params);
	
		if (!m.userData) m.userData = {};
		if (m.userData._baseOpacity == null) {
			m.userData._baseOpacity =
				typeof ctorParams.opacity === 'number' ? ctorParams.opacity : 1;
		}
		if ('toneMapped' in m) m.toneMapped = false;
	
		m.needsUpdate = true;
		return m;
	}
	async _buildMaterialFromMatUUID(uuid) {
		if (!uuid) return null;
	
		const txt = await this._readTextByUUID(uuid);
		if (!txt) return null;
	
		let params;
		try { params = JSON.parse(txt); } catch { return null; }
	
		const type = params.type || 'MeshStandardMaterial';
		
		// If it isn't ShaderMaterial, these keys are garbage to three.js and will warn.
		if (type !== 'ShaderMaterial') {
			delete params.vertexShader;
			delete params.fragmentShader;
			delete params.shaderProps;
			delete params.flatShading;
		}
	
		// ---- Common fixes (all material types, including ShaderMaterial) ----
		if ('color' in params)    params.color    = this._fixColor(params.color);
		if ('emissive' in params) params.emissive = this._fixColor(params.emissive);
	
		// make sure transparent is correct for non-1 opacity
		if (params.opacity !== undefined && params.opacity < 1 && params.transparent !== true)
			params.transparent = true;
	
		if (typeof params.side === 'string' && THREE[params.side] !== undefined)
			params.side = THREE[params.side];
	
		// -------------------------------------------------
		// ShaderMaterial path (with lights + standard props)
		// -------------------------------------------------
		if (type === 'ShaderMaterial') {
			const vertexShaderUUID   = params.vertexShader || null;
			const fragmentShaderUUID = params.fragmentShader || null;
	
			// remove UUIDs from ctor params
			delete params.vertexShader;
			delete params.fragmentShader;
	
			const vertSrc = vertexShaderUUID   ? await this._readTextByUUID(vertexShaderUUID)   : null;
			const fragSrc = fragmentShaderUUID ? await this._readTextByUUID(fragmentShaderUUID) : null;
			if (!vertSrc || !fragSrc) return null;
	
			const baseColor = params.color != null ? params.color : 0xffffff;
			const baseOpacity = typeof params.opacity === 'number' ? params.opacity : 1;
	
			// Base uniforms: common + lights
			const uniforms = THREE.UniformsUtils.merge([
				THREE.UniformsLib.common,
				THREE.UniformsLib.lights
			]);
	
			// diffuse from material color
			if (uniforms.diffuse && uniforms.diffuse.value && uniforms.diffuse.value.copy) {
				uniforms.diffuse.value.copy(new THREE.Color(baseColor));
			} else {
				uniforms.diffuse = { value: new THREE.Color(baseColor) };
			}
	
			// opacity uniform from material opacity
			if (uniforms.opacity) {
				uniforms.opacity.value = baseOpacity;
			} else {
				uniforms.opacity = { value: baseOpacity };
			}
	
			// we drove diffuse from color → drop color param from ctor
			delete params.color;
	
			// shaderProps → uniforms
			const shaderProps = Array.isArray(params.shaderProps) ? params.shaderProps : [];
			delete params.shaderProps;
	
			const parseVal = (v) => {
				if (typeof v !== 'string') return v;
				const t = v.trim();
				if (t === '') return '';
				if (t === 'true') return true;
				if (t === 'false') return false;
				const n = Number(t);
				if (Number.isFinite(n)) return n;
				return t;
			};
	
			for (const prop of shaderProps) {
				if (!prop || !prop.key) continue;
				const k = prop.key.trim();
				if (!k) continue;
				uniforms[k] = { value: parseVal(prop.value) };
			}
	
			const ctorParams = {
				...params,
				vertexShader: vertSrc,
				fragmentShader: fragSrc,
				uniforms,
				lights: true
			};
	
			const m = new THREE.ShaderMaterial(ctorParams);
	
			// store authoring opacity once; applyOpacity will use this
			if (!m.userData) m.userData = {};
			if (m.userData._baseOpacity == null) {
				m.userData._baseOpacity = baseOpacity;
			}
	
			if ('toneMapped' in m) m.toneMapped = false;
	
			// Load textures just like for standard materials
			await this._setMapRel(m, 'map',          params.map,         true);
			await this._setMapRel(m, 'normalMap',    params.normalMap);
			await this._setMapRel(m, 'roughnessMap', params.roughnessMap);
			await this._setMapRel(m, 'metalnessMap', params.metalnessMap);
			await this._setMapRel(m, 'emissiveMap',  params.emissiveMap, true);
			await this._setMapRel(m, 'aoMap',        params.aoMap);
			await this._setMapRel(m, 'alphaMap',     params.alphaMap);
	
			// Apply UV offset / scale for color & normal maps
			const mapOffset        = params.mapOffset;
			const mapRepeat        = params.mapRepeat;
			const normalMapOffset  = params.normalMapOffset;
			const normalMapRepeat  = params.normalMapRepeat;
			const emissiveMapOffset = params.emissiveMapOffset;
			const emissiveMapRepeat = params.emissiveMapRepeat;
	
			if (m.map) {
				if (Array.isArray(mapOffset)) m.map.offset.set(mapOffset[0] || 0, mapOffset[1] || 0);
				if (Array.isArray(mapRepeat)) m.map.repeat.set(mapRepeat[0] || 1, mapRepeat[1] || 1);
				m.map.needsUpdate = true;
			}
	
			if (m.normalMap) {
				if (Array.isArray(normalMapOffset)) m.normalMap.offset.set(normalMapOffset[0] || 0, normalMapOffset[1] || 0);
				if (Array.isArray(normalMapRepeat)) m.normalMap.repeat.set(normalMapRepeat[0] || 1, normalMapRepeat[1] || 1);
				m.normalMap.needsUpdate = true;
			}
			
			if (m.emissiveMap) {
				if (Array.isArray(emissiveMapOffset)) m.emissiveMap.offset.set(emissiveMapOffset[0] || 0, emissiveMapOffset[1] || 0);
				if (Array.isArray(emissiveMapRepeat)) m.emissiveMap.repeat.set(emissiveMapRepeat[0] || 1, emissiveMapRepeat[1] || 1);
				m.emissiveMap.needsUpdate = true;
			}
			
			this._applyRenderMode(m, params);
	
			m.needsUpdate = true;
			return m;
		}
	
		// -------------------------------------------------
		// Original path for Standard/Physical/Basic/etc.
		// -------------------------------------------------
		const Ctor = THREE[type];
		if (!Ctor) return null;
	
		const { ctorParams, pulled } = this._stripIncompatible({ ...params }, type);
	
		const m = new Ctor(ctorParams);
		
		this._applyRenderMode(m, params);
	
		// store authoring opacity once; applyOpacity will use this
		if (!m.userData) m.userData = {};
		if (m.userData._baseOpacity == null) {
			m.userData._baseOpacity =
				typeof ctorParams.opacity === 'number' ? ctorParams.opacity : 1;
		}
	
		if ('toneMapped' in m) m.toneMapped = false;
	
		const maps = pulled.maps || {};
		const mapOffset        = pulled.mapOffset;
		const mapRepeat        = pulled.mapRepeat;
		const normalMapOffset  = pulled.normalMapOffset;
		const normalMapRepeat  = pulled.normalMapRepeat;
		const emissiveMapOffset = pulled.emissiveMapOffset;
		const emissiveMapRepeat = pulled.emissiveMapRepeat;
	
		// Load textures
		await this._setMapRel(m, 'map',          maps.map,         true);
		await this._setMapRel(m, 'normalMap',    maps.normalMap);
		await this._setMapRel(m, 'roughnessMap', maps.roughnessMap);
		await this._setMapRel(m, 'metalnessMap', maps.metalnessMap);
		await this._setMapRel(m, 'emissiveMap',  maps.emissiveMap, true);
		await this._setMapRel(m, 'aoMap',        maps.aoMap);
		await this._setMapRel(m, 'alphaMap',     maps.alphaMap);
	
		// Apply UV offset / scale for color map
		if (m.map) {
			if (Array.isArray(mapOffset)) m.map.offset.set(mapOffset[0] || 0, mapOffset[1] || 0);
			if (Array.isArray(mapRepeat)) m.map.repeat.set(mapRepeat[0] || 1, mapRepeat[1] || 1);
			m.map.needsUpdate = true;
		}
	
		// Apply UV offset / scale for normal map
		if (m.normalMap) {
			if (Array.isArray(normalMapOffset)) m.normalMap.offset.set(normalMapOffset[0] || 0, normalMapOffset[1] || 0);
			if (Array.isArray(normalMapRepeat)) m.normalMap.repeat.set(normalMapRepeat[0] || 1, normalMapRepeat[1] || 1);
			m.normalMap.needsUpdate = true;
		}
		
		// Apply UV offset / scale for emissive map
		if (m.emissiveMap) {
			if (Array.isArray(emissiveMapOffset)) m.emissiveMap.offset.set(emissiveMapOffset[0] || 0, emissiveMapOffset[1] || 0);
			if (Array.isArray(emissiveMapRepeat)) m.emissiveMap.repeat.set(emissiveMapRepeat[0] || 1, emissiveMapRepeat[1] || 1);
			m.emissiveMap.needsUpdate = true;
		}
	
		m.needsUpdate = true;
		return m;
	}
	
	_applyVertexColors(mesh) {
		if(!mesh?.geometry?.attributes?.color)
			return;
	
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
	
		for(const m of mats) {
			if(!m)
				continue;
	
			// Standard/Physical/Lambert/etc.
			if('vertexColors' in m)
				m.vertexColors = true;
	
			m.needsUpdate = true;
		}
	}

	async _applyMaterialsToThreeMesh(mesh, defs) {
		const src = Array.isArray(defs) ? defs : [];
		const mats = await Promise.all(src.map(def => {
			if (!def) return null;
	
			// 1) existing path: UUID string
			if (typeof def === 'string')
				return this._buildMaterialFromMatUUID(def);
	
			// 2) direct THREE.Material (optional but handy)
			if (def.isMaterial)
				return def;
	
			// 3) plain params object: runtime material
			if (typeof def === 'object')
				return this._buildMaterialFromParams(def);
	
			return null;
		}));
	
		const groups = mesh.geometry?.groups ?? [];
	
		if (mesh.isSkinnedMesh) {
			for (const mm of mats) if (mm && 'skinning' in mm) mm.skinning = true;
			mesh.frustumCulled = true;
			mesh.geometry.computeBoundingSphere();
			mesh.geometry.computeBoundingBox?.();
		}
	
		if (groups.length > 1) {
			const maxSlot = groups.reduce((m, g) => Math.max(m, g.materialIndex ?? 0), 0);
			const arr = new Array(Math.max(mats.length, maxSlot + 1));
			for (let i = 0; i < arr.length; i++)
				arr[i] = mats[i] ?? mats[mats.length - 1] ?? mesh.material ?? null;
			mesh.material = arr;
			arr.forEach(mm => mm && (mm.needsUpdate = true));
		} else {
			const m0 = mats[0] ?? mesh.material ?? null;
			if (m0) {
				mesh.material = m0;
				mesh.material.needsUpdate = true;
			}
		}
		
		this._applyVertexColors(mesh);
		
		this.meshLoaded = true;
	}

	async _buildMatMap(modelPath) {
		if (!modelPath) return new Map();
	
		const fullPath  = this._norm('assets/' + modelPath);
		const container = fullPath.replace(/\/[^\/]*$/, '/');
		const matsDir   = container + 'materials/';
		const manifest  = matsDir + 'materials.index.json';
	
		const map = new Map();
		const mf  = this.zip.file(manifest);
		if (!mf) return map;
	
		try {
			const txt  = await mf.async('string');
			const json = JSON.parse(txt);
	
			const byName = json?.byName || {};
			for (const name of Object.keys(byName)) {
				const uuid = byName[name];
				if (!uuid) continue;
				// value is already our asset UUID
				map.set(name, uuid);
			}
		} catch (e) {
			console.warn('[MeshManager] Failed to read materials.index.json', e);
		}
	
		return map;
	}

	_stableKeyFor(node, sceneRoot) {
		const idxs = [];
		let n = node;
		while (n && n.parent && n !== sceneRoot) {
			const i = n.parent.children.indexOf(n);
			idxs.push(i < 0 ? 0 : i);
			n = n.parent;
		}
		idxs.reverse();
		return idxs.join('/') || '0';
	}

	_sanitizeName(raw, modelBase, key) {
		let name = (raw && raw.trim()) ? raw : `${modelBase}_${key}`;
		if (/^root$/i.test(name)) name = `Container`;
		return name.replace(/[^\w\-\.]+/g, '_');
	}

	_setLocalTRS(d3d, node) {
		const pos = node.position, quat = node.quaternion, scl = node.scale;
		const eul = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
		d3d.position = { x: pos.x, y: pos.y, z: pos.z };
		d3d.rotation = { x: eul.x, y: eul.y, z: eul.z };
		d3d.scale = { x: scl.x, y: scl.y, z: scl.z };
	}

	_applyShadows() {
		const root = this.d3dobject.object3d;
		if (!root) return;
		const cast = !!this.component.properties.castShadow;
		const recv = !!this.component.properties.receiveShadow;
		
		root.traverse(o => {
			if (o && (o.isMesh || o.isSkinnedMesh)) {
				o.castShadow = cast;
				o.receiveShadow = recv;
			}
		});
	}
	_applyAmbientOcclusion() {
		const ao = this.ambientOcclusion;
		if(!ao && this.aoEnabled) {
			this.d3dobject.enableLayer(2);
			this.d3dobject.disableLayer(0);
			this.aoEnabled = false;
		}else
		if(ao && !this.aoEnabled) {
			this.d3dobject.enableLayer(0);
			this.d3dobject.disableLayer(2);
			this.aoEnabled = true;
		}
	}
	
	_applyMorphTargets() {
		const root = this.d3dobject.modelScene || this.d3dobject.object3d;
		if (!root) return;
	
		const morphs = this.component.properties?.morphTargets || {};
		const keys = Object.keys(morphs);
		if (!keys.length) return;
	
		root.traverse(o => {
			if (!o || !(o.isMesh || o.isSkinnedMesh)) return;
	
			const dict = o.morphTargetDictionary;
			const inf  = o.morphTargetInfluences;
			if (!dict || !inf) return;
	
			for (let i = 0; i < keys.length; i++) {
				const k = keys[i];
				const idx = dict[k];
				if (idx === undefined) continue;
				inf[idx] = Number(morphs[k]) || 0;
			}
		});
	}

	// =====================================================
	// MAIN LIFECYCLE
	// =====================================================

	async updateComponent(force = false) {
		// ---------------- SubMesh ----------------
		if (this.isSubMesh) {
			const mesh = this.d3dobject.object3d;
			
			if (!mesh || !(mesh.isMesh || mesh.isSkinnedMesh)) return;
			
			const uuids = this.component.properties.materials;
			await this._applyMaterialsToThreeMesh(mesh, uuids);
			this._applyShadows();
			this._applyAmbientOcclusion();
			this.d3dobject.updateVisibility(true);
			
			// Instancing updates
			if(mesh.isMesh && (this.lastInstancingId != this.instancingId || this.lastInstancing != this.instancing)) {
				if(this.instancing && this.instancingId)
					_instancing.setInstanceDirty(this.instancingId, this);
				
				if(this.lastInstancing && this.lastInstancingId && this.lastInstancingId != this.instancingId)
					_instancing.removeFromInstance(this.lastInstancingId, this);
				
				if(this.instancing)
					this.d3dobject.visible3 = false;
				else
					this.d3dobject.visible3 = true;
				
				let p = this.d3dobject;
				while(p) {
					p.__flagInstancing = true;
					p = p.parent;
					if(p == this.d3dobject.root)
						break;
				}
				
				this.lastInstancingId = this.instancingId;
				this.lastInstancing = this.instancing;
			}
			
			return;
		}

		// ---------------- Main mesh ----------------
		const meshUUID = this.component.properties.mesh || null;
		const modelPath = meshUUID ? this.d3dobject.resolvePathNoAssets(meshUUID) : null;
		const modelBase = this._safeModelBase(modelPath);

		const needLoad = !!modelPath &&
			(
				!this.d3dobject.modelScene ||
				this.d3dobject._loadedMeshUUID !== meshUUID ||
				!this.d3dobject.modelScene.parent
			);

		let justLoaded = false;

		if (needLoad) {
			const zf = this.zip.file(this._norm('assets/' + modelPath));
			if (zf) {
				try {
					const { gltf, scene } = await importModelFromZip(this.zip, this._norm('assets/' + modelPath));
					scene.traverse(o => {
						o.matrixAutoUpdate = true;
						if (o.isSkinnedMesh) {
							o.frustumCulled = false;
							const mats = Array.isArray(o.material) ? o.material : [o.material];
							for (const m of mats) if (m && 'skinning' in m) m.skinning = true;
						}
					});
					if (this.d3dobject.modelScene && this.d3dobject.modelScene.parent)
						this.d3dobject.modelScene.parent.remove(this.d3dobject.modelScene);
					this.d3dobject.object3d.add(scene);
					this.d3dobject.modelScene = scene;
					this.d3dobject._loadedMeshUUID = meshUUID;
					justLoaded = true;
				} catch (e) {
					console.error('Failed to import model:', modelPath, e);
				}
			}
		}

		if (!this.d3dobject.modelScene) return;
		const sceneRoot = this.d3dobject.modelScene;

		// ---------------- Apply materials ----------------
		const meshLevel = this.component.properties?.materials;
		if (Array.isArray(meshLevel) && meshLevel.length > 0) {
			const host = this.d3dobject.object3d;
			const targets = [];
			if (host.isMesh || host.isSkinnedMesh) targets.push(host);
			else if (Array.isArray(host.children))
				for (const c of host.children)
					if (c && (c.isMesh || c.isSkinnedMesh)) targets.push(c);
			for (const t of targets)
				await this._applyMaterialsToThreeMesh(t, meshLevel);
		}

		// ---------------- Build GLTF hierarchy ----------------
		if (justLoaded) {
			const matNameToUUID = await this._buildMatMap(modelPath);
			
			const bindChildrenDirect = async (threeParent, d3dHost) => {
				for (const child of threeParent.children.slice()) {
					const rawName = child.name;
					if (!rawName)
						continue; // IMPORTANT: Skip the weird empty children because they link to the wrong things and mess everything up
					
					if (/^root$/i.test(rawName)) {
						await bindChildrenDirect(child, d3dHost);
						continue;
					}
					
					const key  = this._stableKeyFor(child, sceneRoot);
					const want = this._sanitizeName(rawName, modelBase, key);
					
					let d3dChild = d3dHost.find(want);
					
					if (!d3dChild) {
						// brand new auto wrapper
						d3dChild = await d3dHost.createObject({ name: want, components: [] });
						d3dChild.__auto_gltf = true;
						this._setLocalTRS(d3dChild, child);
					}
					
					child.matrixAutoUpdate = true;
					d3dChild.replaceObject3D(child);
			
					// ---------- SubMesh hookup (using ASSET uuids, not THREE uuids) ----------
					if (child.isMesh || child.isSkinnedMesh) {
						child.castShadow    = !!this.component.properties.castShadow;
						child.receiveShadow = !!this.component.properties.receiveShadow;
			
						// build an array of *asset* uuids from material names
						const mats = Array.isArray(child.material)
							? child.material
							: [child.material];
			
						const uuids = mats.map(m => {
							const nm = m && m.name;
							return nm ? (matNameToUUID.get(nm) || null) : null;
						});
			
						if (!d3dChild.hasComponent('SubMesh')) {
							d3dChild.addComponent(
								'SubMesh',
								{ materials: uuids },
								{ doUpdateAll: false }
							);
						}
					}
					
					// recurse
					await bindChildrenDirect(child, d3dChild);
				}
			};
			
			await bindChildrenDirect(sceneRoot, this.d3dobject);
			this.d3dobject.traverse(d3d => d3d.updateComponents());
		}

		// ---------------- Apply stuff ----------------
		this._applyShadows();
		this._applyAmbientOcclusion();
		this._applyMorphTargets();
		
		this.d3dobject.onMeshReady?.();
		this.d3dobject.root.onChildMeshReady?.(this.d3dobject);
		
		this.d3dobject.invokeEvent('meshReady');
		
		let p = this.d3dobject;
		while(p) {
			p.invokeEvent('onChildMeshReady', this.d3dobject);
			p = p.parent;
		}
		
		this.d3dobject.updateVisibility(true);
	}
	
	setMaterial(index, params) {
		if(!params)
			return;
			
		const props = this.component.properties;
		const mats = [...props.materials];
		
		mats[index] = params;
		props.materials = mats;
		
		this.d3dobject.updateComponents();
	}
	
	setMorph(name, value) {
		if(!name)
			return;
	
		const props = this.component.properties;
		const morphs = { ...(props.morphTargets || {}) };
	
		morphs[name] = Number(value) || 0;
		props.morphTargets = morphs;
	
		this._applyMorphTargets();
	}
	
	clearMorph(name) {
		if(!name)
			return;
	
		const props = this.component.properties;
		const morphs = { ...(props.morphTargets || {}) };
	
		delete morphs[name];
		props.morphTargets = morphs;
	
		this._applyMorphTargets();
	}
	
	getMorph(name) {
		if(!name)
			return null;
	
		const root = this.d3dobject.modelScene || this.d3dobject.object3d;
		if(!root)
			return null;
	
		let value = null;
	
		root.traverse(o => {
			if(value !== null)
				return;
	
			if(!o || !(o.isMesh || o.isSkinnedMesh))
				return;
	
			const dict = o.morphTargetDictionary;
			const inf  = o.morphTargetInfluences;
			if(!dict || !inf)
				return;
	
			const idx = dict[name];
			if(idx === undefined)
				return;
	
			const v = inf[idx];
			if(typeof v === 'number')
				value = v;
		});
	
		return value;
	}
	
	getMorphs() {
		const root = this.d3dobject.modelScene || this.d3dobject.object3d;
		if (!root) return [];
	
		const map = new Map();
	
		root.traverse(o => {
			if (!o || !(o.isMesh || o.isSkinnedMesh)) return;
	
			const dict = o.morphTargetDictionary;
			const inf  = o.morphTargetInfluences;
			if (!dict || !inf) return;
	
			for (const name in dict) {
				const idx = dict[name];
				if (idx === undefined) continue;
	
				if (!map.has(name)) {
					map.set(name, {
						name,
						value: typeof inf[idx] === 'number' ? inf[idx] : 0,
						min: 0,
						max: 1
					});
				}
			}
		});
	
		return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
	}
	
	getBones() {
		const root = this.d3dobject.modelScene || this.d3dobject.object3d;
		if(!root)
			throw new Error('MeshManager.getBones: no root');
	
		let bones = null;
	
		root.traverse(o => {
			if(bones)
				return;
	
			if(o && o.isSkinnedMesh && o.skeleton && Array.isArray(o.skeleton.bones)) {
				bones = o.skeleton.bones;
			}
		});
	
		if(!bones)
			throw new Error('MeshManager.getBones: no SkinnedMesh with skeleton found');
	
		return bones;
	}
	setBones(bones) {
		if(!Array.isArray(bones) || bones.length === 0)
			throw new Error('MeshManager.setBones: invalid bones array');
	
		const root = this.d3dobject.modelScene || this.d3dobject.object3d;
		if(!root)
			throw new Error('MeshManager.setBones: no root');
	
		let didAny = false;
	
		root.traverse(o => {
			if(!o || !o.isSkinnedMesh)
				return;
	
			const sk = o.skeleton;
			if(!sk)
				return;
	
			if(sk.bones.length !== bones.length)
				throw new Error(
					`MeshManager.setBones: bone count mismatch (${sk.bones.length} != ${bones.length})`
				);
	
			const boneInverses =
				Array.isArray(sk.boneInverses) && sk.boneInverses.length === bones.length
					? sk.boneInverses
					: null;
	
			const newSkeleton = new THREE.Skeleton(bones, boneInverses);
	
			o.bind(newSkeleton, o.bindMatrix);
	
			o.updateMatrixWorld(true);
			newSkeleton.update();
	
			didAny = true;
		});
	
		if(!didAny)
			throw new Error('MeshManager.setBones: no SkinnedMesh rebound');
	
		return true;
	}
	updateSkeleton(forceWorldUpdate = true) {
		const root = this.d3dobject.modelScene || this.d3dobject.object3d;
		if(!root)
			throw new Error('No root for updating skeleton from')
	
		let updated = false;
		
		// Make sure matrices are current before rebuilding palettes
		if(forceWorldUpdate)
			root.updateMatrixWorld(true);
	
		root.traverse(o => {
			if(!o || !o.isSkinnedMesh)
				return;
	
			// If bones were modified externally, rebuild the palette used for skinning
			
			if(o.skeleton?.update)
				o.skeleton.update();
	
			updated = true;
		});
	
		return updated;
	}
	
	dispose() {
		if(this.instancing && this.instancingId)
			_instancing.removeFromInstance(this.instancingId, this);
	}
	
	onEnabled() {
		this.d3dobject.visible2 = true;
	}
	onDisabled() {
		this.d3dobject.visible2 = false;
	}
}