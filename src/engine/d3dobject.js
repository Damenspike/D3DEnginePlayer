// d3dobject.js
import axios from 'axios';
import JSZip from 'jszip';
import DamenScript from './damenscript.js';
import D3DComponents from './d3dcomponents.js';
import { v4 as uuidv4 } from 'uuid';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
	getExtension
} from './d3dutility.js';
const { path } = D3D;

const protectedNames = [
	'_root', 'Input', 'position', 'rotation', 'scale', 'name', 'parent', 'children', 'threeObj', 'scenes', 'zip', 'forward', 'right', 'up', 'quaternion', 'beforeRenderFrame', 'onAddedToScene', 'manifest', 'scenes', '__origin'
]

export default class D3DObject {
	constructor(name = 'object', parent = null) {
		if (!window._root) 
			window._root = this;
		
		if(!_root.__symbols)
			_root.__symbols = {}; // initialise symbol store on _root
		
		// Must come first
		this.scenes = [];
		this.components = [];
		this.children = [];
		
		this.uuid = _root != this ? uuidv4() : '';
		this.suuid = uuidv4();
		this.parent = parent; // D3DObject or null for root
		this.name = name;
		
		this.object3d = this.parent ? new THREE.Object3D() : new THREE.Scene();
		this.object3d.userData.d3dobject = this;
		
		this.setupDefaultMethods();
	}
	
	///////////////////////////////
	// Getters and setters only
	///////////////////////////////
	get name() {
		return this._name;
	}
	set name(value) {
		if(!this.isValidName(value))
			throw new Error(`Invalid name ${value} for object`);
		
		if(this == _root && this.name == '_root')
			throw new Error('Can not rename root');
			
		if(!this.isValidName(value))
			value = `object${(parent?.children?.length ?? Math.floor(Math.random() * 10000000000))}`;
		
		if(protectedNames.includes(value) && _root != this)
			value += '_unsafe';
		
		const baseName = value.replace(/_\d+$/, '');
		let copyNum = 2;
		let newName = value;
		while(this.parent && this.parent[newName] && this.parent[newName] !== this) {
			newName = `${baseName}_${copyNum}`;
			copyNum++;
		}
		value = newName;
		
		const oldName = this._name;
		
		this._name = value;
		
		if(this.parent) {
			delete this.parent[oldName];
			this.parent[this._name] = this;
		}
		
		this.checkSymbols();
	}
	
	get worldPosition() {
		return this.object3d.getWorldPosition(new THREE.Vector3());
	}
	set worldPosition({ x, y, z }) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
		
		// ensure ancestors are up to date
		if (this.parent)
			this.parent.object3d.updateWorldMatrix(true, false);
			
		const targetW = new THREE.Vector3(x, y, z);
		if (this.parent)
			this.parent.object3d.worldToLocal(targetW);
		
