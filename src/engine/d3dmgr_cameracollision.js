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
	}
	
	setup() {
		this.__onInternalBeforeRender = this.updateCollision;
		this.__setup = true;
	}
	
	updateCollision() {
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
		
		const hits = _physics.linecast(
			target.position.clone().add(targetOffset), 
			this.d3dobject.position,
			{ all: true}
		)
		?.filter(
			h => h.object != target && 
				 h.object != this.d3dobject && 
				 h.object.rootParent != target
		);
		
		if(hits?.length > 0) {
			const point = hits[0].point;
			const coffset = new THREE.Vector3(
				this.offset?.x || 0,
				this.offset?.y || 0,
				this.offset?.z || 0
			);
			const hitPointDir = new THREE.Vector3().subVectors(
				point, this.d3dobject.position
			).normalize();
			
			this.d3dobject.position = point.add(hitPointDir.multiplyScalar(radius)).add(coffset);
		}
	}
}