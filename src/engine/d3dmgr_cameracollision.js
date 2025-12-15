export default class CameraCollisionManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		
		this._lastPosition = null;
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
		if (!this.__setup) this.setup();
		this.updateObjects();
	}
	
	setup() {
		this.__setup = true;
		
		_events.on('super-index-update', () => this.updateObjects());
	}
	
	updateObjects() {
		const target = this.target ?? this.d3dobject.root.find(this.targetName);
		
		this.physObjects = _root.superObjects.filter(d3dobj => (
			d3dobj != target && 
			d3dobj != this.d3dobject && 
			d3dobj.rootParent != target &&
			(
				d3dobj.rootParent.hasComponent('Rigidbody') || 
				d3dobj.hasComponent('Rigidbody')
			)
		));
	}
	
	__onInternalBeforeRender() {
		if(!this.__setup)
			return;
		
		const radius = Number(this.radius);
		const target = this.target ?? this.d3dobject.root.find(this.targetName);
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
		
		this.target = target;
		
		const hits = _physics.linecast(
			target.localToWorld(targetOffset), 
			this.d3dobject.worldPosition,
			{ 
				all: true,
				objects: this.physObjects
			}
		);
		
		if(hits?.length > 0) {
			const point = hits[0].point;
			const coffset = this.d3dobject.localDirToWorld(
				new THREE.Vector3(
					this.offset?.x || 0,
					this.offset?.y || 0,
					this.offset?.z || 0
				)
			);
			
			const hitPointDir = new THREE.Vector3()
			.subVectors(
				point, this.d3dobject.worldPosition
			).normalize();
			
			this.d3dobject.worldPosition = point.add(hitPointDir.multiplyScalar(radius)).add(coffset);
		}
	}
}