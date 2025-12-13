// d3dobject.js
import axios from 'axios';
import JSZip from 'jszip';
import DamenScript from './damenscript.js';
import D3DComponents from './d3dcomponents.js';
import D3DConsole from './d3dconsole.js';
import D3DPromise from './d3dpromise.js';
import D3DWebsocket from './d3dwebsocket.js';
import D3DWebRTC from './d3dwebrtc.js';
import D3DLocalStorage from './d3dlocalstorage.js';
import D3DFileCache from './d3dfilecache.js';
import Tween from './d3dtween.js';
import { v4 as uuidv4 } from 'uuid';
import {
	getExtension,
	applyOpacity,
	applyTextureToSceneBackground,
	forSeconds,
	forFrames,
	relNoAssets,
	relNoExt
} from './d3dutility.js';
import {
	worldToScreen
} from './d2dutility.js';

const protectedNames = [
	'_root', 'Input', 'position', 'rotation', 'scale', 'name', 'parent', 'children', 'threeObj', 'scenes', 'zip', 'forward', 'right', 'up', 'quaternion', 'onEnterFrame', 'onAddedToScene', 'manifest', 'scenes', '__origin', '__componentInstances', '__onInternalEnterFrame', '__onEditorEnterFrame', '__deleted', '__animatedTransformChange', '_mesh', '_animation', '__self__', '_camera', '_directionallight', '_ambientlight', '_pointlight', 'isClicked', 'isMouseOver', '__runInSandbox', '__loaded', 'fileMeta'
]

export default class D3DObject {
	constructor(name = 'object', parent = null) {
		if (!window._root) 
			window._root = this;
		
		// Must come first
		this.scenes = [];
		this.components = [];
		this.children = [];
		
		this.uuid = _root != this ? uuidv4() : '';
		this.suuid = uuidv4();
		this.parent = parent; // D3DObject or null for root
		this.name = name;
		this._enabled = true;
		this._visible = true;
		
		// INTERNAL SENSITIVE VARS
		this.__ready = false;
		this.__componentInstances = {};
		this.__events = {};
		
		this.object3d = this.parent ? new THREE.Object3D() : new THREE.Scene();
		this.object3d.userData.d3dobject = this;
		this.__d3d = true;
		
		this.setupDefaultMethods();
	}
	
	///////////////////////////////
	// Getters and setters only
	///////////////////////////////
	get enabled() {
		let o = this;
		
		while(o) {
			if(!o._enabled)
				return false;
			o = o.parent;
		}
		
		return true;
	}
	set enabled(v) {
		this._enabled = !!v;
		
		if(this.parent) {
			if(this._enabled && !this.parent.object3d.children.includes(this.object3d)) {
				this.parent.object3d.add(this.object3d);
				this.updateComponents();
			}else
			if(!this._enabled && this.parent.object3d.children.includes(this.object3d)) {
				this.disposeAllRigidbodies();
				this.parent.object3d.remove(this.object3d);
			}
		}
		if(this._enabled && !this.__scriptRan) {
			this.executeScripts();
		}
	}
	
	get name() {
		return this._name;
	}
	set name(value) {
		if(!this.isValidName(value))
			throw new Error(`Invalid name ${value} for object`);
		
		if(this == _root && this.name == '_root')
			throw new Error('Can not rename root');
		
		if(!this.isNameAllowed(value) && _root != this)
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
			if(this.parent[oldName] === this)
				delete this.parent[oldName];
			
			this.parent[this._name] = this;
		}
		
