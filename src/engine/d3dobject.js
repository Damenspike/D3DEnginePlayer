// d3dobject.js
import axios from 'axios';
import D3DZip from './d3dzip.js';
import DamenScript from './damenscript.js';
import D3DComponents from './d3dcomponents.js';
import D3DConsole from './d3dconsole.js';
import D3DPromise from './d3dpromise.js';
import D3DWebsocket from './d3dwebsocket.js';
import D3DWebRTC from './d3dwebrtc.js';
import D3DLocalStorage from './d3dlocalstorage.js';
import D3DFileCache from './d3dfilecache.js';
import D3DVector3 from './d3dvector3.js';
import D3DVector2 from './d3dvector2.js';
import D3DQuaternion from './d3dquaternion.js';
import D3DEuler from './d3deuler.js';
import Tween from './d3dtween.js';
import { v4 as uuidv4 } from 'uuid';
import {
	getExtension,
	applyOpacity,
	applyTextureToSceneBackground,
	forSeconds,
	forFrames,
	relNoAssets,
	relNoExt,
	makeRegexAdapter
} from './d3dutility.js';
import {
	protectedNames
} from './d3dmetaobject.js';

import * as D2DUtility from './d2dutility.js';

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
		this._visible2 = true;
		this._visible3 = true;
		this.hindex = 0;
		
		// INTERNAL SENSITIVE VARS
		this.__ready = false;
		this.__componentInstances = {};
		this.__events = {};
		this.__loops = {};
		
		this.object3d = this.parent ? new THREE.Object3D() : new THREE.Scene();
		this.object3d.userData.d3dobject = this;
		this.__d3d = true;
		
		if(this == _root) {
			// ROOT ONLY
			this.dirtyAssets = [];
		}
		
		this.setupDefaultMethods();
	}
	
	/* 
	 * =========================
	 * LOOPS
	 * ======================= 
	 */
	get __onInternalStart() {
		return this.__loops.__onInternalStart;
	}
	set __onInternalStart(f) {
		this.__setLoop('__onInternalStart', f);
	}
	
	get __onStart() {
		return this.__loops.__onStart;
	}
	set __onStart(f) {
		this.__setLoop('__onStart', f);
	}
	
	get onStart() {
		return this.__loops.onStart;
	}
	set onStart(f) {
		this.__setLoop('onStart', f);
	}
	
	/* =========================
	 * EDITOR: START
	 * ======================= */
	
	get __onEditorStart() {
		return this.__loops.__onEditorStart;
	}
	set __onEditorStart(f) {
		this.__setLoop('__onEditorStart', f);
	}
	
	get onEditorStart() {
		return this.__loops.onEditorStart;
	}
	set onEditorStart(f) {
		this.__setLoop('onEditorStart', f);
	}
	
	/* =========================
	 * GRAPHICS READY
	 * ======================= */
	
	get __onInternalGraphicsReady() {
		return this.__loops.__onInternalGraphicsReady;
	}
	set __onInternalGraphicsReady(f) {
		this.__setLoop('__onInternalGraphicsReady', f);
	}
	
	get __onGraphicsReady() {
		return this.__loops.__onGraphicsReady;
	}
	set __onGraphicsReady(f) {
		this.__setLoop('__onGraphicsReady', f);
	}
	
	get onGraphicsReady() {
		return this.__loops.onGraphicsReady;
	}
	set onGraphicsReady(f) {
		this.__setLoop('onGraphicsReady', f);
	}
	
	/* =========================
	 * PHYSICS UPDATE
	 * ======================= */
	
	get __onInternalPhysicsUpdate() {
		return this.__loops.__onInternalPhysicsUpdate;
	}
	set __onInternalPhysicsUpdate(f) {
		this.__setLoop('__onInternalPhysicsUpdate', f);
	}
	
	get __onPhysicsUpdate() {
		return this.__loops.__onPhysicsUpdate;
	}
	set __onPhysicsUpdate(f) {
		this.__setLoop('__onPhysicsUpdate', f);
	}
	
	get onPhysicsUpdate() {
		return this.__loops.onPhysicsUpdate;
	}
	set onPhysicsUpdate(f) {
		this.__setLoop('onPhysicsUpdate', f);
	}
	
	/* =========================
	 * ENTER FRAME
	 * ======================= */
	
	get __onInternalEnterFrame() {
		return this.__loops.__onInternalEnterFrame;
	}
	set __onInternalEnterFrame(f) {
		this.__setLoop('__onInternalEnterFrame', f);
	}
	
	get __onEnterFrame() {
		return this.__loops.__onEnterFrame;
	}
	set __onEnterFrame(f) {
		this.__setLoop('__onEnterFrame', f);
	}
	
	get onEnterFrame() {
		return this.__loops.onEnterFrame;
	}
	set onEnterFrame(f) {
		this.__setLoop('onEnterFrame', f);
	}
	
	/* =========================
	 * BEFORE RENDER
	 * ======================= */
	
	get __onInternalBeforeRender() {
		return this.__loops.__onInternalBeforeRender;
	}
	set __onInternalBeforeRender(f) {
		this.__setLoop('__onInternalBeforeRender', f);
	}
	
	get __onBeforeRender() {
		return this.__loops.__onBeforeRender;
	}
	set __onBeforeRender(f) {
		this.__setLoop('__onBeforeRender', f);
	}
	
	get onBeforeRender() {
		return this.__loops.onBeforeRender;
	}
	set onBeforeRender(f) {
		this.__setLoop('onBeforeRender', f);
	}
	
	/* =========================
	 * EXIT FRAME
	 * ======================= */
	
	get __onInternalExitFrame() {
		return this.__loops.__onInternalExitFrame;
	}
	set __onInternalExitFrame(f) {
		this.__setLoop('__onInternalExitFrame', f);
	}
	
	get __onExitFrame() {
		return this.__loops.__onExitFrame;
	}
	set __onExitFrame(f) {
		this.__setLoop('__onExitFrame', f);
	}
	
	get onExitFrame() {
		return this.__loops.onExitFrame;
	}
	set onExitFrame(f) {
		this.__setLoop('onExitFrame', f);
	}
	
	/* =========================
	 * EDITOR: ENTER FRAME
	 * ======================= */
	
	get __onEditorEnterFrame() {
		return this.__loops.__onEditorEnterFrame;
	}
	set __onEditorEnterFrame(f) {
		this.__setLoop('__onEditorEnterFrame', f);
	}
	
	get onEditorEnterFrame() {
		return this.__loops.onEditorEnterFrame;
	}
	set onEditorEnterFrame(f) {
		this.__setLoop('onEditorEnterFrame', f);
	}
	
	/* =========================
	 * EDITOR: BEFORE RENDER
	 * ======================= */
	
	get __onEditorBeforeRender() {
		return this.__loops.__onEditorBeforeRender;
	}
	set __onEditorBeforeRender(f) {
		this.__setLoop('__onEditorBeforeRender', f);
	}
	
	get onEditorBeforeRender() {
		return this.__loops.onEditorBeforeRender;
	}
	set onEditorBeforeRender(f) {
		this.__setLoop('onEditorBeforeRender', f);
	}
	
	/* =========================
	 * EDITOR: EXIT FRAME
	 * ======================= */
	
	get __onEditorExitFrame() {
		return this.__loops.__onEditorExitFrame;
	}
	set __onEditorExitFrame(f) {
		this.__setLoop('__onEditorExitFrame', f);
	}
	
	get onEditorExitFrame() {
		return this.__loops.onEditorExitFrame;
	}
	set onEditorExitFrame(f) {
		this.__setLoop('onEditorExitFrame', f);
	}
	
	///////////////////////////////
	// Getters and setters only
	///////////////////////////////
	get deleted() {
		return !!this.__deleted;
	}
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
				this.disposeAllComponents();
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
	
	get layersMask() {
		return this.object3d?.layers.mask ?? 1;
	}
	set layersMask(mask) {
		const obj = this.object3d;
		if(!obj)
			return;
	
		// always force layer 0 ON
		obj.layers.mask = (mask | 1) | 0;
		
		this.checkSymbols();
		this.checkInstancedSubmeshes();
	}
	
	get worldPosition() {
		if(this.is2D) {
			const M = D2DUtility.worldMatrix(this);
			return new THREE.Vector3(M.e, M.f, Number(this.position?.z || 0));
		}
		return this.object3d.getWorldPosition(new THREE.Vector3());
	}
	set worldPosition({ x, y, z }) {
		if(this.is2D) {
			if(Number.isNaN(x) || Number.isNaN(y)) return;
	
			const parent = this.parent || null;
			const MinvP = D2DUtility.invert(D2DUtility.worldMatrix(parent));
			const lp = D2DUtility.applyMat(MinvP, x, y);
	
			this.position = this.position || { x:0, y:0, z:0 };
			this.position.x = lp.x;
			this.position.y = lp.y;
			return;
		}
	
		if(Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
	
		if(this.parent)
			this.parent.object3d.updateWorldMatrix(true, false);
	
		const targetW = new THREE.Vector3(x, y, z);
		if(this.parent)
			this.parent.object3d.worldToLocal(targetW);
	
		this.object3d.position.copy(targetW);
		this.object3d.updateMatrixWorld(true);
	}
	
	get worldRotation() {
		if(this.is2D) {
			const M = D2DUtility.worldMatrix(this);
			const ang = Math.atan2(M.b, M.a);
			return new THREE.Vector3(0, 0, ang);
		}
	
		const q = this.object3d.getWorldQuaternion(new THREE.Quaternion());
		const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
		return new THREE.Vector3(e.x, e.y, e.z);
	}
	set worldRotation({ x, y, z }) {
		if(this.is2D) {
			if(Number.isNaN(z)) return;
	
			const parent = this.parent || null;
			const Mp = D2DUtility.worldMatrix(parent);
			const parentAng = Math.atan2(Mp.b, Mp.a);
	
			this.rotation = this.rotation || { x:0, y:0, z:0 };
			this.rotation.z = z - parentAng;
			return;
		}
	
		if(Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
	
		if(this.parent)
			this.parent.object3d.updateWorldMatrix(true, false);
	
		const targetEuler = new THREE.Euler(x, y, z, 'XYZ');
		const targetQ = new THREE.Quaternion().setFromEuler(targetEuler);
	
		if(this.parent) {
			const parentQ = this.parent.object3d.getWorldQuaternion(new THREE.Quaternion());
			parentQ.invert();
			targetQ.multiply(parentQ);
		}
	
		this.object3d.quaternion.copy(targetQ);
		this.object3d.updateMatrixWorld(true);
	}
	
	get worldScale() {
		if(this.is2D) {
			const M = D2DUtility.worldMatrix(this);
			const sx = Math.hypot(M.a, M.b);
			const sy = Math.hypot(M.c, M.d);
			return new THREE.Vector3(sx, sy, 1);
		}
	
		const ws = new THREE.Vector3();
		this.object3d.updateWorldMatrix(true, true);
		this.object3d.getWorldScale(ws);
		return ws;
	}
	set worldScale({ x, y, z }) {
		if(this.is2D) {
			if(Number.isNaN(x) || Number.isNaN(y)) return;
	
			const parent = this.parent || null;
			const Mp = D2DUtility.worldMatrix(parent);
	
			const psx = Math.hypot(Mp.a, Mp.b) || 1;
			const psy = Math.hypot(Mp.c, Mp.d) || 1;
	
			this.scale = this.scale || { x:1, y:1, z:1 };
			this.scale.x = x / psx;
			this.scale.y = y / psy;
			return;
		}
	
		if(Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
	
		const parentScale = new THREE.Vector3(1, 1, 1);
		if(this.object3d.parent)
			this.object3d.parent.getWorldScale(parentScale);
	
		this.object3d.scale.set(
			x / parentScale.x,
			y / parentScale.y,
			z / parentScale.z
		);
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
	
	get worldYaw() {
		return this.worldAttitude.yaw;
	}
	set worldYaw(v) {
		const a = this.worldAttitude;
		this.worldAttitude = {
			pitch: a.pitch,
			yaw: v,
			bank: a.bank
		};
	}
	
	get worldPitch() {
		return this.worldAttitude.pitch;
	}
	set worldPitch(v) {
		const a = this.worldAttitude;
		this.worldAttitude = {
			pitch: v,
			yaw: a.yaw,
			bank: a.bank
		};
	}
	
	get worldBank() {
		return this.worldAttitude.bank;
	}
	set worldBank(v) {
		const a = this.worldAttitude;
		this.worldAttitude = {
			pitch: a.pitch,
			yaw: a.yaw,
			bank: v
		};
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
	
	get scale() {
		return this.object3d.scale;
	}
	set scale({x, y, z}) {
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
			return;
		this.object3d.scale.set(x, y, z);
	}
	
	get visible() {
		return this._visible && this._visible2 && this._visible3;
	}
	set visible(value) {
		this._visible = !!value;
		this.updateVisibility();
		this.onVisibilityChanged?.();
		this._onVisibilityChanged?.();
		this.checkSymbols();
		this.checkInstancedSubmeshes();
	}
	
	get visible2() {
		return this._visible2 ?? true;
	}
	set visible2(value) {
		this._visible2 = !!value;
		this.updateVisibility();
		this.onVisibilityChanged?.();
		this._onVisibilityChanged?.();
		this.checkSymbols();
		this.checkInstancedSubmeshes();
	}
	
	get visible3() {
		return this._visible3 ?? true;
	}
	set visible3(value) {
		this._visible3 = !!value;
		this.updateVisibility();
		this.onVisibilityChanged?.();
		this._onVisibilityChanged?.();
		this.checkSymbols();
		this.checkInstancedSubmeshes();
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
		let p = this;
		const stop = this.root;
		let guard = 0;
		
		while(p.parent && p.parent !== stop) {
			p = p.parent;
			if(++guard > 1000)
				break;
		}
		
		return p;
	}
	get _rootParent() {
		let p = this;
		const stop = _root;
		let guard = 0;
		
		while(p.parent && p.parent !== stop) {
			p = p.parent;
			if(++guard > 1000)
				break;
		}
		
		return p;
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
		this.checkInstancedSubmeshes();
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
	get path() {
		return this.rootTree.join('.');
	}
	get rootTree() {
		// root of this object only
		let r = this;
		const names = [];
		while(r) {
			names.push(r.name);
			
			if(!r || r == _root)
				break;
			
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
	
	get localForward() {
		const fwd = THREE.Vector3.forward.clone();
		fwd.applyQuaternion(this.object3d.quaternion);
		return fwd;
	}
	
	get localRight() {
		const right = THREE.Vector3.right.clone();
		right.applyQuaternion(this.object3d.quaternion);
		return right;
	}
	
	get localUp() {
		const up = THREE.Vector3.up.clone();
		up.applyQuaternion(this.object3d.quaternion);
		return up;
	}
	
	get is3D() {
		return !this.is2D;
	}
	get is2D() {
		return this.graphic2d || this.container2d;
	}
	get isLight() {
		return (
			this.object3d?.isDirectionalLight ||
			this.object3d?.isAmbientLight ||
			this.object3d?.isPointLight ||
			this.object3d?.isSpotLight ||
			this.object3d?.isHemisphereLight ||
			this.object3d?.isRectAreaLight
		);
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
			this.__tmpPos ??= new THREE.Vector3();
			this.__tmpRot ??= new THREE.Quaternion();
			this.__tmpScl ??= new THREE.Vector3();
		
			this.__tmpLastPos ??= new THREE.Vector3();
			this.__tmpLastRot ??= new THREE.Quaternion();
			this.__tmpLastScl ??= new THREE.Vector3();
		
			this.lastMatrixLocal ??= new THREE.Matrix4();
		
			this.__onEditorEnterFrame = () => {
				this.__onEditorEnterFrameComponents?.();
				
				if(!this.object3d)
					return;
		
				// first frame seed
				if(!this.__hasLastMatrixLocal) {
					this.lastMatrixLocal.copy(this.object3d.matrix);
					this.__hasLastMatrixLocal = true;
					return;
				}
		
				// cheap early-out (no decompose, no allocations)
				if(this.object3d.matrix.equals(this.lastMatrixLocal)) {
					if(this.__finishedSyncing) {
						this.__syncing = false;
						this.__finishedSyncing = false;
					}
					if(this.symbol && this.__dirtySymbol && !this.__syncing) {
						this.syncToSymbol();
						this.__dirtySymbol = false;
					}
					return;
				}
		
				// only now do the decomposes
				const pos = this.__tmpPos;
				const rot = this.__tmpRot;
				const scl = this.__tmpScl;
		
				const lastPos = this.__tmpLastPos;
				const lastRot = this.__tmpLastRot;
				const lastScl = this.__tmpLastScl;
		
				this.object3d.matrix.decompose(pos, rot, scl);
				this.lastMatrixLocal.decompose(lastPos, lastRot, lastScl);
		
				let changed = null;
		
				if(!pos.equals(lastPos)) (changed ??= []).push('pos');
				if(!rot.equals(lastRot)) (changed ??= []).push('rot');
				if(!scl.equals(lastScl)) (changed ??= []).push('scl');
		
				if(changed) {
					this.__onTransformationChange?.(changed);
					this.onTransformationChange?.(changed);
		
					if(window._editor) {
						if(_editor.selectedObjects.includes(this))
							_editor.updateInspector();
					}
					
					this.invokeEvent('matrixChanged', changed);
				}
		
				this.lastMatrixLocal.copy(this.object3d.matrix);
		
				if(this.__finishedSyncing) {
					this.__syncing = false;
					this.__finishedSyncing = false;
				}
				if(this.symbol && this.__dirtySymbol && !this.__syncing) {
					this.syncToSymbol();
					this.__dirtySymbol = false;
				}
			};
		
			this.__onTransformationChange = () => {
				if(window._editor && (_editor.focus == this || _editor.focus == this.parent) )
					this.checkSymbols();
				
				this.checkInstancedSubmeshes();
			};
		}
		
		this.__onInternalStart = null;
		this.__onInternalBeforeRender = null;
		this.__onInternalEnterFrame = null;
		this.__onInternalExitFrame = null;
		this.__onInternalPhysicsUpdate = null;
		
		const managers = Object.values(this.__componentInstances);
		
		if(managers.length > 0) {
			if(managers.find(mgr => !!mgr.__onInternalStart)) {
				this.__onInternalStart = () => {
					//////////////////////////////////////////////
					//// ENGINE OBJ START EVENT USED FOR INTERNALS
					//////////////////////////////////////////////
					for(let i in this.__componentInstances) {
						const mgr = this.__componentInstances[i];
						mgr?.__onInternalStart?.();
					}
				}
			}
			
			if(managers.find(mgr => !!mgr.__onInternalBeforeRender)) {
				this.__onInternalBeforeRender = () => {
					//////////////////////////////////////////////
					//// ENGINE LOOP USED FOR INTERNALS
					//////////////////////////////////////////////
					for(let i in this.__componentInstances) {
						const mgr = this.__componentInstances[i];
						
						if(mgr?.component?.enabled)
							mgr?.__onInternalBeforeRender?.();
					}
				}
			}
			
			if(managers.find(mgr => !!mgr.__onInternalEnterFrame)) {
				this.__onInternalEnterFrame = () => {
					//////////////////////////////////////////////
					//// ENGINE LOOP USED FOR INTERNALS
					//////////////////////////////////////////////
					for(let i in this.__componentInstances) {
						const mgr = this.__componentInstances[i];
						
						if(mgr?.component?.enabled)
							mgr?.__onInternalEnterFrame?.();
					}
				}
			}
			
			if(managers.find(mgr => !!mgr.__onInternalExitFrame)) {
				this.__onInternalExitFrame = () => {
					//////////////////////////////////////////////
					//// ENGINE LOOP USED FOR INTERNALS
					//////////////////////////////////////////////
					for(let i in this.__componentInstances) {
						const mgr = this.__componentInstances[i];
						
						if(mgr?.component?.enabled)
							mgr?.__onInternalExitFrame?.();
					}
				}
			}
			
			if(managers.find(mgr => !!mgr.__onInternalPhysicsUpdate)) {
				this.__onInternalPhysicsUpdate = () => {
					//////////////////////////////////////////////
					//// ENGINE LOOP USED FOR INTERNALS
					//////////////////////////////////////////////
					for(let i in this.__componentInstances) {
						const mgr = this.__componentInstances[i];
						
						if(mgr?.component?.enabled)
							mgr?.__onInternalPhysicsUpdate?.();
					}
				}
			}
			
			if(managers.find(mgr => !!mgr.__onEditorEnterFrame)) {
				this.__onEditorEnterFrameComponents = () => {
					//////////////////////////////////////////////
					//// ENGINE LOOP USED FOR INTERNALS
					//////////////////////////////////////////////
					for(let i in this.__componentInstances) {
						const mgr = this.__componentInstances[i];
						
						if(mgr?.component?.enabled)
							mgr?.__onEditorEnterFrame?.();
					}
				}
			}
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
				console.warn(`Symbol doesn't exist ${objData.symbolId}`)
				return;
			}
			if(!symbol.objData) {
				console.warn(`Symbol data is missing ${objData.symbolId}`)
				return;
			}
			
			const symbolCopy = structuredClone(symbol.objData);
			
			objData.children = symbolCopy.children;
			objData.components = symbolCopy.components;
			objData.suuid = symbolCopy.suuid;
			objData.script = symbolCopy.script;
			objData.layersMask = Number(symbolCopy.layersMask) | 0;
			objData.hindex = symbolCopy.hindex;
			
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
		child.layersMask = objData.layersMask | 0;
		child.hindex = Number(objData.hindex) || 0;
		
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
		}
		
		_events.invoke('world-add-object', this);
		
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
		if(opts?.updateComponents !== false)
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
		
		const d3dobject = await this.createObject(objData, opts);
		
		return d3dobject;
	}
	
	async load(uri) {
		let buffer;
	
		this.fileMeta = { bytesTotal: 0, bytesLoaded: 0 };
		this.__origin = uri;
		this.__symbols = {};
		
		this.destroyChildren();
		
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
	
			console.log('D3D file loaded, size:', uri, buffer.length, 'bytes');
	
			this.__loaded = true;
			this.onLoad?.();
			this.invokeEvent('load');
		}
	
		return buffer;
	}
	
	async getZipInstance(buffer) {
		const origin = this.__origin;
		const cacheEnabled = window._player && origin;
		let zip;
		
		if(cacheEnabled) {
			if(!_root.__zipInstances)
				_root.__zipInstances = {};
			
			const inst = _root.__zipInstances[origin];
			
			if(inst) {
				zip = inst.zip;
				if(zip) {
					if(!inst.d3dobjects.has(this))
						inst.d3dobjects.add(this);
						
					return zip;
				}
			}
		}
		
		zip = await new D3DZip().loadAsync(buffer);
		
		if(cacheEnabled) {
			if(!_root.__zipInstances)
				_root.__zipInstances = {};
				
			_root.__zipInstances[origin] = { zip, d3dobjects: new Set([this]) };
		}
		
		return zip;
	}
	unlinkFromZipInstance() {
		if(!_root.__zipInstances)
			return;
		
		const origin = this.__origin;
		const inst = _root.__zipInstances[origin];
		
		if(!inst) 
			return;
			
		if(inst.d3dobjects.has(this))
			inst.d3dobjects.delete(this);
			
		if(inst.d3dobjects.size < 1) {
			inst.zip.terminate();
			_root.__zipInstances[origin] = null;
			delete _root.__zipInstances[origin];
		}
	}
	
	async loadFromZip(buffer) {
		// No need for await import, using required modules
		const zip = await this.getZipInstance(buffer);
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
			
		const defaultBg = new THREE.Color('#000000');
		
		try {
			const bgType = scene.background?.type;
			
			if(bgType == 'none') {
				this.object3d.background = defaultBg;
			}
			if(bgType == 'color') {
				this.object3d.background = new THREE.Color(scene.background.color || '#000000');
			}else
			if(bgType == 'texture') {
				if(!scene.background.textureAsset) {
					this.object3d.background = defaultBg;
				}else{
					await applyTextureToSceneBackground(
						overrideRoot ?? this.root,
						overrideZip ?? this.zip,
						this.object3d,
						scene.background.textureAsset
					)
				}
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
			
			if(window._editor && !_editor.fogEnabled)
				this.object3d.fog = null;
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
			RegEx: Object.freeze(makeRegexAdapter()),
			typeOf: Object.freeze((val) => typeof val),
			worldToScreen: Object.freeze(D2DUtility.worldToScreen),
			
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
				trace: (...args) => D3DConsole.trace(`[${this.name}]`, ...args),
				warn: (...args) => D3DConsole.warn(`[${this.name}]`, ...args),
				error: (...args) => D3DConsole.error(`[${this.name}]`, ...args),
				assert: (...args) => D3DConsole.assert(...args),
				clear: () => D3DConsole.clear()
			}),
			
			// THREE
			MathUtils: Object.freeze(THREE.MathUtils),
			Vector3: (...a) => new D3DVector3(...a),
			Vector2: (...a) => new D3DVector2(...a),
			Quaternion: (...a) => new D3DQuaternion(...a),
			Box3: (...a) => new THREE.Box3(...a),
			Matrix4: (...a) => new THREE.Matrix4(...a),
			Euler: (...a) => new D3DEuler(...a),
			Color: (...a) => new THREE.Color(...a),
			Raycaster: (...a) => new THREE.Raycaster(...a),
			Sphere: (...a) => new THREE.Sphere(...a),
			Plane: (...a) => new THREE.Plane(...a),
		});
		
		DamenScript.run(script, sandbox, { contextId: this.name })
		.catch(e => {
			if(!e.message.includes(this.name))
				e.message = `[${this.name}] ${e.message}`;
			
			D3DConsole.error(e.name, e.message);
			console.error(e);
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
		this.checkInstancedSubmeshes();
	}
	async createComponentManager(type) {
		const schema = D3DComponents[type];
		const component = this.getComponentObject(type);
		const inst = new schema.manager(this, component);
		
		inst.component = component;
		inst.d3dobject = this;
		
		Object.defineProperty(inst, 'enabled', {
			configurable: true,
			enumerable: true,
			get() {
				return inst.component.enabled;
			},
			set(v) {
				v = Boolean(v);
				inst.d3dobject.toggleComponent(type, v);
			}
		});
		
		this.__componentInstances[type] = inst;
		
		// Always setup
		if(typeof inst.setupComponent === 'function')
			await inst.setupComponent();
		
		return inst;
	}
	async addComponent(
		type, 
		properties = {}, 
		{ 
			doUpdateAll = true, 
			doUpdateSelf = false,
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
		
		if(unshift)
			this.components.unshift(component);
		else 
			this.components.push(component);
		
		// Create manager instance
		const inst = await this.createComponentManager(type);
		
		doUpdateAll && this.updateComponents();
		doUpdateSelf && inst.updateComponent();
		this.setupDefaultMethods();
		
		if(window._editor && !dontRecurseSymbols) {
			if(this.symbol) {
				// Add instances of this component to symbols
				this.root.traverse(d3dobject => {
					if(this !== d3dobject && d3dobject.symbol == this.symbol) {
						d3dobject.addComponent(type, properties, {
							dontRecurseSymbols: true
						});
					}
				});
			}
			
			this.checkSymbols();
			this.checkInstancedSubmeshes();
		}
	}
	async removeComponent(
		type, 
		{
			dontRecurseSymbols = false
		} = {}
	) {
		if(!this.getComponentObject(type))
			throw new Error(`Component ${type} does not exist on ${this.name}`);
			
		const mgr = this.getComponent(type);
		
		if(mgr && typeof mgr.dispose == 'function')
			await mgr.dispose();
		
		this.components.splice(this.components.findIndex(c => c.type == type), 1);
		
		if(this.__componentInstances[type])
			delete this.__componentInstances[type];
		
		if(window._editor && !dontRecurseSymbols) {
			if(this.symbol) {
				// Remove all instances of this component
				this.root.traverse(d3dobject => {
					if(this !== d3dobject && d3dobject.symbol == this.symbol) {
						d3dobject.removeComponent(type, {
							dontRecurseSymbols: true
						});
					}
				});
			}
			
			this.checkSymbols();
			this.checkInstancedSubmeshes();
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
		const mgr = this.getComponent(type);
		
		if(!mgr)
			return;
		
		const wasEnabled = mgr.component.enabled;
		
		if(wasEnabled === enabled)
			return;
		
		mgr.component.enabled = enabled;
		
		if(mgr) {
			mgr.dispose();
			mgr.__setup = false;
		}
		
		this.updateComponents(true);
		this.checkSymbols();
		this.checkInstancedSubmeshes();
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
		const components = [...this.components];
		
		components.sort((a, b) => {
			const p1 = D3DComponents[a.name]?.priority || 0;
			const p2 = D3DComponents[b.name]?.priority || 0;
			
			if(p1 == p2)
				return 0;
			if(p1 > p2)
				return 1;
			if(p1 < p2)
				return -1;
		});
		
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
						doUpdateAll: false,
						doUpdateSelf: true
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
					const inst = await this.createComponentManager(component.type);
					
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
			
			if(!a)
				this.markAssetDirty(rel);
			
			newAssetIndex.push({
				rel: rel,
				uuid: a?.uuid ?? uuidv4()
			});
		});
		
		this.assetIndex = newAssetIndex;
		
		if(!this.__lastAssetIndex)
			this.__lastAssetIndex = structuredClone(this.assetIndex);
	}
	markAssetDirty(rel) {
		if(this.dirtyAssets && !this.dirtyAssets.includes(rel))
			this.dirtyAssets.push(rel);
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
		
		// Symbol update locked
		if(this.__lockSymbols)
			return;
		
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
	
	checkInstancedSubmeshes() {
		if(!this.__flagInstancing)
			return;
		
		const submeshes = this.findAllComponents('SubMesh');
		
		submeshes.forEach(submesh => {
			if(submesh.instancing && submesh.instancingId) {
				_instancing.updateSubmeshMatrix(submesh.instancingId, submesh, true);
			}
		});
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
			console.log(`Can't resolve asset id for path ${path}`);
		
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
			d3dobject.layersMask = objData.layersMask | 0;
			d3dobject.hindex = objData.hindex;
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
	
	removeObject3D() {
		const obj = this.object3d;
		if(!obj)
			return;
		
		const parent = obj.parent;
		if(parent)
			parent.remove(obj);
	}
	addObject3D(parent = null) {
		const obj = this.object3d;
		if(!obj)
			return;
		
		if(!parent)
			parent = this.parent.object3d;
		
		if(!parent) {
			console.warn('Cant add object3d back to', this.name, ' as parent is no longer available.');
			return;
		}
		
		if(obj.parent !== parent)
			parent.add(obj);
	}
	replaceObject3D(newObject3D, { keepChildren = true } = {}) {
		const old = this.object3d;
		
		if (!old || old === newObject3D) 
			return;
		
		const pos = old.position.clone();
		const quat = old.quaternion.clone();
		const scl = old.scale.clone();
		
		const parent = this.parent.object3d;
		const oldIndex = parent ? parent.children.indexOf(old) : -1;
		
		newObject3D.name = old.name;
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
	
		// move children
		if (keepChildren && old.children.length) {
			for (const child of [...old.children]) newObject3D.add(child);
		}
	
		// set local transform (relative to SAME parent)
		newObject3D.position.copy(pos);
		newObject3D.quaternion.copy(quat);
		newObject3D.scale.copy(scl);
	
		// reparent into the same spot in the tree
		if (parent) {
			parent.remove(old);
			parent.add(newObject3D);
			
			if (oldIndex >= 0) {
				const arr = parent.children;
				const cur = arr.indexOf(newObject3D);
				if (cur !== -1 && cur !== oldIndex) {
					arr.splice(cur, 1);
					arr.splice(oldIndex, 0, newObject3D);
				}
			}
		}
		
		this.object3d = newObject3D;
		this.object3d.userData.d3dobject = this;
		this.object3d.updateMatrixWorld(true);
	}
	
	refreshObjectsWithResource(uri, force = false) {
		const uuid = this.resolveAssetId(uri);
		
		const checkObject = (d3dobject) => {
			const serializedComponents = JSON.stringify(
				d3dobject.getSerializedComponents()
			);
			
			if (serializedComponents.includes(`"${uuid}"`)) {
				// refresh this child
				d3dobject.updateComponents(force);
			}
		}
		
		checkObject(this);
		
		for (const child of this.children) {
			checkObject(child);
			child.refreshObjectsWithResource(uri);
		}
	}
	refreshComponentsWithResource(uuid, force = false) {
		this.components.forEach(component => {
			const mgr = this.getComponent(component.type);
			
			if(!mgr)
				return;
			
			let shouldUpdate = false;
			
			for(let i in component.properties) {
				const val = component.properties[i];
				if(val == uuid) {
					shouldUpdate = true;
				}
			}
			
			if(shouldUpdate) {
				mgr.updateComponent(force);
			}
		});
	}
	
	updateComponentsDeep() {
		this.traverse(d3dobject => d3dobject.updateComponents(true));
	}
	updateDependencies() {
		const oldAssetIndex = this.__lastAssetIndex;
		
		if(!this.dirtyAssets)
			return;
		
		if(!oldAssetIndex) {
			console.warn('No old asset index for dependency update')
			return;
		}
		
		this.assetIndex.forEach(assetIndexItem => {
			const oldItem = oldAssetIndex.find(a => a.uuid == assetIndexItem.uuid);
			if(!oldItem || this.dirtyAssets.includes(assetIndexItem.rel)) {
				// New asset found
				//console.log('New asset found', assetIndexItem);
				_events.invoke('refresh-resource', assetIndexItem.uuid);
				this.traverse(o => o.refreshComponentsWithResource(assetIndexItem.uuid, true));
			}
		});
		oldAssetIndex.forEach(oldAssetIndexItem => {
			const existingItem = this.assetIndex.find(a => a.uuid == oldAssetIndexItem.uuid);
			if(!existingItem) {
				// Asset deleted
				//console.log('Asset deleted', oldAssetIndexItem);
				_events.invoke('refresh-resource', oldAssetIndexItem.uuid);
				this.traverse(o => o.refreshComponentsWithResource(oldAssetIndexItem.uuid, true));
			}
		});
		
		this.__lastAssetIndex = structuredClone(this.assetIndex);
		this.dirtyAssets = [];
	}
	
	serialize() {
		return JSON.stringify(this.getSerializableObject());
	}
	
	getSerializableObject(opts = {}) {
		const obj = {
			uuid: this.uuid,
			suuid: this.suuid,
			name: this.name,
			layersMask: this.layersMask,
			hindex: this.hindex,
			enabled: this._enabled,
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
		
		if(opts.includeWorld) {
			const worldPos = this.worldPosition;
			const worldRot = this.worldRotation;
			const worldScl = this.worldScale;
			obj.worldPosition = {x: worldPos.x, y: worldPos.y, z: worldPos.z};
			obj.worldRotation = {x: worldRot.x, y: worldRot.y, z: worldRot.z};
			obj.worldScale = {x: worldScl.x, y: worldScl.y, z: worldScl.z};
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
		let res;
		if(this.name == name)
			res = this;
		else {
			this.traverse(d3dobject => {
				if(d3dobject.name == name) {
					res = d3dobject;
					return false;
				}
			});
		}
		return res;
	}
	findAllDeep(name) {
		const res = [];
		if(this.name == name)
			res.push(this);
		this.traverse(d3dobject => {
			if(d3dobject.name == name)
				res.push(d3dobject);
		});
		return res;
	}
	findComponent(type) {
		let res = this.getComponent(type);
		if(res)
			return res;
		
		this.traverse(d3dobject => {
			res = d3dobject.getComponent(type);
			if(res)
				return false;
		});
		
		return res;
	}
	findAllComponents(type) {
		const res = [];
		
		const c = this.getComponent(type);
		if(c)
			res.push(c);
		
		this.traverse(d3dobject => {
			const c = d3dobject.getComponent(type);
			if(c)
				res.push(c);
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
					const r = child.traverse(callback);
					if (r === false)
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
	
	removeAllChildren(force = true) {
		const children = [...this.children];
		children.forEach(d3dobj => d3dobj.remove(force));
	}
	delete(force = false) {
		this.remove(force);
	}
	destroy() {
		this.remove(true);
	}
	destroyChildren() {
		this.removeAllChildren(true);
	}
	remove(force = false, shouldCheckSymbols = true) {
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
		
		this.symbolId = null;
		this.components = [];
		
		this.__lockSymbols = true; // MUST NOT ALLOW ANY SYMBOL SYNCING
		
		const objs = [];
		
		this.traverse(o => {
			objs.push(o);
		});
		
		objs.forEach(o => {
			o.__lockSymbols = true; // MUST NOT ALLOW ANY SYMBOL SYNCING
			
			_events.invoke('world-remove-object', o);
			
			o.removeFromAllLoops();
			o.unlinkFromZipInstance();
			o.disposeAllComponents();
			o.disposeImportant();
			o.checkInstancedSubmeshes();
			
			const idx = o.parent.children.indexOf(o);
			
			if(idx > -1)
				o.parent.children.splice(idx, 1);
			
			if(o.parent.object3d)
				o.parent.object3d.remove(o.object3d);
			
			o.__deleted = true;
			
			delete o.parent[o.name];
			delete _root.superIndex[o.uuid];
		});
		
		if(shouldCheckSymbols)
			this.checkSymbols();
	}
	disposeAllComponents() {
		for(let i in this.__componentInstances) {
			const mgr = this.__componentInstances[i];
			if(mgr) {
				mgr.dispose?.();
				mgr.__setup = false;
			}
		}
		this.__componentInstances = {};
	}
	disposeImportant() {
		this.disposeTextures();
		this.disposeUnusedTextures();
	}
	disposeTextures() {
		const shared = _root.__texShared;
		if(!shared)
			return;
	
		for(const entry of shared.values())
			entry.owners.delete(this);
	}
	disposeUnusedTextures() {
		const shared = _root.__texShared;
		if(!shared)
			return;
	
		for(const [uuid, entry] of shared.entries()) {
			if(entry.owners.size !== 0)
				continue;
	
			// dispose all variant textures
			for(const tex of entry.variants.values())
				tex.dispose();
	
			// dispose base texture
			entry.base.dispose();
	
			shared.delete(uuid);
		}
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
		
		const editorHidden = !!(window._editor && this.__editorState?.hidden === true);
		const v = !!this.visible && !editorHidden;
		
		let o = 1;
		for(let p = this; p; p = p.parent)
			o *= (p.opacity ?? 1);
		
		const opacityChanged = force || this.__lastEffectiveOpacity !== o;
		const visibleChanged = force || this.__lastVisible !== v;
		const propagate = force || opacityChanged || visibleChanged;
		
		if(opacityChanged)
			applyOpacity(this.object3d, o);
		
		this.object3d.visible = v;
		
		if(propagate)
			this.children.forEach(c => c.updateVisibility(true));
		
		this.__lastEffectiveOpacity = o;
		this.__lastVisible = v;
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
	setWorldPosition(newPosition) {
		const oldPosition = this.position.clone();
		
		this.__spOldPosition = oldPosition;
		this.worldPosition = newPosition;
		
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
	setWorldRotation(newRotation) {
		const oldRotation = this.rotation.clone();
		const oldRotationQ = this.quaternion.clone();
		
		this.__spOldRotation = oldRotation;
		this.worldRotation = newRotation;
		
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
	hasLayer(v) {
		const obj = this.object3d;
		if(!obj)
			return;
		
		return !!(obj.layers.mask & (1 << v));
	}
	enableLayer(layer, recurse = false) {
		const obj = this.object3d;
		if(!obj)
			return;
	
		obj.layers.enable(layer);
	
		if(recurse) {
			this.traverse(o => {
				o.object3d?.layers.enable(layer);
			});
		}
		
		this.checkSymbols();
		this.checkInstancedSubmeshes();
	}
	disableLayer(layer, recurse = false) {
		const obj = this.object3d;
		if(!obj)
			return;
	
		obj.layers.disable(layer);
	
		if(recurse) {
			this.traverse(o => {
				o.object3d?.layers.disable(layer);
			});
		}
		
		this.checkSymbols();
		this.checkInstancedSubmeshes();
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
	getIsRendered() {
		if(!this.visible)
			return false;
		
		for(let o = this.parent; !!o; o = o.parent) {
			if(!o.visible)
				return false;
		}
		
		return true;
	}
	
	__updateLoopIndex() {
		const masterLoops = window._loopFns;
		const loops = this.__loops;
		const loopNames = Object.keys(loops);
		
		loopNames.forEach(loopName => {
			const loop = loops[loopName];
			
			if(!masterLoops[loopName])
				masterLoops[loopName] = new Map();
			
			if(loop) {
				masterLoops[loopName].set(this, loop);
			}else{
				masterLoops[loopName].delete(this);
				delete this.__loops[loopName];
			}
		});
	}
	__setLoop(k, f) {
		if(!f)
			this.__loops[k] = null;
		else
		if(typeof f !== 'function')
			throw new Error('Loop must be of type Function');
		else
			this.__loops[k] = f;
		
		this.__updateLoopIndex();
	}
	removeFromAllLoops() {
		const masterLoops = window._loopFns;
		
		for(let loopName in masterLoops) {
			masterLoops[loopName].delete(this);
		}
		
		this.__loops = {};
	}
}