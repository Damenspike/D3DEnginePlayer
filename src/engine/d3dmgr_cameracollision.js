import { rcoeff } from './d3dmath.js';

export default class CameraCollisionManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		this.physObjects = new Set();
		
		this._smoothPos = null;
		this.finalPosition = this.d3dobject.worldPosition;
		
		this._evWorldAddRb = d3dobject => {
			if(this.isPhysObject(d3dobject))
				this.physObjects.add(d3dobject);
		};
		this._evWorldRemoveObj = d3dobject => {
			this.physObjects.delete(d3dobject);
		};
		
		_events.on('world-add-rb', this._evWorldAddRb);
		_events.on('world-remove-object', this._evWorldRemoveObj);
	}
	
	get targetName() {
		return this.component.properties.targetName;
	}
	set targetName(v) {
		this.component.properties.targetName = v;
	}
	
	get radius() {
		return this.component.properties.radius;
	}
	set radius(v) {
		this.component.properties.radius = v;
	}
	
	get offset() {
		return this.component.properties.offset;
	}
	set offset(v) {
		this.component.properties.offset = v;
	}
	
	get targetOffset() {
		return this.component.properties.targetOffset;
	}
	set targetOffset(v) {
		this.component.properties.targetOffset = v;
	}
	
	get minDistance() {
		return Number(this.component.properties.minDistance) || 0;
	}
	set minDistance(v) {
		this.component.properties.minDistance = Number(v);
	}
	
	get smoothing() {
		return !!this.component.properties.smoothing;
	}
	set smoothing(v) {
		this.component.properties.smoothing = !!v;
	}
	
	get smoothingSpeed() {
		return Number(this.component.properties.smoothingSpeed) || 0;
	}
	set smoothingSpeed(v) {
		this.component.properties.smoothingSpeed = Number(v);
	}
	
	updateComponent() {
		if (!this.__setup) 
			this.setup();
	}
	
	setup() {
		this.updateObjects();
		this.__setup = true;
	}
	
	updateObjects() {
		const objects = Object.values(_root.superIndex).filter(this.isPhysObject.bind(this));
		
		objects.forEach(d3dobject => this.physObjects.add(d3dobject));
	}
	isPhysObject(d3dobj) {
		const target = this.target;
		return (
			d3dobj != target && 
			d3dobj != this.d3dobject && 
			d3dobj.rootParent != target &&
			(
				d3dobj.rootParent.hasComponent('Rigidbody') || 
				d3dobj.hasComponent('Rigidbody')
			)
		)
	}
	
	updateCameraCollision() {
		if(!this.__setup)
			return;
			
		this.target = this.target ?? this.d3dobject.root.find(this.targetName);
		
		const radius = Number(this.radius);
		const target = this.target;
		const targetOffset = new THREE.Vector3(
			this.targetOffset?.x || 0,
			this.targetOffset?.y || 0,
			this.targetOffset?.z || 0
		);
		
		if(!radius) {
			if(!this.__radiusWarning) {
				console.warn('CameraCollision: Invalid camera collision radius');
				this.__radiusWarning = true;
			}
			return;
		}
		if(!target) {
			if(!this.__targetWarning) {
				console.warn('CameraCollision: undefined target object');
				this.__targetWarning = true;
			}
			return;
		}
		
		const coffset = this.d3dobject.localDirToWorld(
			new THREE.Vector3(
				this.offset?.x || 0,
				this.offset?.y || 0,
				this.offset?.z || 0
			)
		);
		const worldPos = this.d3dobject.worldPosition;
		const targetPos = target.localToWorld(targetOffset);
		const opts = { 
			all: true,
			objects: this.physObjects
		};
		let anyHit = false;
		
		// first, ensure ray is done
		const desiredPos = worldPos.clone();
		const hits = _physics.rigidline(
			targetPos, 
			worldPos,
			opts
		);
		
		if(hits?.length > 0) {
			const point = hits[0].point;
			
			const hitPointDir = new THREE.Vector3()
			.subVectors(
				point, worldPos
			).normalize();
			
			desiredPos.copy(point).add(hitPointDir.multiplyScalar(radius)).add(coffset);
			anyHit = true;
		}
		
		// ---------- sphere keep-out: camera position ----------
		const probeR = radius * 0.05;
		const sphereHits = _physics.rigidsphere(
			desiredPos,
			probeR,
			opts
		);
		
		if (sphereHits?.length > 0) {
			const hit = sphereHits[0];
			const n = new THREE.Vector3();
			
			n.subVectors(desiredPos, hit.point).normalize();
			
			const padding = Math.max(0.001, radius * 0.02);
			
			desiredPos
				.copy(hit.point)
				.add(n.multiplyScalar(probeR + padding))
				.add(coffset);
			
			anyHit = true;
		}
		
		// Check if the desiredPos is too close or has gone past the player target pos
		const toNatural = new THREE.Vector3().subVectors(worldPos, targetPos);
		const toDesired = new THREE.Vector3().subVectors(desiredPos, targetPos);
		if(toDesired.lengthSq() < this.minDistance * this.minDistance || toDesired.dot(toNatural) < 0) {
			if(toNatural.lengthSq() > 1e-10) {
				toNatural.normalize();
				desiredPos.copy(targetPos).add(toNatural.multiplyScalar(this.minDistance));
			}else{
				desiredPos.copy(targetPos);
			}
		}
		
		const speed = this.smoothingSpeed;
		
		if(anyHit) {
			if(this.smoothing) {
				if(!this._smoothPos)
					this._smoothPos = desiredPos.clone();
				else
					this._smoothPos = this._smoothPos.lerp(desiredPos, _time.delta * speed);
				
				this.d3dobject.worldPosition = this._smoothPos;
				this.finalPosition = this._smoothPos;
			}else{
				this.d3dobject.worldPosition = desiredPos;	
				this.finalPosition = desiredPos;
			}
			this.lastHit = _time.now;
			this.smoothTime = 1 * rcoeff(speed / 30);
		}else{
			const sinceLastHit = _time.now - this.lastHit;
			const smoothTime = this.smoothTime;
			if(this.smoothing && this._smoothPos && this.lastHit && sinceLastHit < smoothTime) {
				this._smoothPos = this._smoothPos.lerp(worldPos, sinceLastHit / smoothTime);
				this.d3dobject.worldPosition = this._smoothPos;
				this.finalPosition = this._smoothPos;
			}else{
				this._smoothPos = worldPos.clone();
				this.finalPosition = this._smoothPos;
			}
		}
	}
	
	/**
		Resets the smoothing position
	 */
	resetSmoothing() {
		this._smoothPos = null;
	}
	
	dispose() {
		if(this._evWorldAddRb) {
			_events.un('world-add-rb', this._evWorldAddRb);
			this._evWorldAddRb = null;
		}
		if(this._evWorldRemoveObj) {
			_events.un('world-remove-object', this._evWorldRemoveObj);
			this._evWorldRemoveObj = null;
		}
		
		this.physObjects.clear();
		this.target = null;
		this._smoothPos = null;
		this.finalPosition = null;
	}
}