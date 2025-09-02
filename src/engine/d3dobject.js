// d3dobject.js
import axios from 'axios';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
	getExtension
} from './d3dutility.js';
const protectedNames = [
	'_root', 'Input', 'position', 'rotation', 'scale', 'name', 'parent', 'children', 'threeObj', 'scenes', 'zip', 'forward', 'right', 'up', 'quaternion', 'beforeRenderFrame', 'onAddedToScene', '__symbols', '__origin', 'symbol'
]

const fs = window.require('fs').promises;
const path = window.require('path');
const vm = window.require('vm');

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
		
		this.uuid = window._root != this ? uuidv4() : '';
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
		
		if(this == window._root && this.name == '_root')
			throw new Error('Can not rename root');
			
		if(!this.isValidName(value))
			value = `object${(parent?.children?.length ?? Math.floor(Math.random() * 10000000000))}`;
		
		if(protectedNames.includes(value) && window._root != this)
			value += '_unsafe';
		
		const originValue = value;
		let copyNum = 2;
		while(this.parent && this.parent[value] && this.parent[value] != this) {
			value = `${originValue}_${copyNum}`;
			copyNum++;
		}
		
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
	get suuid() {
		return this.__objData.uuid;
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
			}
			this.__onTransformationChange = () => {
				this.checkSymbols();
			}
		}
	}
	
	async createObject(objData, executeScripts = true) {
		const child = new D3DObject(objData.name, this);
		let uuid = objData.uuid;
		
		if(objData.symbolId) {
			if(typeof objData.symbolId !== 'string')
				return;
			
			const symbol = _root.__symbols[objData.symbolId];
			
			if(!symbol) {
				console.warn('Missing symbol for ', objData.symbolId);
				return;
			}
			
			objData = {...symbol.objData};
			
			child.name = objData.name;
			child.symbol = symbol;
			
			uuid = null; // assign new one
		}
		
		child.zip = this.zip;
		child.position = objData.position;
		child.rotation = objData.rotation;
		child.scale = objData.scale;
		child.editorOnly = !!objData.editorOnly || false;
		child.editorAlwaysVisible = !!objData.editorAlwaysVisible || false;
		child.components = objData.components || [];
		
		// Ensure uuid is unique
		if(_root.superIndex?.[uuid])
			uuid = null;
		
		// Assign truly unique uuid
		child.uuid = uuid ?? child.uuid;
		
		// Assign objdata reference
		child.__objData = objData;
		
		// must contain a UUID for SUUID to work on origin objects
		if(child.__objData.uuid === undefined)
			child.__objData.uuid = child.uuid; 
		
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
		
		child.checkSymbols();
		
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
			buffer = await fs.readFile(uri);
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
		if (this === window._root) {
			const { ipcRenderer } = require('electron');
			ipcRenderer.send('update-window', {
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
		
		await this.buildScene(startScene);
	}
	
	async buildScene(scene) {
		if (!scene || !scene.objects) {
			console.warn('Invalid scene data or no objects found');
			return;
		}
	
		// Create all objects
		for (const objData of scene.objects) {
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
		
		if (script && (!window._editor || this.editorOnly)) {
			this.runInSandbox(script);
			console.log(`${scriptName} executed in sandbox`);
		}
		
		if (this.children && this.children.length > 0) {
			for (const child of this.children) {
				await child.executeScripts();
			}
		}
	}
	runInSandbox(script) {
		const sandbox = {
			THREE,
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
			Vector3: THREE.Vector3,
			Quaternion: THREE.Quaternion
		};
		
		const wrappedScript = `(function() { ${script} }).call(self)`;
		vm.runInNewContext(wrappedScript, sandbox);
	}
	async updateComponents() {
		for (const component of this.components) {
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
							break;
						}
						const loader = new GLTFLoader();
						const gltf = await loader.parseAsync(modelData, '');
						this.object3d.add(gltf.scene);
						
						if(this.modelScene)
							this.object3d.remove(this.modelScene);
						
						this.modelScene = gltf.scene;
					}
					if (component.properties.materials && component.properties.materials.length > 0) {
						const matPath = path.join('assets', component.properties.materials[0]);
						const matStr = await this.zip.file(matPath)?.async('string');
						
						if (!matStr) {
							console.warn(`Material file not found: ${matPath}`);
							break;
						}
						const matParams = JSON.parse(matStr);
						if (!THREE[matParams.type]) {
							console.warn(`Unknown material type: ${matParams.type}`);
							break;
						}
						const material = new THREE[matParams.type](matParams);
						if (this.object3d.children.length > 0) {
							this.object3d.children[0].material = material;
						} else {
							console.warn(`No mesh renderer found for material`);
						break;
						}
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
					const objData = JSON.parse(serializedData);
					const uuid = objData.uuid;
					
					if (!uuid || typeof uuid !== 'string') {
						console.warn('Invalid UUID in', rel);
						return;
					}
					
					_root.__symbols[uuid] = { uuid, file, rel, objData };
				} catch(e) {
					console.warn('Failed to parse', rel, e);
				}
			});
			
			promises.push(p);
		});
	
		await Promise.all(promises);
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
	
	checkSymbols() {
		const treeSymbolUpdate = (d3dobject) => {
			d3dobject.symbol && d3dobject.updateSymbol();
			
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
		
		if(symbol.__updatingSymbol)
			return;
			
		symbol.__updatingSymbol = true;
		
		symbol.objData = this.getSerializableObject();
		
		for(let uuid in _root.superIndex) {
			const d3dobject = _root.superIndex[uuid];
			
			if(d3dobject == this)
				continue;
			
			if(d3dobject.symbol == symbol)
				d3dobject.syncToSymbol();
		}
		
		symbol.__updatingSymbol = false;
	}
	
	syncToSymbol() {
		const symbol = this.symbol;
		
		if(!symbol) {
			console.error("Can't sync to symbol because there is no symbol");
			return;
		}
		
		const syncWithObjData = (d3dobject, objData, syncTransform = false) => {
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
			
			objData.children.forEach(schild => {
				const child = d3dobject.children.find(
					child => child.suuid == schild.suuid
				);
				
				if(!child) {
					console.warn('Missing d3d child in symbol sync. Sync child: ', schild);
					return;
				}
				
				syncWithObjData(child, schild, true);
			});
		}
		
		syncWithObjData(this, symbol.objData);
	}
	
	serialize() {
		return JSON.stringify(this.getSerializableObject());
	}
	
	getSerializableObject() {
		return {
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
		this.checkSymbols();
	}
	
	isValidName(str) {
		return /^[A-Za-z0-9 _-]+$/.test(str);
	}
	isNameAllowed(str) {
		return !protectedNames.includes(str) && this.isValidName(str);
	}
}