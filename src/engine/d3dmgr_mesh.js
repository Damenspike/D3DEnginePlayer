import { importModelFromZip } from './glb-instancer.js';
import { fileName } from './d3dutility.js';

export default class MeshManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.zip = this.d3dobject.root.zip;
		this.isSubMesh = (this.component.type === 'SubMesh');
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
	
	get morphTargets() {
		return this.component.properties?.morphTargets || {};
	}
	set morphTargets(v) {
		this.component.properties.morphTargets = v || {};
		this._applyMorphTargets();
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

	async _readTextByUUID(uuid) {
		if (!uuid) return null;
		const rel = this.d3dobject.resolvePathNoAssets(uuid);
		if (!rel) return null;
		const zf = this.zip.file(this._norm('assets/' + rel));
		return zf ? await zf.async('string') : null;
	}

	async _loadTexture(uuid) {
		if (!uuid) return null;
		const rel = this.d3dobject.resolvePathNoAssets(uuid);
		if (!rel) return null;
		const zf = this.zip.file(this._norm('assets/' + rel));
		if (!zf) return null;
		const buf = await zf.async('arraybuffer');
		const blob = new Blob([buf], { type: this._mimeFromExt(rel) });
		const bmp  = await createImageBitmap(blob);
		const tex  = new THREE.Texture(bmp);
		tex.needsUpdate = true;
		return tex;
	}

	async _setMapRel(mat, key, uuid, isColor = false) {
		if (!(key in mat)) return;

		if (!uuid) {
			if (mat[key]) {
				try { mat[key].dispose?.(); } catch {}
				mat[key] = null;
				mat.needsUpdate = true;
			}
			return;
		}

		const tex = await this._loadTexture(uuid);
		if (!tex) return;

		tex.flipY = false;
		if (isColor) {
			if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
			else tex.encoding = THREE.sRGBEncoding;
		}
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		mat[key] = tex;
		mat.needsUpdate = true;
	}

	_stripIncompatible(params, type) {
		const {
			maps, doubleSided,
			mapOffset, mapRepeat,
			normalMapOffset, normalMapRepeat,
			map, normalMap, roughnessMap, metalnessMap, emissiveMap, aoMap, alphaMap,
			...rest
		} = params;

		delete rest.mapOffset; delete rest.mapRepeat;
		delete rest.normalMapOffset; delete rest.normalMapRepeat;
		delete rest.doubleSided; delete rest.maps;
		delete rest.map; delete rest.normalMap;
		delete rest.roughnessMap; delete rest.metalnessMap;
		delete rest.emissiveMap; delete rest.aoMap; delete rest.alphaMap;

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
			pulled: { maps: mergedMaps, mapOffset, mapRepeat, normalMapOffset, normalMapRepeat }
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
	
		m.needsUpdate = true;
		return m;
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
			mesh.frustumCulled = false;
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

	async updateComponent() {
		// ---------------- SubMesh ----------------
		if (this.isSubMesh) {
			const node = this.d3dobject.object3d;
			if (!node || !(node.isMesh || node.isSkinnedMesh)) return;
			const uuids = this.component.properties.materials;
			await this._applyMaterialsToThreeMesh(node, uuids);
			this._applyShadows();
			this.d3dobject.updateVisibility(true);
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
		this._applyMorphTargets();
		
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

	// =====================================================
	// DISPOSE
	// =====================================================

	async dispose() {
		if (Array.isArray(this.d3dobject.children)) {
			for (const child of [...this.d3dobject.children]) {
				if (!child || child.__auto_gltf !== true) continue;
				try { if (child.hasComponent && child.hasComponent('SubMesh')) child.removeComponent('SubMesh'); } catch {}
				try {
					if (typeof this.d3dobject.deleteChild === 'function') await this.d3dobject.deleteChild(child);
					else if (typeof this.d3dobject.removeChild === 'function') this.d3dobject.removeChild(child);
					else {
						const i = this.d3dobject.children.indexOf(child);
						if (i !== -1) this.d3dobject.children.splice(i, 1);
					}
				} catch {}
			}
		}

		const scene = this.d3dobject.modelScene;
		if (scene) {
			try { if (scene.parent) scene.parent.remove(scene); } catch {}
			try {
				scene.traverse(o => {
					if (!(o && (o.isMesh || o.isSkinnedMesh))) return;
					try { o.geometry?.dispose?.(); } catch {}
					const mats = Array.isArray(o.material) ? o.material : [o.material];
					for (const m of mats) {
						if (!m) continue;
						try {
							for (const k in m) {
								const v = m[k];
								if (v && v.isTexture) { try { v.dispose?.(); } catch {} }
							}
							m.dispose?.();
						} catch {}
					}
				});
			} catch {}
			this.d3dobject.modelScene = null;
			this.d3dobject._loadedMeshUUID = null;
		}

		if (this.d3dobject.object3d) {
			const host = this.d3dobject.object3d;
			for (let i = host.children.length - 1; i >= 0; i--) {
				const o = host.children[i];
				if (o && (o.isGroup || o.isMesh || o.isSkinnedMesh)) host.remove(o);
			}
		}
	}
	
	onEnabled() {
		this.d3dobject.visible2 = true;
	}
	onDisabled() {
		this.d3dobject.visible2 = false;
	}
}