export default class CameraCollisionManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		this.physObjects = new Set();
		
		this._lastPosition = null;
		
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

	updateComponent() {
		this.target = this.target ?? this.d3dobject.root.find(this.targetName);
		
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
	
	__onInternalBeforeRender() {
		if(!this.__setup)
			return;
		
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
		const opts = { 
			all: true,
			objects: this.physObjects
		};
		const hits = _physics.rigidline(
			target.localToWorld(targetOffset), 
			worldPos,
			opts
		);
		
		const desiredPos = worldPos.clone();
		let anyHit = false;
		
		if(hits?.length > 0) {
			const point = hits[0].point;
			
			const hitPointDir = new THREE.Vector3()
			.subVectors(
				point, worldPos
			).normalize();
			
			desiredPos.copy(point).add(hitPointDir.multiplyScalar(radius)).add(coffset);
			anyHit = true;
		}else{
			// ---------- 2) sphere keep-out: camera position ----------
			// (this catches “too close to terrain” even when line doesn’t hit nicely)
			const sphereHits = _physics.rigidsphere(
				this.d3dobject.worldPosition,
				radius * 0.025,
				opts
			);
			
			if(sphereHits?.length > 0) {
				// nearest first
				const hit = sphereHits[0];
				const point = hit.point;
				
				desiredPos.copy(point).add(coffset);
				anyHit = true;
			}
		}
		
		if(anyHit) {
			// Smooth towards desired position (frame-rate independent)
			const dt = Math.min(0.05, Number(_time?.delta || 0.016));
			const speed = 22; // higher = snappier, lower = smoother
			const t = 1 - Math.exp(-speed * dt);
			
			if(!this._lastPosition)
				this._lastPosition = worldPos.clone();
			
			this._lastPosition.lerp(desiredPos, t);
			this.d3dobject.worldPosition = this._lastPosition;
		}else{
			this._lastPosition = worldPos.clone();
		}
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
		this._lastPosition = null;
	}
}