		this.checkSymbols();
	}
	
	get layer() {
		const obj = this.object3d;
		if(!obj)
			return 0;
		
		// convert bitmask → layer index
		const mask = obj.layers.mask;
		let layer = 0;
		while(layer < 32 && ((mask & (1 << layer)) === 0))
			layer++;
		return layer;
	}
	set layer(v) {
		const obj = this.object3d;
		if(!obj)
			return;
		
		v = Number(v) || 0;
		obj.layers.set(v);
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
		const q = this.object3d.getWorldQuaternion(new THREE.Quaternion());
		const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
		return new THREE.Vector3(e.x, e.y, e.z); // radians as a vector3
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
	
	get worldQuaternion() {
		return this.object3d.getWorldQuaternion(new THREE.Quaternion());
	}
	set worldQuaternion(qWorld) {
		if (!qWorld || !(qWorld instanceof THREE.Quaternion))
			return;
	
		// If there's a parent, convert world quaternion into local space
		if (this.object3d.parent) {
			const parentQ = this.object3d.parent.getWorldQuaternion(new THREE.Quaternion());
			const invParentQ = parentQ.invert();
			this.object3d.quaternion.copy(qWorld.clone().multiply(invParentQ));
		} else {
			// No parent: just copy directly
			this.object3d.quaternion.copy(qWorld);
		}
	
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
	
	get localEulerAngles() {
		const e = new THREE.Euler();
		e.setFromQuaternion(this.object3d.quaternion, 'YXZ');
		const d = THREE.MathUtils.radToDeg;
		const w = a => ((a % 360) + 360) % 360;
		return Object.freeze({
			x: w(d(e.x)),   // pitch
			y: w(d(e.y)),   // yaw
			z: w(d(e.z))    // roll
		});
	}
	set localEulerAngles({ x = 0, y = 0, z = 0 }) {
		const e = new THREE.Euler(
			THREE.MathUtils.degToRad(x),
			THREE.MathUtils.degToRad(y),
			THREE.MathUtils.degToRad(z),
			'YXZ'
		);
		this.object3d.quaternion.setFromEuler(e);
		this.object3d.rotation.copy(e);
		this.object3d.updateMatrixWorld();
	}
	
	get localAttitude() {
		// Build local basis (relative to parent) from the local quaternion
		const q = this.object3d.quaternion;
		
		const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); // forward
		const r = new THREE.Vector3(1, 0, 0).applyQuaternion(q);  // right
		const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);  // up
		
		// Stable aircraft-style angles (no Euler decomposition):
		// yaw   = heading around parent-up
		// pitch = nose up/down
		// bank  = roll around forward
		const yaw   = Math.atan2(f.x, -f.z);                       // rad
		const pitch = Math.atan2(f.y, Math.hypot(f.x, f.z));       // rad
		const bank  = Math.atan2(r.y, u.y);                        // rad
		
		const toDeg = THREE.MathUtils.radToDeg;
		const wrap360 = a => (a % 360 + 360) % 360;
		
		return Object.freeze({
			pitch: toDeg(pitch),
			yaw:   toDeg(yaw),
			bank:  toDeg(bank),
		});
	}
	set localAttitude({ pitch = 0, yaw = 0, bank = 0 }) {
		const obj = this.object3d;
	
		// Flip everything
		const s = -1;
	
		const e = new THREE.Euler(
			THREE.MathUtils.degToRad(s * pitch), // X (pitch)
			THREE.MathUtils.degToRad(s * yaw),   // Y (yaw)
			THREE.MathUtils.degToRad(s * bank),  // Z (bank/roll)
			'YXZ'                                 // yaw → pitch → bank
		);
	
		obj.quaternion.setFromEuler(e);
		obj.rotation.copy(e);
		obj.updateMatrixWorld(true);
	}
	
	get worldAttitude() {
		// Get world quaternion (orientation in global space)
		const q = this.object3d.getWorldQuaternion(new THREE.Quaternion());
	
		const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); // forward
		const r = new THREE.Vector3(1, 0, 0).applyQuaternion(q);  // right
		const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);  // up
	
		// Stable aircraft-style angles (no Euler decomposition)
		const yaw   = Math.atan2(f.x, -f.z);                 // rad
		const pitch = Math.atan2(f.y, Math.hypot(f.x, f.z)); // rad
		const bank  = Math.atan2(r.y, u.y);                  // rad
	
		const toDeg = THREE.MathUtils.radToDeg;
		return {
			pitch: toDeg(pitch),
			yaw:   toDeg(yaw),
			bank:  toDeg(bank)
		};
	}
	set worldAttitude({ pitch = 0, yaw = 0, bank = 0 }) {
		const obj = this.object3d;
	
		// Convert to radians
		const p = THREE.MathUtils.degToRad(pitch);
		const y = THREE.MathUtils.degToRad(yaw);
		const b = THREE.MathUtils.degToRad(bank);
	
		// Compose world quaternion in Y→X→Z order (yaw, pitch, bank)
		const qYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), y);
		const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p);
		const qBank  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), b);
	
		const qWorld = new THREE.Quaternion()
			.multiply(qYaw)
			.multiply(qPitch)
			.multiply(qBank);
	
		// If object has a parent, convert world → local:
		if (this.parent) {
			const qParent = this.parent.object3d.getWorldQuaternion(new THREE.Quaternion());
			qParent.invert();
			qWorld.premultiply(qParent);
		}
	
		obj.quaternion.copy(qWorld);
		obj.rotation.setFromQuaternion(qWorld);
		obj.updateMatrixWorld(true);
	}
	
	get scale() {
		return this.object3d.scale;
	}
	set scale({x, y, z}) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
		this.object3d.scale.set(x, y, z);
	}
	
	get worldScale() {
		const ws = new THREE.Vector3();
		this.object3d.updateWorldMatrix(true, true);
		this.object3d.getWorldScale(ws);
		return ws;
	}
	set worldScale({x, y, z}) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
		// convert to local scale relative to parent world scale
		const parentScale = new THREE.Vector3(1, 1, 1);
		if (this.object3d.parent)
			this.object3d.parent.getWorldScale(parentScale);
	
		this.object3d.scale.set(
			x / parentScale.x,
			y / parentScale.y,
			z / parentScale.z
		);
	}
	
	get visible() {
		return (this._visible && this._visible2) ?? true;
	}
	set visible(value) {
		this._visible = !!value;
		this.onVisibilityChanged?.();
		this._onVisibilityChanged?.();
		this.checkSymbols();
	}
	
	get visible2() {
		return this._visible2 ?? true;
	}
	set visible2(value) {
		this._visible2 = !!value;
		this.onVisibilityChanged?.();
		this._onVisibilityChanged?.();
		this.checkSymbols();
	}
	
	get rendered() {
		return this.getIsRendered();
	}
	
	get __editorState() {
		if(!window._editor)
			return {};
		
		const states = _root.manifest.editorConfig.objectStates;
		
		if(!states[this.uuid])
			states[this.uuid] = {};
		
		return states[this.uuid];
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
		return this._opacity ?? 1;
	}
	set opacity(value) {
		this._opacity = Math.max(0, Math.min(1, Number(value))) ?? 0;
		this.updateVisibility();
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
		
		return this.root.__symbols[this.symbolId];
	}
	get forward() {
		const fwd = THREE.Vector3.forward.clone();
		fwd.applyQuaternion(this.worldQuaternion);
		return fwd;
	}
	get right() {
		const right = THREE.Vector3.right.clone();
		right.applyQuaternion(this.worldQuaternion);
		return right;
	}
	get up() {
		const up = THREE.Vector3.up.clone();
		up.applyQuaternion(this.worldQuaternion);
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
		const pos = this.position;
		return pos.z;
	}
	set depth(value) {
		const pos = this.position;
		pos.z = value;
		this.pos = pos;
	}
	
	get worldDepth() {
		const worldPos = this.worldPosition;
		return worldPos.z;
	}
	set worldDepth(value) {
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
				if(!this.object3d)
					return;
				
				this.updateVisibility();
				
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
					
					this.invokeEvent('matrixChanged', changed);
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
		
		this.__onInternalStart = () => {
			//////////////////////////////////////////////
			//// ENGINE OBJ START EVENT USED FOR INTERNALS
			//////////////////////////////////////////////
			for(let i in this.__componentInstances) {
				const mgr = this.__componentInstances[i];
				mgr?.__onInternalStart?.();
			}
			this.invokeEvent('start');
		}
		this.__onInternalBeforeRender = () => {
			//////////////////////////////////////////////
			//// ENGINE LOOP USED FOR INTERNALS
			//////////////////////////////////////////////
			for(let i in this.__componentInstances) {
				const mgr = this.__componentInstances[i];
				
				if(mgr?.component?.enabled)
					mgr?.__onInternalBeforeRender?.();
			}
			this.invokeEvent('beforeRender');
		}
		this.__onInternalEnterFrame = () => {
			//////////////////////////////////////////////
			//// ENGINE LOOP USED FOR INTERNALS
			//////////////////////////////////////////////
			this.updateVisibility();
			for(let i in this.__componentInstances) {
				const mgr = this.__componentInstances[i];
				
				if(mgr?.component?.enabled)
					mgr?.__onInternalEnterFrame?.();
				
				if(mgr && mgr?.component) {
					if(mgr.__isEnabled !== mgr.component.enabled) {
						if(mgr.component.enabled) {
							this.updateComponents(true);
							mgr.onEnabled?.();
						}else{
							this.updateComponents(true);
							mgr.onDisabled?.();
						}
						mgr.__isEnabled = mgr.component.enabled;
					}
				}
			}
			this.invokeEvent('enterFrame');
		}
		this.__onInternalExitFrame = () => {
			//////////////////////////////////////////////
			//// ENGINE LOOP USED FOR INTERNALS
			//////////////////////////////////////////////
			for(let i in this.__componentInstances) {
				const mgr = this.__componentInstances[i];
				
				if(mgr?.component?.enabled)
					mgr?.__onInternalExitFrame?.();
			}
			this.invokeEvent('exitFrame');
		}
		this.__onInternalPhysicsUpdate = () => {
			//////////////////////////////////////////////
			//// ENGINE LOOP USED FOR INTERNALS
			//////////////////////////////////////////////
			for(let i in this.__componentInstances) {
				const mgr = this.__componentInstances[i];
				
				if(mgr?.component?.enabled)
					mgr?.__onInternalPhysicsUpdate?.();
			}
			this.invokeEvent('physicsUpdate');
		}
	}
	
	async createObject(objData, opts = {}) {
		const executeScripts = opts?.executeScripts ?? true;
		const root = opts.root || this.root;
		
		if(!objData) {
			throw new Error('No object data provided to create object from!');
		}
		if(objData.symbolId) {
			// Load objData from symbol instead
			const symbol = root.__symbols[objData.symbolId];
			
			if(!symbol) {
				throw new Error(`Symbol doesn't exist ${objData.symbolId}`)
			}
			if(!symbol.objData) {
				throw new Error(`Symbol data is missing ${objData.symbolId}`)
			}
			
			const symbolCopy = structuredClone(symbol.objData);
			
			objData.children = symbolCopy.children;
			objData.components = symbolCopy.components;
			objData.suuid = symbolCopy.suuid;
			objData.script = symbolCopy.script;
			objData.layer = symbolCopy.layer;
			
			/*
				Override-able properties
			*/
			if(!objData.name)
				objData.name = symbolCopy.name;
			
			if(!objData.position)
				objData.position = symbolCopy.position;
				
			if(!objData.rotation)
				objData.rotation = symbolCopy.rotation;
				
			if(!objData.scale)
				objData.scale = symbolCopy.scale;
				
			if(!objData.visible)
				objData.visible = symbolCopy.visible;
			
			if(!objData.opacity)
				objData.opacity = symbolCopy.opacity;
		}
		
		if(!objData.components)
			objData.components = [];
		
		const child = new D3DObject(objData.name, this);
		
		child.objData = objData;
		child.position = objData.position ?? {x: 0, y: 0, z: 0};
		child.rotation = objData.rotation ?? {x: 0, y: 0, z: 0};
		child.scale = objData.scale ?? {x: 1, y: 1, z: 1};
		child.__script = objData.script;
		child.layer = objData.layer;
		
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
		let suuid = objData.suuid;
		
		// Ensure uuid is unique
		if(_root.superIndex?.[uuid])
			uuid = null;
			
		// Ensure suuid is unique
		if(this.children.find(c => c.suuid == suuid))
			suuid = null;
		
		// Assign truly unique uuid
		child.uuid = uuid ?? child.uuid;
		
		// Assign SUUID
		child.suuid = suuid ?? child.suuid;
		
		// Assign enabled toggle
		child._enabled = objData.enabled !== undefined ? !!objData.enabled : true;
		
		///////////////////////////
		// ----- END UUID ----- //
		///////////////////////////
		
		////////////////////////////
		// ---- EDITOR STATE ---- //
		////////////////////////////
		if(window._editor) {
			// Copy editor state object from objData uuid
			const states = _root.manifest.editorConfig.objectStates;
			const state = states[objData.uuid];
			if(state)
				states[child.uuid] = structuredClone(state);
		}
		
		// COMPONENT SETUP
		for(let c of objData.components) {
			if(c.properties)
				c.properties.__componentEnabled = c.enabled;
			
			await child.addComponent(c.type, c.properties, {
				doUpdateAll: false,
				dontRecurseSymbols: true
			});
		}
		
		if(objData.engineScript)
			child.engineScript = objData.engineScript;
		
		if(_root) {
			if(!_root.superIndex)
				_root.superIndex = {};
				
			_root.superIndex[child.uuid] = child;
			_root.updateSuperIndex();
		}
		
		if(this.object3d && child.enabled) // 2d doesn't have an object3d
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
		if(opts?.updateComponents !== true)
			await child.updateComponents();
		
		child.__ready = true;
			
		if(executeScripts)
			await child.executeScripts();
			
		if(window._editor)
			window._editor.updateInspector();
		
		await this.checkSymbols();
		
		return child;
	}
	async createFromSymbol(rel, objData = {}, opts = {}) {
		const root = opts.root || this.root;
		const symbol = Object.values(root.__symbols).find(
			s => relNoAssets(relNoExt(s.file.name)) == rel
		);
		
		if(!symbol) {
			console.warn('Create from symbol: No such symbol by path', rel);
			return;
		}
		
		const { symbolId } = symbol;
		
		objData.symbolId = symbolId;
		
		return await this.createObject(objData, opts);
	}
	
	async load(uri) {
		let buffer;
	
		this.fileMeta = { bytesTotal: 0, bytesLoaded: 0 };
		this.__origin = uri;
		this.__symbols = {};
	
		this.removeAllChildren();
	
		const isRemote = !_isStandalone || uri.startsWith('http://') || uri.startsWith('https://');
		
		buffer = await D3DFileCache.getOrLoad(
			uri,
			async () => {
				if(isRemote) {
					console.log('Fetching remote .d3d from URL...');
					const response = await axios.get(uri, {
						responseType: 'arraybuffer',
						onDownloadProgress: progressEvent => {
							this.fileMeta.bytesTotal = progressEvent.total;
							this.fileMeta.bytesLoaded = progressEvent.loaded;
							this.invokeEvent('loadProgress', { ...this.fileMeta });
						}
					});
					return new Uint8Array(response.data);
				} else {
					console.log('Reading local .d3d file...');
					return await D3D.readFile(uri);
				}
			},
			{ persistent: isRemote } // remote persists; local you can choose
		);
	
		if(buffer) {
			this.fileMeta.bytesTotal = buffer.length;
			this.fileMeta.bytesLoaded = buffer.length;
	
			this.invokeEvent('loadProgress', { ...this.fileMeta });
	
			await this.loadFromZip(buffer);
	
			console.log('D3D file loaded, size:', buffer.length, 'bytes');
	
			this.__loaded = true;
			this.onLoad?.();
			this.invokeEvent('load');
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
		
		// Parse asset-index.json for asset metadata
		const assetIndexStr = await zip.file('asset-index.json')?.async('string');
		if (!assetIndexStr) {
			throw new Error('asset-index.json not found in .d3d file');
		}
		this.assetIndex = JSON.parse(assetIndexStr);
		
		// Load any LOD geometry data
		await this.loadLODGeoms();
		
		this.updateAssetIndex();
		
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
		
		_events.invoke('scene-loaded');
	}
	
	async loadScene(scene) {
		this.root.scene = scene;
		await this.buildScene(scene);
		await this.executeScripts();
	}
	
	async buildScene(scene) {
		if (!scene || !scene.objects) {
			console.warn('Invalid scene data or no objects found');
			return;
		}
	
		const objects = [...scene.objects];
		
		await this.applyScene(scene);
		
		// Create all objects
		for (const objData of objects) {
			await this.createObject(objData, {
				executeScripts: false
			});
		}
	}
	
	async applyScene(scene, overrideRoot, overrideZip) {
		if(!this.object3d.isScene)
			return;
		
		try {
			const bgType = scene.background?.type;
			
			if(bgType == 'none') {
				this.object3d.background = new THREE.Color('#000000');
			}
			if(bgType == 'color') {
				this.object3d.background = new THREE.Color(scene.background.color || '#000000');
			}else
			if(bgType == 'texture') {
				await applyTextureToSceneBackground(
					overrideRoot ?? this.root,
					overrideZip ?? this.zip,
					this.object3d,
					scene.background.textureAsset
				)
			}
		}catch(e) {
			console.error('Apply scene background error', e);
		}
		
		try {
			if(scene.fog?.enabled) {
				if(!this.object3d.fog?.isFog) {
					this.object3d.fog = new THREE.Fog(
						new THREE.Color(scene.fog.color),
						Number(scene.fog.near) || 0,
						Number(scene.fog.far) || 0
					)
				}else{
					this.object3d.fog.color = new THREE.Color(scene.fog.color);
					this.object3d.fog.near = Number(scene.fog.near) || 0;
					this.object3d.fog.far = Number(scene.fog.far) || 0;
				}
			}else{
				this.object3d.fog = null;
			}
		}catch(e) {
			console.error('Apply scene fog error', e);
		}
	}
	setSceneBackground(background, apply = true) {
		if(!this.object3d.isScene)
			return;
		
		this.scene.background = background;
		apply && this.applyScene(this.scene);
	}
	
	async loadLODGeoms() {
		const zip = this.zip;
		const serializedData = await zip.file('lodgeoms.json')?.async('string');
		if (!serializedData)
			return;
		
		const loader = new THREE.BufferGeometryLoader();
		const serializedLODs = JSON.parse(serializedData);
		
		this.__lodGeoms = {};
		
		for(const sig in serializedLODs) {
			const data = serializedLODs[sig];
			const geometry = loader.parse(data);
			
			this.__lodGeoms[sig] = geometry;
		}
	}
	
	async executeScripts() {
		if (!this.enabled) 
			return;
	
		let script = null;
		let scriptName = this.engineScript || `__script[${this.name}]`;
		
		this.__scriptRan = true;
		
		try {
			if(this.engineScript) {
				const engineScriptPath = await D3D.resolveEngineScriptPath(this.engineScript);
				
				const res = await fetch(engineScriptPath);
				if (!res.ok) {
					console.error(`Failed to fetch engine script ${this.engineScript}:`, res.status, res.statusText);
					return;
				}
				script = await res.text();
			
			}else 
			if(this.root == this) {
				const zip = this.root?.zip;
				if (zip) {
					const file = zip.file('scripts/_root.js');
					if (file) {
						script = await file.async('string');
					}
				}
			}else{
				script = this.__script;
			}
		} catch (err) {
			console.error('Error loading script for', this.name, err);
			return;
		}
	
		this.__script = script;
		
		if(script && (!window._editor || this.editorOnly)) {
			this.__runInSandbox(script);
			console.log(`${scriptName} executed in DamenScript sandbox`);
		}
		if(this.children && this.children.length > 0) {
			for(const child of this.children) {
				await child.executeScripts();
			}
		}
	}
	__runInSandbox(script) {
		const sandbox = Object.freeze({
			// D3DEngine
			_root,
			_input,
			_time,
			_physics,
			_dimensions,
			_graphics,
			
			// JS Like
			fetch,
			setTimeout,
			setInterval,
			clearTimeout,
			clearInterval,
			forSeconds,
			forFrames,
			performance: Object.freeze({ now: () => globalThis.performance.now() }),
			queueMicrotask: (fn) => globalThis.queueMicrotask(fn),
			crypto: Object.freeze({
				getRandomValues: (a) => globalThis.crypto.getRandomValues(a),
				randomUUID: () => globalThis.crypto.randomUUID()
			}),
			
			Math: Object.freeze(Math),
			JSON: Object.freeze(JSON),
			Number: Object.freeze(Number),
			String: Object.freeze(String),
			Boolean: Object.freeze(Boolean),
			Uint8Array: Object.freeze(Uint8Array),
			Uint16Array: Object.freeze(Uint16Array),
			Uint32Array: Object.freeze(Uint32Array),
			Int8Array: Object.freeze(Int8Array),
			Int16Array: Object.freeze(Int16Array),
			Int32Array: Object.freeze(Int32Array),
			Float32Array: Object.freeze(Float32Array),
			Float64Array: Object.freeze(Float64Array),
			Infinity,
			
			// JS Adaptors
			Promise: Object.freeze(D3DPromise),
			WebSocket: Object.freeze(D3DWebsocket),
			WebRTC: Object.freeze(D3DWebRTC),
			LocalStorage: Object.freeze(D3DLocalStorage),
			typeOf: Object.freeze((val) => typeof val),
			worldToScreen: Object.freeze(worldToScreen),
			
			// Editor relevant only
			_editor: window._editor,
			
			// Global store
			_global: window.__global,
			
			// D3DObject intances
			root: this.root,
			parent: this.parent,
			self: this,
			
			// Console
			console: Object.freeze({
				log: (...args) => D3DConsole.log(`[${this.name}]`, ...args),
				warn: (...args) => D3DConsole.warn(`[${this.name}]`, ...args),
				error: (...args) => D3DConsole.error(`[${this.name}]`, ...args),
				assert: (...args) => D3DConsole.assert(...args),
				clear: () => D3DConsole.clear()
			}),
			
			// THREE
			MathUtils: Object.freeze(THREE.MathUtils),
			Vector3: (...a) => new THREE.Vector3(...a),
			Vector2: (...a) => new THREE.Vector2(...a),
			Quaternion: (...a) => new THREE.Quaternion(...a),
			Box3: (...a) => new THREE.Box3(...a),
			Matrix4: (...a) => new THREE.Matrix4(...a),
			Euler: (...a) => new THREE.Euler(...a),
			Color: (...a) => new THREE.Color(...a),
			Raycaster: (...a) => new THREE.Raycaster(...a),
			Sphere: (...a) => new THREE.Sphere(...a),
			Plane: (...a) => new THREE.Plane(...a),
		});
		
		DamenScript.run(script, sandbox, { contextId: this.name })
		.catch(e => {
			D3DConsole.error(`[${this.name}]`, e.name, e.message);
			console.error(`[${this.name}]`, e);
		});
	}
	async setComponentValue(type, field, value) {
		const component = this.components.find(c => c.type == type);
		
		if(!component) {
			console.warn(`No component found for type ${type}`);
			return;
		}
		
		component.properties[field] = value;
		
		if(this.is2D)
			this.invalidateGraphic2D();
		
		await this.updateComponents();
		this.checkSymbols();
	}
	async addComponent(
		type, 
		properties = {}, 
		{ 
			doUpdateAll = true, 
			removeIfPresent = false, 
			unshift = false,
			dontRecurseSymbols = false
		} = {}
	) {
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
		inst.component = component;
		inst.d3dobject = this;
		
		this.__componentInstances[type] = inst;
		
		if(unshift)
			this.components.unshift(component);
		else 
			this.components.push(component);
			
		if(typeof inst.setupComponent == 'function') {
			await inst.setupComponent();
		}
		
		doUpdateAll && this.updateComponents();
		
		if(this.symbol && !dontRecurseSymbols) {
			// Add instances of this component to symbols
			this.root.traverse(d3dobject => {
				if(this !== d3dobject && d3dobject.symbol == this.symbol) {
					d3dobject.addComponent(type, properties, {
						dontRecurseSymbols: true
					});
				}
			});
			this.checkSymbols();
		}
	}
	async removeComponent(
		type, 
		{
			dontRecurseSymbols = false
		} = {}
	) {
		const component = this.getComponent(type);
		
		if(!component)
			return;
			
		if(typeof component.dispose == 'function')
			await component.dispose();
		
		this.components.splice(this.components.findIndex(c => c.type == type), 1);
		delete this.__componentInstances[type];
		
		if(this.symbol && !dontRecurseSymbols) {
			// Remove all instances of this component
			this.root.traverse(d3dobject => {
				if(this !== d3dobject && d3dobject.symbol == this.symbol) {
					d3dobject.removeComponent(type, {
						dontRecurseSymbols: true
					});
				}
			});
			this.checkSymbols();
		}
	}
	getComponentObject(type, { dummy = false } = {}) {
		const component = this.components.find(c => c.type == type);
		
		if(!component)
			return;
		
		if(dummy) {
			if(!this.__dummyComponents)
				this.__dummyComponents = [];
			
			const dummyComponent = this.__dummyComponents.find(c => c.type == type);
			
			if(!dummyComponent) {
				this.__dummyComponents.push(structuredClone(component));
			}else{
				return dummyComponent;
			}
		}
		
		return component;
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
	hasVisibleComponent(type) {
		const component = this.components.find(c => c.type == type);
		
		return !!component && component?.properties.__editorOnly !== true;
	}
	toggleComponent(type, enabled = true) {
		const component = this.components.find(c => c.type == type);
		
		if(!component)
			return;
		
		component.enabled = enabled;
		this.updateComponents();
		this.checkSymbols();
	}
	enableComponent(type) {
		this.toggleComponent(type, true);
	}
	disableComponent(type) {
		this.toggleComponent(type, false);
	}
	async updateComponents(force = false) {
		if(!this.enabled)
			return;
		
		const zip = this.root.zip;
		const components = this.components;
		
		if(window._editor && !this.no3DGizmos) {
			// Add any gizmo related mesh components
			components.forEach(component => {
				const schema = D3DComponents[component.type];
				const gizmo3d = schema.gizmo3d;
				
				if(gizmo3d) {
					this.addComponent('Mesh', {
						mesh: this.root.resolveAssetId(gizmo3d.mesh),
						materials: gizmo3d.materials.map(path => this.root.resolveAssetId(path)),
						__editorOnly: true,
						castShadow: false,
						receiveShadow: false
					}, {
						doUpdateAll: false
					});
				}
			})
		}
		
		for (const component of components) {
			const mgr = this.getComponent(component.type);
			
			try {
				if(mgr) {
					mgr.component = component;
					
					if(component.enabled)
						await mgr.updateComponent?.(force);
				} else {
					const schema = D3DComponents[component.type];
					const inst = new schema.manager(this, component);
					this.__componentInstances[type] = inst;
					
					inst.component = component;
					
					if(component.enabled)
						await inst.updateComponent?.(force);
				}
			}catch(e) {
				D3DConsole.error(`[${this.name}][${component.type}]`, 'Error updating component:', e);
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
					
					const symbol = { symbolId, file, objData: (symbolData.objData || symbolData) };
					
					if(!this.root.__symbols[symbolId])
						this.root.__symbols[symbolId] = symbol;
					else
						Object.assign(this.root.__symbols[symbolId], symbol);
				} catch(e) {
					console.warn('Failed to parse', rel, `SD[$$'${serializedData}']`, e);
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
		
		if(!a && uuid)
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
			console.trace(`Can't resolve asset id for path ${path}`);
		
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
			d3dobject.layer = objData.layer;
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
						console.log(child.name + ' is no longer needed');
						child.forceDelete();
					}
				})
			}
			
			d3dobject.__finishedSyncing = true;
		}
		await syncWithObjData(this, symbol.objData);
	}
	
	setParent(d3dobject, opts = {}) {
		if(d3dobject == this.parent) {
			console.warn('Cant set parent already is parent', this.name, this.parent?.name);
			return;
		}
		
		if(this.parent && this.parent.children.includes(this)) {
			// Delete parent -> child reference
			if(this.parent[this.name] === this)
				delete this.parent[this.name];
			
			// Remove from current parent
			this.parent.children.splice(this.parent.children.indexOf(this), 1);
		}
		
		let currentWorldMatrix = null;
		if(opts.keepWorldTranform ?? true) {
			currentWorldMatrix = this.object3d.matrixWorld.clone();
		}
		
		this.parent = d3dobject;
		
		// Assign parent -> child reference
		if(this.parent[this.name] === undefined)
			this.parent[this.name] = this;
		else {
			// Force re-referencing for duplication
			this.name = this.name;
		}
		
		if(!d3dobject.children.includes(this))
			d3dobject.children.push(this);
		
		if(d3dobject.object3d && this.object3d)
			d3dobject.object3d.add(this.object3d);
		
		if(opts.keepWorldTranform ?? true) {
			if(d3dobject) {
				d3dobject.object3d.updateMatrixWorld(true);
				
				const invParent = new THREE.Matrix4()
				.copy(d3dobject.object3d.matrixWorld).invert();
				
				const local = new THREE.Matrix4()
				.multiplyMatrices(invParent, currentWorldMatrix);
				
				local.decompose(
					this.object3d.position, 
					this.object3d.quaternion, 
					this.object3d.scale
				);
				
				this.object3d.updateMatrixWorld(true);
			}else{
				this.object3d.matrix.copy(currentWorldMatrix);
				this.object3d.matrix.decompose(
					this.object3d.position, 
					this.object3d.quaternion, 
					this.object3d.scale
				);
				this.object3d.updateMatrixWorld(true);
			}
		}
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
			layer: this.layer,
			enabled: this.enabled,
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
			visible: this._visible,
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
	
	find(path) {
		if(typeof path !== 'string' || !path)
			return undefined;
		
		const parts = path.split('.').filter(p => p.length);
		let node = this;
		
		for (const part of parts) {
			if (!node.children || !node.children.length)
				return undefined;
			
			node = node.children.find(child => child.name === part);
			if (!node)
				return undefined;
		}
		
		return node;
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
	worldToLocalDirection(dir) {
		const invQuat = new THREE.Quaternion().copy(this.quaternion).invert();
		return dir.clone().applyQuaternion(invQuat);
	}
	localToWorldDirection(dir) {
		return dir.clone().applyQuaternion(this.quaternion);
	}
	
	disposeAllRigidbodies() {
		this.traverse(o => o._rigidbody?.dispose());
	}
	removeAllChildren(force = true) {
		const children = [...this.children];
		children.forEach(d3dobj => d3dobj.remove(force));
	}
	forceDelete() {
		this.forceRemove();
	}
	delete(force = false) {
		this.remove(force);
	}
	forceRemove() {
		this.remove(true);
	}
	destroy() {
		this.forceRemove();
	}
	destroyChildren() {
		this.removeAllChildren(true);
	}
	remove(force = false) {
		if(this.parent == null)
			throw new Error("Can't delete _root");
			
		if(!force && this.parent != this.root && (this.__auto_gltf || this.hasComponent('SubMesh')) ) {
			if(window._editor) {
				_editor.showError({
					title: 'Delete',
					message: 'This object can not be deleted because it is part of a 3D model'
				});
			}
			console.error("Can't delete managed object");
			return;
		}
		
		this.disposeAllRigidbodies();
		
		const idx = this.parent.children.indexOf(this);
		
		if(idx < 0)
			throw new Error("Parent doesn't contain child?");
			
		this.parent.children.splice(idx, 1);
		
		if(this.parent.object3d)
			this.parent.object3d.remove(this.object3d);
		
		this.__deleted = true;
		
		delete this.parent[this.name];
		delete _root.superIndex[this.uuid];
		
		_root.updateSuperIndex();
		
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
		if(this[str] !== undefined && !(this[str] instanceof D3DObject))
			return false;
		
		return !protectedNames.includes(str) && this.isValidName(str);
	}
	
	setAnimatedTransform({position, quaternion, scale, weight, smoothing}) {
		if(!this.__preAnimationTransform) {
			this.__preAnimationTransform = {
				position: this.position.clone(),
				rotation: this.rotation.clone(),
				quaternion: this.quaternion.clone(),
				scale: this.scale.clone()
			}
		}
		
		let _pos, _qua, _scl;
		
		if(weight < 1) {
			if(position)
				_pos = this.position.clone().lerp(position, weight);
			
			if(quaternion)
				_qua = this.quaternion.clone().slerp(quaternion, weight);
			
			if(scale)
				_scl = this.scale.clone().lerp(scale, weight);
		}else{
			_pos = position;
			_qua = quaternion;
			_scl = scale;
		}
		
		if(smoothing > 0) {
			const s = Math.max(30 * (1 - smoothing), 1);
			const d = Math.min(_time.delta * s, 1);
			
			if(_pos)
				_pos = this.position.clone().lerp(_pos, d);
			
			if(_qua)
				_qua = this.quaternion.clone().slerp(_qua, d);
			
			if(_scl)
				_scl = this.scale.clone().lerp(_scl, d);
		}
		
		if(_pos)
			this.position = _pos;
		
		if(_qua)
			this.quaternion = _qua;
			
		if(_scl)
			this.scale = _scl;
	}
	resetAnimationTransform() {
		if(this.__preAnimationTransform) {
			this.position = this.__preAnimationTransform.position;
			this.quaternion = this.__preAnimationTransform.quaternion;
			this.scale = this.__preAnimationTransform.scale;
			
			this.__preAnimationTransform = null;
		}
	}
	updateVisibility(force = false) {
		if(!this.object3d)
			return;
		
		let v = this.visible;
		
		if(window._editor && this.__editorState?.hidden === true)
			v = false;
		
		if(this.__lastOpacity != this.opacity || force) {
			let o = 1;
			let p = this;
			while(p) {
				o *= p.opacity;
				p = p.parent;
			}
			
			applyOpacity(this.object3d, o);
			
			this.children.forEach(c => c.updateVisibility(true));
			
			this.__lastOpacity = this.opacity;
		}
		
		this.object3d.visible = v;
	}
	
	getNextHighestDepth() {
		let depth = -Infinity;
		this.children.forEach(d3dobj => {
			if(d3dobj.__temp) return;
			
			const d = d3dobj.depth;
			if(d > depth)
				depth = d;
		});
		
		if(!Number.isFinite(depth))
			return 0;
		
		return depth + 1;
	}
	getNextLowestDepth() {
		let depth = Infinity;
		this.children.forEach(d3dobj => {
			if(d3dobj.__temp) return;
			
			const d = d3dobj.depth;
			if(d < depth)
				depth = d;
		});
		
		if(!Number.isFinite(depth))
			return 0;
			
		return depth - 1;
	}
	invalidateGraphic2D() {
		if(!this.is2D)
			return;
		
		_host.renderer2d._dirty = true;
	}
	hitTest({x, y}) {
		if(this.hasComponent('Container2D')) {
			let hit = false;
			
			for(let d3dchild of this.children) {
				if(d3dchild.hitTest({x, y})) {
					hit = true;
					break;
				}
			}
			
			return hit;
		}else
		if(this.hasComponent('Graphic2D')) {
			return this.getComponent('Graphic2D').hitTest({x, y});
		}
		
		throw new Error(`${this.name} can not be used for 2D hit testing`);
	}
	hitTestPoint({x, y}) {
		if(!this.rendered)
			return false;
			
		if(this.hasComponent('Container2D')) {
			let hit = false;
			
			for(let d3dchild of this.children) {
				if(d3dchild.hitTestPoint({x, y})) {
					hit = true;
					break;
				}
			}
			
			return hit;
		}else
		if(this.hasComponent('Graphic2D')) {
			return this.getComponent('Graphic2D').hitTestPoint({x, y});
		}
		
		throw new Error(`${this.name} can not be used for 2D hit testing`);
	}
	setPosition(newPosition) {
		const oldPosition = this.position.clone();
		
		this.__spOldPosition = oldPosition;
		this.position.copy(newPosition);
		
		_events.invoke(
			'transform-changed', 
			this, 
			['pos'], 
			{
				position: oldPosition,
				rotation: this.rotation.clone(),
				quaternion: this.quaternion.clone(),
				scale: this.scale.clone()
			}
		);
	}
	setRotation(newRotation) {
		const oldRotation = this.rotation.clone();
		const oldRotationQ = this.quaternion.clone();
		
		this.__spOldRotation = oldRotation;
		this.rotation.copy(newRotation);
		
		_events.invoke(
			'transform-changed', 
			this, 
			['rot'], 
			{
				position: this.position.clone(),
				rotation: oldRotation,
				quaternion: oldRotationQ,
				scale: this.scale.clone()
			}
		);
	}
	setScale(newScale) {
		const oldScale = this.scale.clone();
		
		this.__spOldScale = oldScale;
		this.scale.copy(newScale);
		
		_events.invoke(
			'transform-changed', 
			this, 
			['scl'], 
			{
				position: this.position.clone(),
				rotation: this.rotation.clone(),
				quaternion: this.quaternion.clone(),
				scale: oldScale
			}
		);
	}
	localToWorld(vec) {
		const out = new THREE.Vector3();
		return out.copy(vec).applyMatrix4(this.object3d.matrixWorld);
	}
	worldToLocal(vec) {
		const out = new THREE.Vector3();
		return out.copy(vec).applyMatrix4(this.object3d.matrixWorldInverse);
	}
	localToWorldQuaternion(q) {
		const out = new THREE.Quaternion();
		const parentQ = new THREE.Quaternion();
		
		this.object3d.getWorldQuaternion(out);      // world rotation of this object
		this.object3d.getWorldQuaternion(parentQ);  // same thing; we need parent below
		
		// worldQ = parentWorldQ * localQ
		if (this.object3d.parent) {
			this.object3d.parent.getWorldQuaternion(parentQ);
			return out.copy(parentQ).multiply(q);
		} else {
			// no parent → same
			return out.copy(q);
		}
	}
	worldQuaternionToLocal(qWorld) {
		const out = new THREE.Quaternion();
		const parentQ = new THREE.Quaternion();
	
		if (this.object3d.parent) {
			this.object3d.parent.getWorldQuaternion(parentQ);
			parentQ.invert();
			return out.copy(parentQ).multiply(qWorld);
		}
	
		// no parent → same
		return out.copy(qWorld);
	}
	worldEulerToLocal(e) {
		const qWorld = new THREE.Quaternion()
			.setFromEuler(new THREE.Euler(e.x, e.y, e.z, 'XYZ'));
		const qLocal = this.worldQuatToLocal(qWorld);
		const out = new THREE.Euler().setFromQuaternion(qLocal, 'XYZ');
		return { x: out.x, y: out.y, z: out.z };
	}
	localEulerToWorld(e) {
		const qLocal = new THREE.Quaternion()
			.setFromEuler(new THREE.Euler(e.x, e.y, e.z, 'XYZ'));
		const qWorld = this.localQuatToWorld(qLocal);
		const out = new THREE.Euler().setFromQuaternion(qWorld, 'XYZ');
		return { x: out.x, y: out.y, z: out.z };
	}
	localDirToWorld(dirLocal) {
		const out = dirLocal.clone();
		// apply world rotation only (no translation!)
		out.applyQuaternion(this.object3d.getWorldQuaternion(new THREE.Quaternion()));
		return out;
	}
	worldDirToLocal(dirWorld) {
		const out = dirWorld.clone();
		// inverse world rotation converts to local space
		const wq = this.object3d.getWorldQuaternion(new THREE.Quaternion()).invert();
		out.applyQuaternion(wq);
		return out;
	}
	
	addEventListener(name, listener) {
		const events = this.__events;
		
		if(!events[name])
			events[name] = [];
		
		const listeners = events[name];
		
		if(listeners.includes(listener))
			return;
		
		listeners.push(listener);
	}
	removeEventListener(name, listener) {
		const events = this.__events;
		
		if(!events[name])
			return;
		
		const listeners = events[name];
		
		if(!listeners.includes(listener))
			return;
		
		listeners.splice(listeners.indexOf(listener), 1);
	}
	invokeEvent(name, ...params) {
		const events = this.__events;
		
		if(!events[name])
			return;
			
		const listeners = events[name];
		
		listeners.forEach(l => {
			if(l && typeof l === 'function')
				l(...params);
		});
	}
	updateSuperIndex() {
		if(this != _root) return;
		this.superObjects = Object.values(this.superIndex);
		this.superObjectsThree = this.superObjects.map(o => o.object3d);
		_events.invoke('super-index-update');
	}
	getIsRendered() {
		if(!this.visible)
			return false;
		
		for(let o = this.parent; !!o; o = o.parent) {
			if(!o.visible)
				return false;
		}
		
		return true;
	}
}