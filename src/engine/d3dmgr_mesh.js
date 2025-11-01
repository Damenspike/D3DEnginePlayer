import { importModelFromZip } from './glb-instancer.js';

export default class MeshManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.zip = this.d3dobject.root.zip;
		this.isSubMesh = (this.component.type === 'SubMesh');
	}

	/* ---------- getters / setters for component.properties ---------- */

	get mesh() {
		return this.component.properties?.mesh;
	}
	set mesh(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.mesh = v;
	}

	get materials() {
		return this.component.properties?.materials;
	}
	set materials(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.materials = v;
	}

	/* ----------------- tiny shared helpers ----------------- */

	_norm(p) {
		return p ? p.replace(/\/+/g, '/').replace(/^\.\//, '') : p;
	}

	_safeModelBase(p) {
		if (!p) 
			return 'model';
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
		if (val == null) 
			return val;
		if (typeof val === 'number') 
			return val;
		const s = String(val).trim();
		if (!s) 
			return val;
		if (s.startsWith('#')) 
			return s;
		if (/^0x/i.test(s)) 
			return parseInt(s.slice(2), 16);
		if (/^[0-9a-fA-F]{6}$/.test(s)) 
			return parseInt(s, 16);
		if (/^\d+$/.test(s)) 
			return Number(s);
		return s;
	}

	async _readTextByUUID(uuid) {
		if (!uuid) 
			return null;
		const rel = this.d3dobject.resolvePathNoAssets(uuid);
		if (!rel) 
			return null;
		const zf = this.zip.file(this._norm('assets/' + rel));
		return zf ? await zf.async('string') : null;
	}

	async _loadTextureFromRel(relPath) {
		if (!relPath) 
			return null;
		const uuid = _root.resolveAssetId(this._norm(relPath));
		if (!uuid) 
			return null;
		const rel = this.d3dobject.resolvePathNoAssets(uuid);
		if (!rel) 
			return null;
		const zf = this.zip.file(this._norm('assets/' + rel));
		if (!zf) 
			return null;
		const buf = await zf.async('arraybuffer');
		const blob = new Blob([buf], { type: this._mimeFromExt(rel) });
		const bmp  = await createImageBitmap(blob);
		const tex  = new THREE.Texture(bmp);
		tex.needsUpdate = true;
		return tex;
	}

	async _setMapRel(mat, key, relPath, isColor = false) {
		if (!(key in mat)) 
			return;
		if (!relPath) {
			if (mat[key]) {
				try { mat[key].dispose?.(); } catch {}
				mat[key] = null;
				mat.needsUpdate = true;
			}
			return;
		}
		const tex = await this._loadTextureFromRel(relPath);
		if (!tex) 
			return;
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
			maps,
			doubleSided,
			mapOffset, mapRepeat,
			normalMapOffset, normalMapRepeat,
			...rest
		} = params;
		
		delete rest.mapOffset; 
		delete rest.mapRepeat;
		delete rest.normalMapOffset; 
		delete rest.normalMapRepeat;
		delete rest.doubleSided; 
		delete rest.maps;
		
		if (doubleSided === true) 
			rest.side = THREE.DoubleSide;
		
		if (type === 'MeshBasicMaterial') {
			delete rest.metalness;
			delete rest.roughness;
			delete rest.emissive;
			delete rest.emissiveIntensity;
			delete rest.envMapIntensity;
		}
		return { ctorParams: rest, pulled: { maps, mapOffset, mapRepeat, normalMapOffset, normalMapRepeat } };
	}

	async _buildMaterialFromMatUUID(uuid) {
		if (!uuid) 
			return null;
		const txt = await this._readTextByUUID(uuid);
		if (!txt) 
			return null;
		
		let params; 
		try { params = JSON.parse(txt); } catch { return null; }
		const type = params.type || 'MeshStandardMaterial';
		const Ctor = THREE[type];
		if (!Ctor) 
			return null;
		
		if ('color' in params) params.color = this._fixColor(params.color);
		if ('emissive' in params) params.emissive = this._fixColor(params.emissive);
		if (params.opacity !== undefined && params.opacity < 1 && params.transparent !== true) params.transparent = true;
		if (typeof params.side === 'string' && THREE[params.side] !== undefined) params.side = THREE[params.side];
		
		const { ctorParams, pulled } = this._stripIncompatible({ ...params }, type);
		const m = new Ctor(ctorParams);
		if ('toneMapped' in m) m.toneMapped = false;
		
		const maps = pulled.maps || {};
		await this._setMapRel(m, 'map',          maps.map,          true);
		await this._setMapRel(m, 'normalMap',    maps.normalMap);
		await this._setMapRel(m, 'roughnessMap', maps.roughnessMap);
		await this._setMapRel(m, 'metalnessMap', maps.metalnessMap);
		await this._setMapRel(m, 'emissiveMap',  maps.emissiveMap,  true);
		await this._setMapRel(m, 'aoMap',        maps.aoMap);
		await this._setMapRel(m, 'alphaMap',     maps.alphaMap);
		
		if (m.map) {
			const o = Array.isArray(pulled.mapOffset) ? pulled.mapOffset : [0, 0];
			const r = Array.isArray(pulled.mapRepeat) ? pulled.mapRepeat : [1, 1];
			m.map.offset.fromArray(o);
			m.map.repeat.fromArray(r);
		}
		if (m.normalMap) {
			const o = Array.isArray(pulled.normalMapOffset) ? pulled.normalMapOffset : [0, 0];
			const r = Array.isArray(pulled.normalMapRepeat) ? pulled.normalMapRepeat : [1, 1];
			m.normalMap.offset.fromArray(o);
			m.normalMap.repeat.fromArray(r);
		}
		m.needsUpdate = true;
		return m;
	}

	async _applyMaterialsToThreeMesh(threeMesh, matUUIDs) {
		const mats = await Promise.all((matUUIDs || []).map(id => this._buildMaterialFromMatUUID(id)));
		const groups = threeMesh.geometry?.groups ?? [];
		
		if (threeMesh.isSkinnedMesh) {
			for (const mm of mats) if (mm && 'skinning' in mm) mm.skinning = true;
			threeMesh.frustumCulled = false;
		}
		
		if (groups.length > 1) {
			const maxSlot = groups.reduce((m, g) => Math.max(m, (g.materialIndex ?? 0)), 0);
			const arr = new Array(Math.max(mats.length, maxSlot + 1));
			for (let i = 0; i < arr.length; i++) arr[i] = mats[i] ?? mats[mats.length - 1] ?? threeMesh.material ?? null;
			threeMesh.material = arr;
			arr.forEach(mm => mm && (mm.needsUpdate = true));
		} else {
			const m0 = mats[0] ?? threeMesh.material ?? null;
			if (m0) { threeMesh.material = m0; threeMesh.material.needsUpdate = true; }
		}
	}

	async _buildMatMap(modelPath) {
		if (!modelPath) 
			return new Map();
		const fullPath   = this._norm('assets/' + modelPath);
		const container  = fullPath.replace(/\/[^\/]*$/, '/');
		const matsDir    = container + 'materials/';
		const manifest   = matsDir + 'materials.index.json';
		
		const map = new Map();
		const mf  = this.zip.file(manifest);
		if (mf) {
			try {
				const txt = await mf.async('string');
				const json = JSON.parse(txt);
				if (json?.byName) {
					for (const k of Object.keys(json.byName)) {
						const rel = this._norm(json.byName[k]);
						const uuid = _root.resolveAssetId(rel);
						if (uuid) map.set(k, uuid);
					}
				}
			} catch {}
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
		if (/^root$/i.test(name))
			name = `Container`;
		return name.replace(/[^\w\-\.]+/g, '_');
	}

	_findByName(parent, name) {
		if (!Array.isArray(parent.children)) 
			return null;
		for (const c of parent.children) if (c.name === name) return c;
		return null;
	}

	_setLocalTRS(d3d, node) {
		const pos = node.position, quat = node.quaternion, scl = node.scale;
		const eul = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
		d3d.position = { x: pos.x, y: pos.y, z: pos.z };
		d3d.rotation = { x: eul.x, y: eul.y, z: eul.z };
		d3d.scale    = { x: scl.x, y: scl.y, z: scl.z };
	}

	/* ----------------- main lifecycle ----------------- */

	async updateComponent() {
		if (this.isSubMesh) {
			const node = this.d3dobject.object3d;
			if (!node || !(node.isMesh || node.isSkinnedMesh))
				return;
			
			const uuids = this.component.properties.materials;
			await this._applyMaterialsToThreeMesh(node, uuids);
			return;
		}
		
		const meshUUID  = this.component.properties.mesh || null;
		const modelPath = meshUUID ? this.d3dobject.resolvePathNoAssets(meshUUID) : null;
		const modelBase = this._safeModelBase(modelPath);
		
		const needLoad =
			!!modelPath &&
			(
				!this.d3dobject.modelScene ||
				this.d3dobject._loadedMeshUUID !== meshUUID ||
				!this.d3dobject.modelScene.parent
			);
		
		let justLoaded = false;
		
		if (needLoad) {
			const zf = this.zip.file(this._norm('assets/' + modelPath));
			if (!zf) {
				console.warn(`Model file not found: ${modelPath}`);
			} else {
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
		
		if (!this.d3dobject.modelScene)
			return;
		
		{
			const meshLevel = this.component.properties?.materials;
			if (Array.isArray(meshLevel) && meshLevel.length > 0) {
				const host = this.d3dobject.object3d;
				if (host) {
					const targets = [];
					if (host.isMesh || host.isSkinnedMesh) {
						targets.push(host);
					} else if (Array.isArray(host.children)) {
						for (const c of host.children) {
							if (c && (c.isMesh || c.isSkinnedMesh)) targets.push(c);
						}
					}
					for (const t of targets) {
						await this._applyMaterialsToThreeMesh(t, meshLevel);
					}
				}
			}
		}
		
		const sceneRoot = this.d3dobject.modelScene;
		
		if (justLoaded) {
			const matNameToUUID = await this._buildMatMap(modelPath);
			
			const bindChildrenDirect = async (threeParent, d3dHost) => {
				const tKids = threeParent.children.slice();
				
				for (const child of tKids) {
					const rawName = child.name || child.type || '';
					
					if (/^root$/i.test(rawName)) {
						await bindChildrenDirect(child, d3dHost);
						continue;
					}
					
					const key  = this._stableKeyFor(child, sceneRoot);
					const want = this._sanitizeName(rawName, modelBase, key);
					
					let d3dChild = this._findByName(d3dHost, want);
					if (!d3dChild) {
						d3dChild = await d3dHost.createObject({ name: want, components: [] });
						d3dChild.__auto_gltf = true;
						this._setLocalTRS(d3dChild, child);
					}
					
					child.matrixAutoUpdate = true;
					d3dChild.replaceObject3D(child);
					
					if (child.isMesh || child.isSkinnedMesh) {
						const hasSub = !!d3dChild.hasComponent('SubMesh');
						if (!hasSub) {
							const mats  = Array.isArray(child.material) ? child.material : [child.material];
							const uuids = mats.map(m => {
								const nm = m?.name || null;
								return (nm && matNameToUUID.has(nm)) ? matNameToUUID.get(nm) : null;
							});
							d3dChild.addComponent('SubMesh', { materials: uuids }, false);
						}
					}
					
					await bindChildrenDirect(child, d3dChild);
				}
			};
			
			await bindChildrenDirect(sceneRoot, this.d3dobject);
			this.d3dobject.traverse(d3d => d3d.updateComponents());
		}
	}

	async dispose() {
		if (Array.isArray(this.d3dobject.children)) {
			for (const child of [...this.d3dobject.children]) {
				if (!child || child.__auto_gltf !== true) 
					continue;
	
				try {
					if (child.hasComponent && child.hasComponent('SubMesh')) {
						child.removeComponent('SubMesh');
					}
				} catch {}
	
				try {
					if (typeof this.d3dobject.deleteChild === 'function') {
						await this.d3dobject.deleteChild(child);
					} else if (typeof this.d3dobject.removeChild === 'function') {
						this.d3dobject.removeChild(child);
					} else {
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
					if (!(o && (o.isMesh || o.isSkinnedMesh))) 
						return;
	
					try { o.geometry?.dispose?.(); } catch {}
	
					const mats = Array.isArray(o.material) ? o.material : [o.material];
					for (const m of mats) {
						if (!m) 
							continue;
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
}