		this.object3d.position.copy(targetW);
		this.object3d.updateMatrixWorld(true);
	}
	
	get position() {
		return this.object3d.position;
	}
	set position({x, y, z}) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
		this.object3d.position.set(x, y, z);
	}
	
	get rotation() {
		return this.object3d.rotation;
	}
	set rotation({x, y, z}) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
		this.object3d.rotation.set(x, y, z);
	}
	
	get quaternion() {
		return this.object3d.quaternion;
	}
	set quaternion({x, y, z}) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
		this.object3d.quaternion.set(x, y, z);
	}
	
	get scale() {
		return this.object3d.scale;
	}
	set scale({x, y, z}) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
		this.object3d.scale.set(x, y, z);
	}
	
	get visible() {
		return this.object3d.visible;
	}
	set visible(value) {
		this.object3d.visible = !!value;
		this.onVisibilityChanged?.();
		this._onVisibilityChanged?.();
		this.checkSymbols();
	}
	
	get __visible() {
		return this.object3d.visible;
	}
	set __visible(value) {
		if(!window._editor)
			return;
		
		this.object3d.visible = !!value;
		// Editor use only
	}
	
	get opacity() {
		let value = 1;
	
		function findOpacity(o) {
			if (o.material) {
				if (Array.isArray(o.material)) {
					// just take the first non-null material
					for (let m of o.material) {
						if (m) {
							value = m.opacity;
							return true; // stop search
						}
					}
				} else {
					value = o.material.opacity;
					return true;
				}
			}
			if (o.children && o.children.length) {
				for (let child of o.children) {
					if (findOpacity(child)) return true;
				}
			}
			return false;
		}
	
		findOpacity(this.object3d);
		return value;
	}
	set opacity(value) {
		const opacity = Math.max(0, Math.min(1, Number(value)));
		
		function applyOpacity(o) {
			if (o.material) {
				if (Array.isArray(o.material)) {
					o.material.forEach(m => {
						m.transparent = opacity < 1;
						m.opacity = opacity;
						m.needsUpdate = true;
					});
				} else {
					o.material.transparent = opacity < 1;
					o.material.opacity = opacity;
					o.material.needsUpdate = true;
				}
			}
			if (o.children && o.children.length) o.children.forEach(applyOpacity);
		}
		
		applyOpacity(this.object3d);
		this.checkSymbols();
	}
	
	///////////////////////////////
	// Getters only
	///////////////////////////////
	get root() {
		// root of this object only
		let r = this;
		while(r && !r.manifest)
			r = r.parent;
		return r;
	}
	get symbol() {
		if(!this.symbolId)
			return;
		
		return _root.__symbols[this.symbolId];
	}
	get forward() {
		const fwd = THREE.Vector3.forward.clone();
		fwd.applyQuaternion(this.quaternion);
		return fwd;
	}
	get right() {
		const right = THREE.Vector3.right.clone();
		right.applyQuaternion(this.quaternion);
		return right;
	}
	get up() {
		const up = THREE.Vector3.up.clone();
		up.applyQuaternion(this.quaternion);
		return up;
	}
	get quaternion() {
		return this.object3d.quaternion;
	}
	
	setupDefaultMethods() {
		if(window._editor) {
			this.__beforeEditorRenderFrame = () => {
				if(!this.lastMatrixWorld) {
					this.lastMatrixWorld = new THREE.Matrix4().copy(this.object3d.matrixWorld);
					return;
				}
				
				if(!this.object3d.matrixWorld.equals(this.lastMatrixWorld)) {
					this.__onTransformationChange();
					this.onTransformationChange?.();
					_editor.updateInspector?.();
				}
				
				this.lastMatrixWorld = new THREE.Matrix4().copy(this.object3d.matrixWorld);
				
				if(this.__finishedSyncing) {
					this.__syncing = false;
					this.__finishedSyncing = false;
				}
				if(this.symbol && this.__dirtySymbol && !this.__syncing) {
					this.syncToSymbol();
					this.__dirtySymbol = false;
				}
			}
			this.__onTransformationChange = () => {
				this.checkSymbols();
			}
		}
	}
	
	async createObject(objData, executeScripts = true) {
		if(!objData) {
			throw new Error('No object data provided to create object from!');
		}
		if(objData.symbolId) {
			// Load objData from symbol instead
			const symbol = _root.__symbols[objData.symbolId];
			
			if(!symbol) {
				throw new Error(`Symbol doesn't exist ${objData.symbolId}`)
			}
			if(!symbol.objData) {
				throw new Error(`Symbol data is missing ${objData.symbolId}`)
			}
			
			objData.children = symbol.objData.children;
			objData.components = symbol.objData.components;
			objData.suuid = symbol.objData.suuid;
			
			/*
				Override-able properties
			*/
			if(!objData.name)
				objData.name = symbol.objData.name;
			
			if(!objData.position)
				objData.position = symbol.objData.position;
				
			if(!objData.rotation)
				objData.rotation = symbol.objData.rotation;
				
			if(!objData.scale)
				objData.scale = symbol.objData.scale;
				
			if(!objData.visible)
				objData.visible = symbol.objData.visible;
			
			if(!objData.opacity)
				objData.opacity = symbol.objData.opacity;
		}
		
		const child = new D3DObject(objData.name, this);
		
		child.objData = objData;
		child.zip = this.zip;
		child.position = objData.position;
		child.rotation = objData.rotation;
		child.scale = objData.scale;
		child.editorOnly = !!objData.editorOnly || false;
		child.editorAlwaysVisible = !!objData.editorAlwaysVisible || false;
		child.components = objData.components || [];
		
		// Assign symbol ID
		if(objData.symbolId)
			child.symbolId = objData.symbolId;
		
		////////////////////////
		// ----- UUID ----- //
		////////////////////////
		
		// Nominal uuid
		let uuid = objData.uuid;
		
		// Ensure uuid is unique
		if(_root.superIndex?.[uuid])
			uuid = null;
		
		// Assign truly unique uuid
		child.uuid = uuid ?? child.uuid;
		
		// Assign SUUID
		child.suuid = objData.suuid ?? child.suuid;
		
		////////////////////////
		// ----- UUID ----- //
		////////////////////////
		
		if(objData.engineScript)
			child.engineScript = objData.engineScript;
		
		if(_root) {
			if(!_root.superIndex)
				_root.superIndex = {};
				
			_root.superIndex[child.uuid] = child;
		}
		
		// Handle all child components
		await child.updateComponents();
		
		this.object3d.add(child.object3d);
		this.children.push(child);
		
		child.visible = true; // invoke visibility events
		
		// Recurse for nested objects if any
		if (objData.children && objData.children.length > 0) {
			await child.buildScene({ 
				objects: objData.children
			});
		}
			
		if(executeScripts)
			await child.executeScripts();
			
		if(window._editor)
			_editor.updateInspector();
		
		await this.checkSymbols();
		
		return child;
	}
	
	async load(uri) {
		let buffer;
		
		this.__origin = uri;
		
		if (uri.startsWith('http://') || uri.startsWith('https://')) {
			// Remote URL
			console.log('Fetching remote .d3d from URL...');
			const response = await axios.get(uri, { responseType: 'arraybuffer' });
			buffer = Buffer.from(response.data);
		} else {
			// Local file
			console.log('Reading local .d3d file...');
			buffer = await D3D.readFile(uri);
		}
		
		if(buffer) {
			// Pass buffer to your next step
			await this.loadFromZip(buffer);
			
			console.log('File loaded, size:', buffer.length, 'bytes');
		}
		
		return buffer;
	}
	
	async loadFromZip(buffer) {
		// No need for await import, using required modules
		const zip = await new JSZip().loadAsync(buffer);
		this.zip = zip;
		
		// Parse manifest.json for metadata
		const manifestStr = await zip.file('manifest.json')?.async('string');
		if (!manifestStr) {
			throw new Error('manifest.json not found in .d3d file');
		}
		this.manifest = JSON.parse(manifestStr);
		console.log('Manifest loaded:', this.manifest);
	
		// Configure Electron window based on manifest only for root
		if (this === _root) {
			D3D.updateWindow({
				width: this.manifest.width,
				height: this.manifest.height,
				title: this.manifest.name
			});
		}
		
		// Find all the symbols and store them
		await this.updateSymbolStore();

		// Parse scenes.json for scene graph
		const scenesStr = await zip.file('scenes.json')?.async('string');
		if (!scenesStr) {
			throw new Error('scenes.json not found in .d3d file');
		}
		this.scenes = JSON.parse(scenesStr);
		
		// The starting scene
		const startScene = this.scenes[this.manifest.startScene];
		
		await this.loadScene(startScene);
	}
	
	async loadScene(scene) {
		this.root.scene = scene;
		await this.buildScene(scene);
	}
	
	async buildScene(scene) {
		if (!scene || !scene.objects) {
			console.warn('Invalid scene data or no objects found');
			return;
		}
	
		const objects = [...scene.objects];
		
		// Create all objects
		for (const objData of objects) {
			await this.createObject(objData, false);
		}
		
		// When building scene, wait for all objects to be made first, then execute scripts
		await this.executeScripts();
	}
	
	async executeScripts() {
		let script;
		let scriptName = path.join('scripts', `object_${this.name}_${this.uuid}.js`);
		
		if(this.engineScript) {
			const url = new URL(`/engine/${this.engineScript}`, window.location.origin);
			const res = await fetch(url.toString());
			if (!res.ok) 
				throw new Error(`Failed to fetch engine script ${filename}: ${res.status}`);
			script = await res.text();
			scriptName = this.engineScript;
		}else{
			script = await this.zip.file(scriptName)?.async('string');
		}
		
		try {
			if (script && (!window._editor || this.editorOnly)) {
				this.runInSandbox(script);
				console.log(`${scriptName} executed in DamenScript sandbox`);
			}
		}catch(e) {
			console.error(e);
			// send this to editor console too at some point
		}
		
		if (this.children && this.children.length > 0) {
			for (const child of this.children) {
				await child.executeScripts();
			}
		}
	}
	runInSandbox(script) {
		const sandbox = {
			_root,
			_input,
			_time,
			_editor,
			self: this,
			console: {
				log: (...args) => console.log(`[${this.name}]`, ...args),
				warn: (...args) => console.warn(`[${this.name}]`, ...args),
				error: (...args) => console.error(`[${this.name}]`, ...args),
				assert: (...args) => console.assert(...args)
			},
			Vector3: (...args) => new THREE.Vector3(...args),
			Quaternion: (...args) => new THREE.Quaternion(...args),
			Box3: (...args) => new THREE.Box3(...args),
			MathUtils: THREE.MathUtils
		};
		
		DamenScript.run(script, sandbox);
	}
	async updateComponents() {
		const components = [...this.components];
		
		if(_editor && !this.editorOnly) {
			// Add any gizmo related mesh components
			components.forEach(component => {
				const schema = D3DComponents[component.type];
				const gizmo3d = schema.fields.gizmo3d;
				
				if(gizmo3d) {
					components.push({
						type: 'Mesh',
						properties: {
							'mesh': gizmo3d.mesh,
							'materials': gizmo3d.materials
						}
					});
				}
			})
		}
		
		for (const component of components) {
			switch (component.type) {
				case 'HTML': {
					if(!component.properties.source)
						break;
					
					const elementId = `plate-html-${this.name}`; // no # in id
					const htmlSource = path.join('assets', component.properties.source);
					const htmlContent = await this.zip.file(htmlSource)?.async('string') ?? '';
					
					// Remove old container if exists
					let htmlContainer = document.getElementById(elementId);
					if (htmlContainer) htmlContainer.remove();
					
					// Create new container
					htmlContainer = document.createElement('div');
					htmlContainer.id = elementId;
					htmlContainer.classList.add('container', 'container--ui');
					htmlContainer.innerHTML = htmlContent;
					
					// Assign reference
					this.htmlContainer = htmlContainer;
					
					if(!window._editor) {
						// Append to 3D container or defer
						if (!_container3d) {
							this._onStart = () => {
								const container3dDeferred = document.getElementById('game-container');
								container3dDeferred.appendthis(htmlContainer);
							}
						} else {
							_container3d.appendthis(htmlContainer);
						}
						
						// Visibility toggle
						this._onVisibilityChanged = () => {
							this.htmlContainer.style.display = this.visible ? 'block' : 'none';
						}
					}
					break;
				}
				case 'Camera': {
					if(!this.cameraSetup) {
						const camera = new THREE.PerspectiveCamera(
							component.properties.fieldOfView || 75, 
							_root.manifest.width / _root.manifest.height,
							component.properties.clipNear || 0.1, 
							component.properties.clipFar || 1000
						);
						
						camera.position.set(
							this.position.x,
							this.position.y,
							this.position.z
						);
						camera.rotation.set(
							this.rotation.x,
							this.rotation.y,
							this.rotation.z
						);
						camera.scale.set(
							this.scale.x,
							this.scale.y,
							this.scale.z
						);
						
						this.replaceObject3D(camera);
						this.cameraSetup = true;
					}else{
						const camera = this.object3d;
						
						camera.fieldOfView = component.properties.fieldOfView;
						camera.clipNear = component.properties.clipNear;
						camera.clipFar = component.properties.clipFar;
					}
					
					break;
				}
				case 'AmbientLight': {
					if(!this.light) {
						const light = new THREE.AmbientLight(
							parseInt(component.properties.color, 16),
							component.properties.intensity
						);
						this.isLight = true;
						this.replaceObject3D(light);
					}else{
						const light = this.object3d;
						light.color = parseInt(component.properties.color || '0xffffff', 16);
						light.intensity = component.properties.intensity;
					}
					break;
				}
				case 'DirectionalLight': {
					if(!this.light) {
						const light = new THREE.DirectionalLight(
							parseInt(component.properties.color, 16),
							component.properties.intensity
						);
						this.isLight = true;
						this.replaceObject3D(light);
					}else{
						const light = this.object3d;
						light.color.set(Number(component.properties.color));
						light.intensity = component.properties.intensity;
					}
					break;
				}
				case 'Mesh': {
					if (component.properties.mesh) {
						const modelPath = path.join('assets', component.properties.mesh);
						const modelData = await _root.zip.file(modelPath)?.async('arraybuffer');
						if (!modelData) {
							console.warn(`Model file not found: ${modelPath}`);
						} else {
							const loader = new GLTFLoader();
							const gltf = await loader.parseAsync(modelData, '');
					
							// remove previous model root BEFORE adding the new one
							if (this.modelScene && this.modelScene.parent) {
								this.modelScene.parent.remove(this.modelScene);
							}
					
							this.object3d.add(gltf.scene);
							this.modelScene = gltf.scene;
						}
					}
					if (component.properties.materials && component.properties.materials.length > 0 && this.modelScene) {
						const matPaths = component.properties.materials.map(p => path.join('assets', p));
						const matJsons = await Promise.all(matPaths.map(p => this.zip.file(p)?.async('string')));
					
						const materials = matJsons.map((matStr, i) => {
							if (!matStr) {
								console.warn(`Material file not found: ${matPaths[i]}`);
								return null;
							}
							const params = JSON.parse(matStr);
					
							const Ctor = THREE[params.type];
							if (!Ctor) {
								console.warn(`Unknown material type: ${params.type}`);
								return null;
							}
					
							// make transparency actually work if opacity < 1
							if (params.opacity !== undefined && params.opacity < 1 && params.transparent !== true) {
								params.transparent = true;
							}
							const m = new Ctor(params);
					
							// helpful for gizmos / UI materials so they don't get greyed by post/ACES
							if ('toneMapped' in m) m.toneMapped = false;
					
							m.needsUpdate = true;
							return m;
						});
					
						const root = this.modelScene; // always apply under the GLTF root
					
						root.traverse(n => {
							if (!n.isMesh) return;
					
							const groups = n.geometry?.groups ?? [];
					
							// Multi-submesh (indexed by geometry.groups[*].materialIndex)
							if (groups.length > 1) {
								const maxIdx = groups.reduce((m, g) => Math.max(m, g.materialIndex ?? 0), 0);
					
								// Start from existing materials so we don't nuke ones you didn't supply
								const current = Array.isArray(n.material) ? n.material : [n.material];
								const arr = new Array(Math.max(current.length, maxIdx + 1));
					
								for (let i = 0; i < arr.length; i++) {
									arr[i] = materials[i] ?? current[i] ?? current[0] ?? materials[0] ?? current[0] ?? null;
								}
					
								n.material = arr;
								arr.forEach(m => m && (m.needsUpdate = true));
								return;
							}
					
							// Single-submesh → use first provided material if present
							if (materials[0]) {
								n.material = materials[0];
								n.material.needsUpdate = true;
							}
						});
					}
					break;
				}
				default:
					console.warn(`Unknown component type: ${component.type}`);
			}
		}
	}
	
	async updateSymbolStore() {
		const zip = this.zip;
		const promises = [];
	
		zip.forEach((rel, file) => {
			const ext = getExtension(rel);
			
			if(ext != 'd3dsymbol') 
				return;
			
			const p = file.async('string').then(serializedData => {
				try {
					const symbolData = JSON.parse(serializedData);
					const symbolId = symbolData.symbolId;
					
					if (!symbolId || typeof symbolId !== 'string') {
						console.warn('Invalid symbolId in', rel);
						return;
					}
					
					const symbol = { symbolId, file, objData: symbolData };
					
					if(!_root.__symbols[symbolId])
						_root.__symbols[symbolId] = symbol;
					else
						Object.assign(_root.__symbols[symbolId], symbol);
				} catch(e) {
					console.warn('Failed to parse', rel, e);
				}
			});
			
			promises.push(p);
		});
	
		await Promise.all(promises);
	}
	
	checkSymbols() {
		if(!window._editor)
			return;
		
		if(this.__syncing)
			return;
		
		const treeSymbolUpdate = (d3dobject) => {
			if(d3dobject.symbol)
				d3dobject.updateSymbol();
			
			if(d3dobject.parent)
				treeSymbolUpdate(d3dobject.parent);
		}
		treeSymbolUpdate(this);
	}
	
	updateSymbol() {
		const symbol = this.symbol;
		
		if(!symbol) {
			console.error('No symbol');
			return;
		}
		
		symbol.objData = this.getSerializableObject();
		
		for(let i in _root.superIndex) {
			const d3dobject = _root.superIndex[i];
			
			if(d3dobject != this && d3dobject.symbol == symbol)
				d3dobject.__dirtySymbol = true;
		}
	}
	
	async syncToSymbol() {
		const symbol = this.symbol;
		
		if(!symbol) {
			console.error("Can't sync to symbol because there is no symbol");
			return;
		}
		
		const syncWithObjData = async (d3dobject, objData, syncTransform = false, updateChildren = true) => {
			d3dobject.__syncing = true;
			
			if(syncTransform) {
				d3dobject.position.x = objData.position.x;
				d3dobject.position.y = objData.position.y;
				d3dobject.position.z = objData.position.z;
				
				d3dobject.rotation.x = objData.rotation.x;
				d3dobject.rotation.y = objData.rotation.y;
				d3dobject.rotation.z = objData.rotation.z;
				
				d3dobject.scale.x = objData.scale.x;
				d3dobject.scale.y = objData.scale.y;
				d3dobject.scale.z = objData.scale.z;
				
				d3dobject.opacity = objData.opacity;
				d3dobject.visible = objData.visible;
			}
			
			d3dobject.components = structuredClone(objData.components);
			
			if(updateChildren) {
				const childrenSynced = [];
				
				for(let i in objData.children) {
					const schild = objData.children[i];
					let child = d3dobject.children.find(c => c.suuid == schild.suuid);
					
					if(!child)
						child = await d3dobject.createObject(schild);
					
					// Sync names
					if(child.name != schild.name)
						child.name = schild.name;
						
					// Sync symbol status
					if(child.symbolId != schild.symbolId)
						child.symbolId = schild.symbolId;
					
					childrenSynced.push(child);
					
					// will be handled via its own updateSymbol route
					const shouldUpdateNextChildren = !child.symbol;
					const shouldUpdateNextTransform = true;
					
					await syncWithObjData(
						child, schild,
						shouldUpdateNextTransform,
						shouldUpdateNextChildren
					); 
				}
				
				const childrenToCheck = [...d3dobject.children];
				
				childrenToCheck.forEach(child => {
					if(!childrenSynced.includes(child)) {
						// Must no longer be needed
						child.delete();
					}
				})
			}
			
			d3dobject.__finishedSyncing = true;
		}
		
		await syncWithObjData(this, symbol.objData);
	}
	
	setParent(d3dobject) {
		this.parent = d3dobject;
		d3dobject.object3d.add(this.object3d);
	}
	
	replaceObject3D(newObject3D, { keepChildren = true } = {}) {
		const old = this.object3d;
		if (!old || old === newObject3D) return;
	
		// --- cache LOCAL transform (relative to parent) ---
		const pos = old.position.clone();
		const quat = old.quaternion.clone();
		const scl = old.scale.clone();
	
		// --- keep scene graph context ---
		const parent = old.parent || null;
		const oldIndex = parent ? parent.children.indexOf(old) : -1;
	
		// --- carry over useful flags/state ---
		newObject3D.name = old.name; // so getObjectByName still works
		newObject3D.visible = old.visible;
		newObject3D.matrixAutoUpdate = old.matrixAutoUpdate;
		newObject3D.renderOrder = old.renderOrder;
		newObject3D.frustumCulled = old.frustumCulled;
		newObject3D.castShadow = old.castShadow ?? newObject3D.castShadow;
		newObject3D.receiveShadow = old.receiveShadow ?? newObject3D.receiveShadow;
	
		// copy layers bitmask
		for (let i = 0; i < 32; i++) {
			if (old.layers.isEnabled(i)) newObject3D.layers.enable(i);
			else newObject3D.layers.disable(i);
		}
	
		// --- move children if desired ---
		if (keepChildren && old.children.length) {
			// clone array to avoid mutation during iteration
			for (const child of [...old.children]) newObject3D.add(child);
		}
	
		// --- set local transform (relative to SAME parent) ---
		newObject3D.position.copy(pos);
		newObject3D.quaternion.copy(quat);
		newObject3D.scale.copy(scl);
	
		// --- reparent into the same spot in the tree ---
		if (parent) {
			parent.remove(old);          // detach old
			parent.add(newObject3D);     // attach new
	
			// restore original sibling order
			if (oldIndex >= 0) {
				const arr = parent.children;
				const cur = arr.indexOf(newObject3D);
				if (cur !== -1 && cur !== oldIndex) {
					// move newObject3D to oldIndex
					arr.splice(cur, 1);
					arr.splice(oldIndex, 0, newObject3D);
				}
			}
		}
	
		// --- wire back to D3D ---
		this.object3d = newObject3D;
		this.object3d.userData.d3dobject = this;
	
		// --- ensure matrices are coherent for anything that reads this frame ---
		this.object3d.updateMatrixWorld(true);
	}
	
	serialize() {
		return JSON.stringify(this.getSerializableObject());
	}
	
	getSerializableObject() {
		const obj = {
			uuid: this.uuid,
			suuid: this.suuid,
			name: this.name,
			position: {
				x: this.position.x, 
				y: this.position.y, 
				z: this.position.z
			},
			rotation: {
				x: this.rotation.x,
				y: this.rotation.y,
				z: this.rotation.z
			},
			scale: {
				x: this.scale.x,
				y: this.scale.y,
				z: this.scale.z
			},
			opacity: this.opacity,
			visible: this.visible,
			components: this.components.map(component => ({
				type: component.type,
				properties: component.properties
			})),
			children: this.children.map(child => child.getSerializableObject())
		}
		
		if(this.symbolId)
			obj.symbolId = this.symbolId;
		
		return obj;
	}
	
	find(name) {
		return this.children.find(child => child.name == name);
	}
	
	delete() {
		if(this.parent == null)
			throw new Error("Can't delete _root");
		
		const idx = this.parent.children.indexOf(this);
		
		if(idx < 0)
			throw new Error("Parent doesn't contain child?");
			
		this.parent.children.splice(idx, 1);
		this.parent.object3d.remove(this.object3d);
		
		delete this.parent[this.name];
		delete _root.superIndex[this.uuid];
		
		this.checkSymbols();
	}
	
	isValidName(str) {
		return /^[A-Za-z0-9 _-]+$/.test(str);
	}
	isNameAllowed(str) {
		return !protectedNames.includes(str) && this.isValidName(str);
	}
}