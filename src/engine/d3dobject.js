// d3dobject.js
import axios from 'axios';
import JSZip from 'jszip';
import DamenScript from './damenscript.js';
import D3DComponents from './d3dcomponents.js';
import D3DConsole from './d3dconsole.js';
import Tween from './d3dtween.js';
import { v4 as uuidv4 } from 'uuid';
import {
	getExtension
} from './d3dutility.js';
const { path } = D3D;

const protectedNames = [
	'_root', 'Input', 'position', 'rotation', 'scale', 'name', 'parent', 'children', 'threeObj', 'scenes', 'zip', 'forward', 'right', 'up', 'quaternion', 'onEnterFrame', 'onAddedToScene', 'manifest', 'scenes', '__origin', '__componentInstances', '__onInternalEnterFrame', '__onEditorEnterFrame', '__deleted', '__animatedTransformChange', '_mesh', '_animation', '__self__'
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
		
		// INTERNAL SENSITIVE VARS
		this.__ready = false;
		this.__componentInstances = {};
		
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
	get worldRotation() {
		// return Euler in radians
		const q = this.object3d.getWorldQuaternion(new THREE.Quaternion());
		return new THREE.Euler().setFromQuaternion(q, 'XYZ');
	}
	
	set worldRotation({ x, y, z }) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
	
		// ensure ancestors are up to date
		if (this.parent)
			this.parent.object3d.updateWorldMatrix(true, false);
	
		// target rotation as quaternion in world space
		const targetEuler = new THREE.Euler(x, y, z, 'XYZ');
		const targetQ = new THREE.Quaternion().setFromEuler(targetEuler);
	
		if (this.parent) {
			// convert world quaternion into local space relative to parent
			const parentQ = this.parent.object3d.getWorldQuaternion(new THREE.Quaternion());
			parentQ.invert();
			targetQ.multiply(parentQ);
		}
	
		this.object3d.quaternion.copy(targetQ);
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
	set quaternion({x, y, z, w}) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z) || Number.isNaN(w))
			return;
		this.object3d.quaternion.set(x, y, z, w);
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
	
	get rootParent() {
		let par = this;
		
		while(par.parent && par.parent != this.root)
			par = par.parent;
		
		return par;
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
		if(this.is2D) {
			return this._2dopacity ?? 1;
		}
		
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
		
		if(this.is2D) {
			this._2dopacity = opacity;
			return;
		}
		
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
	get nameTree() {
		return this.tree.join('.');
	}
	get tree() {
		// root of this object only
		let r = this;
		const names = [];
		while(r && !r.manifest) {
			names.push(r.name);
			r = r.parent;
		}
		return names.reverse();
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
	get is3D() {
		return !this.is2D;
	}
	get is2D() {
		return this.hasComponent('Graphic2D') || this.hasComponent('Container2D');
	}
	get graphic2d() {
		if(!this.is2D)
			return;
		
		if(this.hasComponent('Graphic2D'))
			return this.components.find(c => c.type == 'Graphic2D').properties;
	}
	get depth() {
		const worldPos = this.worldPosition;
		return worldPos.z;
	}
	set depth(value) {
		const worldPos = this.worldPosition;
		worldPos.z = value;
		this.worldPosition = worldPos;
	}
	
	// Component shorthand
	get _animation() {
		return this.getComponent('Animation');
	}
	get _mesh() {
		return this.getComponent('Mesh');
	}
	get _rigidbody() {
		return this.getComponent('Rigidbody');
	}
	
	setupDefaultMethods() {
		if(window._editor) {
			this.__onEditorEnterFrame = () => {
				if(!this.lastMatrixLocal) {
					this.lastMatrixLocal = new THREE.Matrix4().copy(this.object3d.matrix);
					return;
				}
			
				const pos = new THREE.Vector3();
				const rot = new THREE.Quaternion();
				const scl = new THREE.Vector3();
				
				const lastPos = new THREE.Vector3();
				const lastRot = new THREE.Quaternion();
				const lastScl = new THREE.Vector3();
				
				this.object3d.matrix.decompose(pos, rot, scl);
				this.lastMatrixLocal.decompose(lastPos, lastRot, lastScl);
				
				const changed = [];
				if (!pos.equals(lastPos)) changed.push('pos');
				if (!rot.equals(lastRot)) changed.push('rot');
				if (!scl.equals(lastScl)) changed.push('scl');
				
				if(!this.object3d.matrix.equals(this.lastMatrixLocal)) {
					this.__onTransformationChange(changed);
					this.onTransformationChange?.(changed);
					
					if(window._editor)
						window._editor.updateInspector?.();
					
					_events.invoke('matrix-changed', this, changed);
				}
				
				this.lastMatrixLocal = new THREE.Matrix4().copy(this.object3d.matrix);
				
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
		
		this.__onInternalBeforeRender = () => {
			//////////////////////////////////////////////
			//// ENGINE LOOP USED FOR INTERNALS
			//////////////////////////////////////////////
			for(let i in this.__componentInstances) {
				const mgr = this.__componentInstances[i];
				mgr?.__onInternalBeforeRender?.();
			}
		}
		this.__onInternalEnterFrame = () => {
			//////////////////////////////////////////////
			//// ENGINE LOOP USED FOR INTERNALS
			//////////////////////////////////////////////
			for(let i in this.__componentInstances) {
				const mgr = this.__componentInstances[i];
				mgr?.__onInternalEnterFrame?.();
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
			objData.script = symbol.objData.script;
			
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
		
		if(!objData.components)
			objData.components = [];
		
		const child = new D3DObject(objData.name, this);
		
		child.objData = objData;
		child.position = objData.position ?? {x: 0, y: 0, z: 0};
		child.rotation = objData.rotation ?? {x: 0, y: 0, z: 0};
		child.scale = objData.scale ?? {x: 1, y: 1, z: 1};
		child.__script = objData.script;
		
		child.editorOnly = !!objData.editorOnly || false;
		child.editorAlwaysVisible = !!objData.editorAlwaysVisible || false;
		child.no3DGizmos = !!objData.no3DGizmos;
		
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
		
		// COMPONENT SETUP
		for(let c of objData.components) {
			if(c.properties)
				c.properties.__componentEnabled = c.enabled;
			
			await child.addComponent(c.type, c.properties, false);
		}
		
		if(objData.engineScript)
			child.engineScript = objData.engineScript;
		
		if(_root) {
			if(!_root.superIndex)
				_root.superIndex = {};
				
			_root.superIndex[child.uuid] = child;
		}
		
		if(this.object3d) // 2d doesn't have an object3d
			this.object3d.add(child.object3d);
		
		this.children.push(child);
		
		child.visible = objData.visible ?? true;
		child.opacity = objData.opacity ?? 1;
		
		// Recurse for nested objects if any
		if (objData.children && objData.children.length > 0) {
			await child.buildScene({ 
				objects: objData.children
			});
		}
		
		// Handle all child components
		await child.updateComponents();
		
		child.__ready = true;
			
		if(executeScripts)
			await child.executeScripts();
			
		if(window._editor)
			window._editor.updateInspector();
		
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
		
		// Parse asset-index.json for asset metadata
		const assetIndexStr = await zip.file('asset-index.json')?.async('string');
		if (!assetIndexStr) {
			throw new Error('asset-index.json not found in .d3d file');
		}
		this.assetIndex = JSON.parse(assetIndexStr);
		console.log('Asset index loaded:', this.assetIndex);
		this.updateAssetIndex();
	
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
		
		if(this.object3d.isScene && scene.background?.isColor)
			this.object3d.background = new THREE.Color(scene.background.color || '#000000');
		
		// Create all objects
		for (const objData of objects) {
			await this.createObject(objData, false);
		}
		
		// When building scene, wait for all objects to be made first, then execute scripts
		await this.executeScripts();
	}
	
	async executeScripts() {
		const zip = this.root.zip;
		
		let script;
		let scriptName = `__script[${this.name}]`;
		
		if(this.engineScript) {
			const url = new URL(`/engine/${this.engineScript}`, window.location.origin);
			const res = await fetch(url.toString());
			if (!res.ok) 
				throw new Error(`Failed to fetch engine script ${filename}: ${res.status}`);
			script = await res.text();
			scriptName = this.engineScript;
		}else
		if(_root == this) {
			script = await zip.file('scripts/_root.js')?.async('string');
		}else{
			script = this.__script;
		}
		
		this.__script = script;
		
		if (script && (!window._editor || this.editorOnly)) {
			this.runInSandbox(script);
			console.log(`${scriptName} executed in DamenScript sandbox`);
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
			_physics,
			Math,
			_editor: window._editor,
			root: this.root,
			parent: this.parent,
			self: this,
			console: {
				log: (...args) => D3DConsole.log(`[${this.name}]`, ...args),
				warn: (...args) => D3DConsole.warn(`[${this.name}]`, ...args),
				error: (...args) => D3DConsole.error(`[${this.name}]`, ...args),
				assert: (...args) => D3DConsole.assert(...args)
			},
			Vector3: (...args) => new THREE.Vector3(...args),
			Vector2: (...args) => new THREE.Vector2(...args),
			Quaternion: (...args) => new THREE.Quaternion(...args),
			Box3: (...args) => new THREE.Box3(...args),
			MathUtils: THREE.MathUtils
		};
		
		try {
			DamenScript.run(script, sandbox);
		}catch(e) {
			D3DConsole.error(`[${this.name}]`, e.name, e.message);
			console.error(`[${this.name}]`, e);
		}
	}
	setComponentValue(type, field, value) {
		const component = this.components.find(c => c.type == type);
		
		if(!component) {
			console.warn(`No component found for type ${type}`);
			return;
		}
		
		component.properties[field] = value;
		
		if(this.is2D)
			this.invalidateGraphic2D();
		
		this.updateComponents();
		this.checkSymbols();
	}
	async addComponent(type, properties = {}, doUpdateAll = true, removeIfPresent = false, unshift = false) {
		if(this.components.find(c => c.type == type)) {
			if(removeIfPresent) {
				this.removeComponent(type);
			}else{
				return;
			}
		}
		if(!D3DComponents[type]) {
			console.error(`${type} is not a component`);
			return;
		}
		
		const schema = D3DComponents[type];
		const component = {
			type,
			properties
		};
		
		const fieldsToDelete = [];
		
		for(let i in component.properties) {
			const schemaField = schema.fields[i];
			
			if(schemaField === undefined)
				fieldsToDelete.push(i);
		}
		for(let i in schema.fields) {
			const schemaField = schema.fields[i];
			
			if(component.properties[i] === undefined)
				component.properties[i] = schemaField.def;
		}
		fieldsToDelete.forEach(field => {
			if(field.startsWith('__')) return;
			delete component.properties[field];
		});
		
		component.enabled = component.properties.__componentEnabled ?? true;
		
		if(component.properties.__componentEnabled !== undefined)
			delete component.properties.__componentEnabled;
		
		const inst = new schema.manager(this, component);
		
		this.__componentInstances[type] = inst;
		
		if(unshift)
			this.components.unshift(component);
		else 
			this.components.push(component);
			
		if(typeof inst.setupComponent == 'function') {
			await inst.setupComponent();
		}
		
		doUpdateAll && this.updateComponents();
	}
	async removeComponent(type) {
		const component = this.getComponent(type);
		
		if(!component)
			return;
		
		if(typeof component.dispose == 'function')
			await component.dispose();
		
		this.components.splice(this.components.findIndex(c => c.type == type), 1);
		delete this.__componentInstances[type];
	}
	getComponent(type) {
		const component = this.components.find(c => c.type == type);
		
		if(!component)
			return;
		
		return this.__componentInstances[type];
	}
	hasComponent(type) {
		const component = this.components.find(c => c.type == type);
		
		return !!component;
	}
	enableComponent(type) {
		const component = this.components.find(c => c.type == type);
		
		if(!component)
			return;
		
		component.enabled = true;
		this.updateComponents();
	}
	toggleComponent(type, enabled = true) {
		const component = this.components.find(c => c.type == type);
		
		if(!component)
			return;
		
		component.enabled = enabled;
		this.updateComponents();
	}
	enableComponent(type) {
		this.toggleComponent(type, true);
	}
	disableComponent(type) {
		this.toggleComponent(type, false);
	}
	async updateComponents() {
		const zip = this.root.zip;
		const components = this.components;
		
		if(window._editor && !this.no3DGizmos) {
			// Add any gizmo related mesh components
			components.forEach(component => {
				const schema = D3DComponents[component.type];
				const gizmo3d = schema.gizmo3d;
				
				if(gizmo3d) {
					this.addComponent('Mesh', {
						'mesh': _root.resolveAssetId(gizmo3d.mesh),
						'materials': gizmo3d.materials.map(path => _root.resolveAssetId(path)),
						'__editorOnly': true
					}, false);
				}
			})
		}
		
		for (const component of components) {
			const mgr = this.getComponent(component.type);
			
			if(mgr) {
				if(component.enabled)
					await mgr.updateComponent?.();
			} else {
				const schema = D3DComponents[component.type];
				const inst = new schema.manager(this, component);
				this.__componentInstances[type] = inst;
				
				if(component.enabled)
					await inst.updateComponent?.();
			}
		}
	}
	
	updateAssetIndex() {
		const zip = this.root.zip;
		
		if(!this.assetIndex)
			return;
		
		const newAssetIndex = [];
		
		zip.forEach((rel, file) => {
			if(rel.split('/')[0] != 'assets' || rel == 'assets/')
				return;
			
			const a = this.assetIndex.find(a => a.rel == rel);
			
			newAssetIndex.push({
				rel: rel,
				uuid: a?.uuid ?? uuidv4()
			})
		});
		
		this.assetIndex = newAssetIndex;
	}
	async updateSymbolStore() {
		const zip = this.root.zip;
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
		
		// never update symbol before object is fully created or it will corrupt the symbol
		if(!this.__ready)
			return; 
		
		symbol.objData = this.getSerializableObject();
		
		for(let i in _root.superIndex) {
			const d3dobject = _root.superIndex[i];
			
			if(d3dobject != this && d3dobject.symbol == symbol)
				d3dobject.__dirtySymbol = true;
		}
	}
	
	findAssetById(uuid) {
		const assetIndex = this.root.assetIndex;
		
		return assetIndex.find(a => a.uuid == uuid);
	}
	findAssetByPath(path) {
		const assetIndex = this.root.assetIndex;
		
		return assetIndex.find(a => a.rel == path);
	}
	resolvePath(uuid) {
		const a = this.findAssetById(uuid);
		
		if(!a)
			console.warn(`Can't resolve asset path for UUID ${uuid}`);
		
		return a?.rel || '';
	}
	resolvePathNoAssets(uuid) {
		const path = this.resolvePath(uuid);
		
		if(!path.startsWith('assets/'))
			return path;
		else
			return path.substr(7, path.length);
	}
	resolveAssetId(path) {
		if(!path.startsWith('assets/'))
			path = 'assets/' + path;
		
		const a = this.findAssetByPath(path);
		
		if(!a)
			console.warn(`Can't resolve asset id for path ${path}`);
		
		return a?.uuid || '';
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
			
			d3dobject.__script = objData.script;
			d3dobject.components = structuredClone(objData.components);
			
			await d3dobject.updateComponents();
			
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
		if(d3dobject == this.parent) {
			console.warn('Cant set parent already is parent', this.name, this.parent?.name);
			return;
		}
		
		if(this.parent && this.parent.children.includes(this)) {
			// Remove from current parent
			this.parent.children.splice(this.parent.children.indexOf(this), 1);
		}
		
		this.parent = d3dobject;
		
		if(!d3dobject.children.includes(this))
			d3dobject.children.push(this);
		
		if(d3dobject.object3d && this.object3d)
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
	
	async refreshObjectsWithResource(uri) {
		const uuid = this.resolveAssetId(uri);
		
		const checkObject = async (d3dobject) => {
			const serializedComponents = JSON.stringify(
				d3dobject.getSerializedComponents()
			);
			
			if (serializedComponents.includes(`"${uuid}"`)) {
				// refresh this child
				await d3dobject.updateComponents();
			}
		}
		
		await checkObject(this);
		
		for (const child of this.children) {
			await checkObject(child);
			await child.refreshObjectsWithResource(uri);
		}
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
			components: this.getSerializedComponents(),
			children: this.children.map(child => child.getSerializableObject()),
			script: this.__script
		}
		
		if(this.symbolId)
			obj.symbolId = this.symbolId;
		
		if(this.__preAnimationTransform) {
			obj.position.x = this.__preAnimationTransform.position.x;
			obj.position.y = this.__preAnimationTransform.position.y;
			obj.position.z = this.__preAnimationTransform.position.z;
			obj.rotation.x = this.__preAnimationTransform.rotation.x;
			obj.rotation.y = this.__preAnimationTransform.rotation.y;
			obj.rotation.z = this.__preAnimationTransform.rotation.z;
			obj.scale.x = this.__preAnimationTransform.scale.x;
			obj.scale.y = this.__preAnimationTransform.scale.y;
			obj.scale.z = this.__preAnimationTransform.scale.z;
		}
		
		return obj;
	}
	getSerializedComponents() {
		return this.components
		.filter(component => !component.properties.__editorOnly)
		.map(component => this.getSerializedComponent(component))
	}
	getSerializedComponent(component) {
		return {
			type: component.type,
			properties: structuredClone(component.properties),
			enabled: !!(component.enabled ?? true)
		};
	}
	
	find(name) {
		return this.children.find(child => child.name == name);
	}
	findDeep(name) {
		const res = [];
		if(this.name == name)
			res.push(this);
		this.traverse(d3dobject => {
			if(d3dobject.name == name)
				res.push(d3dobject);
		});
		return res;
	}
	traverse(callback) {
		if (callback(this) === false)
			return false;
			
		if (this.children && this.children.length) {
			for (let i = 0; i < this.children.length; i++) {
				const child = this.children[i];
				if (child && typeof child.traverse === 'function') {
					if (child.traverse(callback) === false)
						return false;
				}
			}
		}
		
		return true;
	}
	containsChild(d3dobject) {
		if (!d3dobject || d3dobject === this)
			return false;
			
		let found = false;
		
		this.traverse(obj => {
			if (obj === d3dobject) {
				found = true;
				return false;
			}
		});
		
		return found;
	}
	lookAt(...params) {
		if(this.object3d)
			this.object3d.lookAt(...params)
	}
	
	delete() {
		if(this.parent == null)
			throw new Error("Can't delete _root");
			
		if(this.__auto_gltf)
			throw new Error("Can't delete managed object");
		
		const idx = this.parent.children.indexOf(this);
		
		if(idx < 0)
			throw new Error("Parent doesn't contain child?");
			
		this.parent.children.splice(idx, 1);
		
		if(this.parent.object3d)
			this.parent.object3d.remove(this.object3d);
		
		this.__deleted = true;
		
		delete this.parent[this.name];
		delete _root.superIndex[this.uuid];
		
		this.checkSymbols();
	}
	async readFile(path) {
		const zip = this.zip;
		if(!zip)
			return;
		
		const file = zip.file(path);
		if (!file) 
			return null;
	
		return await file.async('string');
	}
	
	isValidName(str) {
		return /^[A-Za-z0-9 _-]+$/.test(str);
	}
	isNameAllowed(str) {
		return !protectedNames.includes(str) && this.isValidName(str);
	}
	
	setAnimatedTransform({position, quaternion, scale}) {
		if(!this.__preAnimationTransform) {
			this.__preAnimationTransform = {
				position: this.position.clone(),
				rotation: this.rotation.clone(),
				quaternion: this.quaternion.clone(),
				scale: this.scale.clone()
			}
		}
		
		if(position)
			this.position = position;
		
		if(quaternion)
			this.quaternion = quaternion;
			
		if(scale)
			this.scale = scale;
	}
	resetAnimationTransform() {
		if(this.__preAnimationTransform) {
			this.position = this.__preAnimationTransform.position;
			this.quaternion = this.__preAnimationTransform.quaternion;
			this.scale = this.__preAnimationTransform.scale;
			
			this.__preAnimationTransform = null;
		}
	}
	
	getNextHighestDepth() {
		let depth = 0;
		this.children.forEach(d3dobj => {
			if(d3dobj.__temp) return;
			
			const d = d3dobj.depth;
			if(d > depth)
				depth = d;
		});
		return depth + 1;
	}
	invalidateGraphic2D() {
		if(!this.is2D)
			return;
		
		_host.renderer2d._dirty = true;
	}
}