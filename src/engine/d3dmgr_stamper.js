import * as THREE from 'three';
import { rand, randVec3 } from './d3dmath.js';

export default class StamperManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
	
		this.raycaster = new THREE.Raycaster();
		this.groundRaycaster = new THREE.Raycaster();
		this.brush = null;
		
		this.mouse = new THREE.Vector2();
		
		this.hitPoint = new THREE.Vector3();
		this.hitNormal = new THREE.Vector3();
		this.hitObject = null;
		
		this.stampT = 0;
		this.lastStampPos = new THREE.Vector3(999999, 999999, 999999);
		
		this.tmpA = new THREE.Vector3();
		this.tmpB = new THREE.Vector3();
		this.tmpC = new THREE.Vector3();
		this.tmpD = new THREE.Vector3();
		this.tmpE = new THREE.Vector3();
		
		this.projA = new THREE.Vector3();
		this.projB = new THREE.Vector3();
		this.projC = new THREE.Vector3();
		
		this.tmpQ = new THREE.Quaternion();
		this.brushWasVisible = false;
		
		this.wasDown = false;
		this.batchMode = null;
		this.batchCreates = [];
		this.batchCreateObjs = [];
		this.batchDeletes = [];
		this.batchDeleteObjs = [];
		
		this.d3dobject.__editorNoOutline = true;
	}

	get radius() {
		return Number(this.component.properties.radius) || 0;
	}
	set radius(v) {
		this.component.properties.radius = Number(v);
	}
	
	get size() {
		return this.radius * 0.25;
	}

	get strength() {
		return this.component.properties.strength || 0;
	}
	set strength(v) {
		this.component.properties.strength = Number(v);
	}

	get active() {
		let a = Number(this.component.properties.active) || 0;
		
		if(a >= this.symbols.length)
			a = this.symbols.length - 1;
		
		if(a < 0)
			a = 0;
			
		this.component.properties.active = a;
		
		return a;
	}
	set active(v) {
		this.component.properties.active = Number(v);
	}
	
	get rotateToNormal() {
		return this.component.properties.rotateToNormal;
	}
	set rotateToNormal(v) {
		this.component.properties.rotateToNormal = !!v;
	}
	
	get randomness() {
		return !!this.component.properties.randomness;
	}
	set randomness(v) {
		this.component.properties.randomness = !!v;
	}
	
	get scaleFrom() {
		return this.component.properties.scaleFrom || { x: 1, y: 1, z: 1 };
	}
	set scaleFrom(v) {
		this.component.properties.scaleFrom = {
			x: Number(v?.x) || 0,
			y: Number(v?.y) || 0,
			z: Number(v?.z) || 0
		};
	}
	
	get scaleTo() {
		return this.component.properties.scaleTo || { x: 2, y: 2, z: 2 };
	}
	set scaleTo(v) {
		this.component.properties.scaleTo = {
			x: Number(v?.x) || 0,
			y: Number(v?.y) || 0,
			z: Number(v?.z) || 0
		};
	}
	
	get scaleUniform() {
		return !!this.component.properties.scaleUniform;
	}
	set scaleUniform(v) {
		this.component.properties.scaleUniform = !!v;
	}
	
	get rotateFrom() {
		return this.component.properties.rotateFrom || { x: 0, y: 0, z: 0 };
	}
	set rotateFrom(v) {
		this.component.properties.rotateFrom = {
			x: Number(v?.x) || 0,
			y: Number(v?.y) || 0,
			z: Number(v?.z) || 0
		};
	}
	
	get rotateTo() {
		return this.component.properties.rotateTo || { x: 180, y: 0, z: 0 };
	}
	set rotateTo(v) {
		this.component.properties.rotateTo = {
			x: Number(v?.x) || 0,
			y: Number(v?.y) || 0,
			z: Number(v?.z) || 0
		};
	}

	get symbols() {
		return this.component.properties.symbols;
	}
	set symbols(v) {
		if(!Array.isArray(v))
			throw new Error('Symbols must be an array of d3dsymbol asset uuids');
			
		this.component.properties.symbols = v;
	}
	
	get activeSymbol() {
		const uuid = this.symbols[this.active];
		
		if(!uuid)
			return;
		
		const path = _root.resolvePath(uuid);
		const symbol = Object.values(_root.__symbols).find(s => s.file?.name == path);
		
		if(!symbol)
			throw new Error(`Stamper: Cant find symbol from asset UUID ${uuid}`);
		
		return symbol;
	}
	
	get activeSymbolId() {
		return this.activeSymbol?.symbolId;
	}

	updateComponent(force = false) {

	}

	__onInternalEnterFrame() {
		if(!this.component.enabled)
			return;
		
		if(!window._editor) {
			this.component.enabled = false;
			return;
		}
		
		if(_editor.selectedObjects[0] == this.d3dobject && _editor.selectedObjects.length === 1) {
			
			if(_input.getKeyDown('escape')) {
				_editor.setSelection([]);
				return;
			}
			
			_editor.gameViewBusy = true;
			this.drawBrushGizmo();
			this.updateStamp();
		}else{
			if(this.brush) {
				this.brush.visible = false;
				this.brushWasVisible = false;
			}
			
			_editor.gameViewBusy = false;
			this.endBatch();
		}
	}

	ensureBrushGizmo() {
		if(this.brush)
			return;

		const geo = new THREE.RingGeometry(0.98, 1.0, 96);

		const mat = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: 0.6,
			depthTest: false,
			depthWrite: false,
			side: THREE.DoubleSide
		});

		this.brush = new THREE.Mesh(geo, mat);
		this.brush.frustumCulled = false;
		this.brush.renderOrder = 999999;

		_root.object3d.add(this.brush);
	}

	updateMouseNDC() {
		const canvas = _host.renderer3d?.domElement;
		
		if(!canvas)
			return false;
			
		const rect = canvas.getBoundingClientRect();
		const x = (_input.mouseClient.x - rect.left) / rect.width;
		const y = (_input.mouseClient.y - rect.top) / rect.height;

		this.mouse.x = x * 2 - 1;
		this.mouse.y = -(y * 2 - 1);
		
		return true;
	}

	drawBrushGizmo() {
		this.ensureBrushGizmo();
		
		if(!_input.getCursorOverGame3D() || !this.updateMouseNDC()) {
			this.brush.visible = false;
			this.brushWasVisible = false;
			this.hitObject = null;
			return;
		}
		
		this.raycaster.setFromCamera(this.mouse, _editor.camera);
		this.raycaster.far = _editor.camera.far;
		
		const hits = this.raycaster
			.intersectObjects(_root.object3d.children, true)
			.filter(h => {
				let o = h.object;
				
				if(o === this.brush)
					return false;
				
				while(o) {
					if(o === this.d3dobject.object3d)
						return false;
					o = o.parent;
				}
				
				return true;
			});
			
		if(hits.length < 1) {
			this.brush.visible = false;
			this.brushWasVisible = false;
			this.hitObject = null;
			return;
		}

		const hit = hits[0];

		this.brush.visible = true;
		this.hitObject = hit.object;

		const normal = (hit.face?.normal || this.tmpA.set(0, 1, 0))
			.clone()
			.transformDirection(hit.object.matrixWorld)
			.normalize();

		this.hitPoint.copy(hit.point);
		this.hitNormal.copy(normal);
		
		const brushNormal = this.computeBrushNormal(hit.point, normal);
		
		// smooth factor
		const dt = _time?.delta || (1 / Math.max(1, _time?.fps || 60));
		const speed = 18; // higher = snappier
		const a = 1 - Math.exp(-speed * dt);
		
		// target orientation from normal
		this.tmpQ.setFromUnitVectors(
			this.tmpB.set(0, 0, 1),
			brushNormal
		);
		
		// snap first frame we become visible (prevents “lag jump”)
		if(!this.brushWasVisible) {
			this.brush.quaternion.copy(this.tmpQ);
			this.brush.position.copy(hit.point).addScaledVector(brushNormal, 0.02);
		}else{
			this.brush.quaternion.slerp(this.tmpQ, a);
		
			// optional: smooth position too (keeps it from jittering on micro triangles)
			const targetPos = this.tmpC.copy(hit.point).addScaledVector(brushNormal, 0.02);
			this.brush.position.lerp(targetPos, a);
		}
		
		this.brushWasVisible = true;

		const s = Math.max(0.001, this.size);
		this.brush.scale.set(s, s, s);
	}
	
	computeBrushNormal(center, normal) {
		if(!this.hitObject)
			return normal;
	
		const s = Math.max(0.001, this.size);
		const r = s * 2; // edge of ring (RingGeometry is 0.98..1.0)
	
		const n = this.tmpA.copy(normal).normalize();
	
		const t = Math.abs(n.y) < 0.99
			? this.tmpB.set(0, 1, 0).cross(n).normalize()
			: this.tmpB.set(1, 0, 0).cross(n).normalize();
	
		const b = this.tmpC.copy(n).cross(t).normalize();
	
		this.projA.copy(center).addScaledVector(t,  r);
		this.projB.copy(center).addScaledVector(t, -r * 0.5).addScaledVector(b,  r * 0.8660254);
		this.projC.copy(center).addScaledVector(t, -r * 0.5).addScaledVector(b, -r * 0.8660254);
	
		const h1 = this.projectToGround(this.projA);
		const h2 = this.projectToGround(this.projB);
		const h3 = this.projectToGround(this.projC);
	
		if(!h1 || !h2 || !h3)
			return n;
	
		const a = h1.point;
		const c = h2.point;
		const d = h3.point;
	
		const v1 = this.tmpD.copy(c).sub(a);
		const v2 = this.tmpE.copy(d).sub(a);
		const nn = v1.cross(v2).normalize();
	
		if(nn.dot(n) < 0)
			nn.negate();
	
		return nn;
	}
	
	updateStamp() {
		if(!this.brush || !this.brush.visible)
			return;
		
		const down = _input.getPointerDown() && !_input.getKeyDown('alt');
		const isErase = _input.getKeyDown('shift');
		const mode = isErase ? 'erase' : 'paint';
		
		// ---- single-stamp click mode ----
		if(this.size <= 1) {
			if(down && !this.wasDown) {
				this.beginBatch(mode);
				
				if(isErase)
					this.eraseOnce();
				else
					this.stampOnce();
				
				this.endBatch();
			}
			
			this.wasDown = down;
			return;
		}
		
		// ---- spray mode ----
		if(down && !this.wasDown) {
			this.beginBatch(mode);
		}else
		if(!down && this.wasDown) {
			this.endBatch();
		}
		
		this.wasDown = down;
		
		if(!down)
			return;
		
		const dt = _time?.delta || (1 / Math.max(1, _time?.fps || 60));
		const strength = Math.min(1, Math.max(0, Number(this.strength) || 0));
		
		if(strength <= 0)
			return;
		
		const stampsPerSecond = 40 * strength;
		this.stampT += dt * stampsPerSecond;
		
		while(this.stampT >= 1) {
			this.stampT -= 1;
			
			if(isErase)
				this.eraseOnce();
			else
				this.stampOnce();
		}
	}
	
	beginBatch(mode) {
		this.batchMode = mode;
		this.stampT = 0;
		
		this.batchCreates = [];
		this.batchCreateObjs = [];
		this.batchDeletes = [];
		this.batchDeleteObjs = [];
	}
	
	endBatch() {
		if(!this.batchMode)
			return;
		
		const mode = this.batchMode;
		const creates = this.batchCreates.slice();
		const deletes = this.batchDeletes.slice();
		const manager = this;
		
		let createObjs = this.batchCreateObjs;
		let deleteObjs = this.batchDeleteObjs;
		
		this.batchMode = null;
		this.batchCreates = [];
		this.batchCreateObjs = [];
		this.batchDeletes = [];
		this.batchDeleteObjs = [];
		
		if(creates.length < 1 && deletes.length < 1)
			return;
		
		const name = mode === 'erase' ? `Stamper Erase (${deletes.length})` : `Stamper Paint (${creates.length})`;
		
		_editor.addStep({
			name,
			undo() {
				if(creates.length) {
					for(let i = createObjs.length - 1; i >= 0; i--) {
						const o = createObjs[i];
						if(o)
							o.destroy();
					}
					createObjs = [];
				}
				
				if(deletes.length) {
					deleteObjs = [];
					for(let i = 0; i < deletes.length; i++) {
						const d = deletes[i];
						const p = d.position;
						const r = d.rotation;
						const s = d.scale;
						
						manager.d3dobject.createObject({
							symbolId: d.symbolId,
							position: {x: p.x, y: p.y, z: p.z},
							rotation: {x: r.x, y: r.y, z: r.z},
							scale: {x: s.x, y: s.y, z: s.z}
						}).then(obj => {
							if(obj)
								deleteObjs.push(obj);
						});
					}
				}
			},
			redo() {
				if(deletes.length) {
					for(let i = deleteObjs.length - 1; i >= 0; i--) {
						const o = deleteObjs[i];
						if(o)
							o.destroy();
					}
					deleteObjs = [];
				}
				
				if(creates.length) {
					createObjs = [];
					for(let i = 0; i < creates.length; i++) {
						const c = creates[i];
						const p = c.position;
						const r = c.rotation;
						
						manager.d3dobject.createObject({
							symbolId: c.symbolId,
							position: {x: p.x, y: p.y, z: p.z},
							rotation: {x: r.x, y: r.y, z: r.z}
						}).then(obj => {
							if(obj)
								createObjs.push(obj);
						});
					}
				}
			}
		});
	}
	
	stampOnce() {
		const symbolId = this.activeSymbolId;
	
		if(!symbolId || !this.hitObject)
			return;
	
		const s = Math.max(0.001, this.size) * 0.7;
		const pos = this.samplePointInBrush(this.hitPoint, this.hitNormal, s);
	
		const groundHit = this.projectToGround(pos);
	
		if(!groundHit)
			return;
	
		const groundPos = groundHit.point.clone().addScaledVector(this.hitNormal, 0.02);
	
		const minDist = s * 0.15;
		if(this.lastStampPos.distanceToSquared(groundPos) < (minDist * minDist))
			return;
	
		this.lastStampPos.copy(groundPos);
	
		let rotation = {x: 0, y: 0, z: 0};
	
		if(this.rotateToNormal) {
			const q = this.rotationForNormal(this.hitNormal);
			const euler = new THREE.Euler().setFromQuaternion(q);
			rotation = {x: euler.x, y: euler.y, z: euler.z};
		}
	
		const randRot = this.getRandomRotation();
		rotation = {
			x: rotation.x + randRot.x,
			y: rotation.y + randRot.y,
			z: rotation.z + randRot.z
		};
	
		const scale = this.getRandomScale();
	
		const rec = {
			symbolId,
			position: {x: groundPos.x, y: groundPos.y, z: groundPos.z},
			rotation,
			scale
		};
	
		const isBatch = this.batchMode === 'paint';
		const batchCreates = isBatch ? this.batchCreates : null;
		const batchCreateObjs = isBatch ? this.batchCreateObjs : null;
	
		if(batchCreates)
			batchCreates.push(rec);
	
		this.d3dobject.createObject({
			symbolId,
			position: rec.position,
			rotation: rec.rotation,
			scale: rec.scale
		}).then(obj => {
			if(obj && batchCreateObjs)
				batchCreateObjs.push(obj);
		});
	}
	
	eraseOnce() {
		if(!this.hitObject)
			return;
	
		const allDelete = _input.getKeyDown('control');
		const children = this.d3dobject.children || [];
		if(children.length < 1)
			return;
	
		const r = Math.max(0.001, this.size);
		const hits = _physics.overlapSphere(this.hitPoint, r, {
			objects: children,
			filter: o => {
				if(!o)
					return false;
	
				if(allDelete)
					return true;
	
				return o.symbolId == this.activeSymbolId;
			}
		});
	
		if(hits.length < 1)
			return;
	
		// closest first (your overlapSphere already sorts by centerDistance)
		const picked = hits[0].object;
	
		const symbolId = picked.symbolId || picked?.components?.find?.(c => c.type === 'Symbol')?.properties?.symbolId;
		if(!symbolId)
			return;
	
		const p = picked.position || picked.object3d?.position;
		const ro = picked.rotation || picked.object3d?.rotation;
		const sc = picked.scale || picked.object3d?.scale || {x: 1, y: 1, z: 1};
	
		const rec = {
			symbolId,
			position: {x: p.x, y: p.y, z: p.z},
			rotation: {x: ro.x, y: ro.y, z: ro.z},
			scale: {x: sc.x, y: sc.y, z: sc.z}
		};
	
		if(this.batchMode === 'erase')
			this.batchDeletes.push(rec);
	
		picked.destroy();
	
		if(this.batchMode === 'erase')
			this.batchDeleteObjs.push(picked);
	}
	
	samplePointInBrush(center, normal, radius) {
		const n = normal.clone().normalize();
		
		const t = Math.abs(n.y) < 0.99
			? new THREE.Vector3(0, 1, 0).cross(n).normalize()
			: new THREE.Vector3(1, 0, 0).cross(n).normalize();
		
		const b = n.clone().cross(t).normalize();
		
		const a = Math.random() * Math.PI * 2;
		const r = Math.sqrt(Math.random()) * radius;
		
		return center.clone()
			.addScaledVector(t, Math.cos(a) * r)
			.addScaledVector(b, Math.sin(a) * r);
	}
	
	rotationForNormal(normal) {
		const n = normal.clone().normalize();
		const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
		
		const twist = new THREE.Quaternion().setFromAxisAngle(n, Math.random() * Math.PI * 2);
		q.multiply(twist);
		
		return q;
	}
	
	projectToGround(pos) {
		if(!this.hitObject)
			return;
		
		const n = this.hitNormal;
		const origin = this.tmpC.copy(pos).addScaledVector(n, 10);
		const dir = this.tmpD.copy(n).multiplyScalar(-1);
		
		this.groundRaycaster.set(origin, dir);
		this.groundRaycaster.far = 50;
		
		const hits = this.groundRaycaster.intersectObject(this.hitObject, true);
		if(hits.length < 1)
			return;
		
		return hits[0];
	}
	
	getRandomScale() {
		if(!this.randomness)
			return {x: 1, y: 1, z: 1};
		
		const a = this.scaleFrom;
		const b = this.scaleTo;
		
		if(this.scaleUniform) {
			const s = rand(a.x, b.x);
			return {x: s, y: s, z: s};
		}
		
		return {
			x: rand(a.x, b.x),
			y: rand(a.y, b.y),
			z: rand(a.z, b.z)
		};
	}
	
	getRandomRotation() {
		if(!this.randomness)
			return {x: 0, y: 0, z: 0};
	
		const a = this.rotateFrom;
		const b = this.rotateTo;
		const DEG2RAD = Math.PI / 180;
	
		return {
			x: rand(a.x, b.x) * DEG2RAD,
			y: rand(a.y, b.y) * DEG2RAD,
			z: rand(a.z, b.z) * DEG2RAD
		};
	}
	
	dispose() {
		this.endBatch();
		this.d3dobject.__editorNoOutline = false;
		
		if(this.brush) {
			_root.object3d.remove(this.brush);
			this.brush.geometry.dispose();
			this.brush.material.dispose();
			this.brush = null;
		}
		
		if(_editor)
			_editor.gameViewBusy = false;
	}
}