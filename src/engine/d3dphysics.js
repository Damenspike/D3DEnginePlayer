import RAPIER from '@dimforge/rapier3d-compat';

export default class D3DPhysics {
	constructor() {
		this.world = null;
		this.ready = false;
		this.fixedDt = 1 / 60;
		this._accum = 0;

		this._bodies = new Map(); // d3dobj.uuid -> { rb, colliders:[] }
		this._toObj  = new Map(); // rb.handle -> d3dobj
	}

	async init(gravity = { x: 0, y: -9.81, z: 0 }) {
		await RAPIER.init();
		this.world = new RAPIER.World(gravity);
		this.ready = true;

		// Configure physics world for stability
		this.world.integrationParameters.maxVelocityIterations = 8; // Increase for better constraint solving
		this.world.integrationParameters.maxPositionIterations = 4;
		this.world.integrationParameters.maxStabilizationIterations = 2;
		this.world.integrationParameters.erp = 0.3; // Error reduction parameter for contacts
		this.world.integrationParameters.maxCcdSubsteps = 4; // Enable CCD with more substeps
	}

	step(dt) {
		this._accum += dt;
		while (this._accum >= this.fixedDt) {
			this.world.timestep = this.fixedDt;
			this.world.step();
			this._accum -= this.fixedDt;
		}
		// Sync RB -> Three/D3D
		this._bodies.forEach(({ rb }, uuid) => {
			const obj = this._toObj.get(rb.handle);
			const t = rb.translation();
			const q = rb.rotation();
			obj.object3d.position.set(t.x, t.y, t.z);
			obj.object3d.quaternion.set(q.x, q.y, q.z, q.w);
		});
	}

	dispose() {
		this._bodies.clear();
		this._toObj.clear();
		this.world = null;
		this.ready = false;
	}

	// -------------------- Rigidbodies / Colliders --------------------

	addRigidBody(d3dobj, opts = {}) {
		const kind = opts.kind || 'dynamic'; // 'dynamic' | 'fixed' | 'kinematicPosition'
		let desc;
		if (kind === 'fixed') desc = RAPIER.RigidBodyDesc.fixed();
		else if (kind === 'kinematicPosition') desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
		else {
			desc = RAPIER.RigidBodyDesc.dynamic();
			desc.setCcdEnabled(true); // Enable continuous collision detection for dynamic bodies
		}

		const worldPos = new THREE.Vector3();
		d3dobj.object3d.getWorldPosition(worldPos);
		const worldQuat = new THREE.Quaternion();
		d3dobj.object3d.getWorldQuaternion(worldQuat);
		desc.setTranslation(worldPos.x, worldPos.y, worldPos.z);
		desc.setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
		desc.setAdditionalMass(Math.max(0.1, opts.density || 1.0)); // Ensure minimum mass

		const rb = this.world.createRigidBody(desc);
		const colliders = [];

		if (opts.shape) {
			const c = this._createColliderFromShape(opts.shape, rb, opts);
			colliders.push(c);
		}

		this._bodies.set(d3dobj.uuid, { rb, colliders });
		this._toObj.set(rb.handle, d3dobj);
		return rb;
	}

	remove(d3dobj) {
		const pack = this._bodies.get(d3dobj.uuid);
		if (!pack) return;
		for (let i = 0; i < pack.colliders.length; i++) {
			this.world.removeCollider(pack.colliders[i], true);
		}
		this.world.removeRigidBody(pack.rb);
		this._toObj.delete(pack.rb.handle);
		this._bodies.delete(d3dobj.uuid);
	}

	getBody(d3dobj) {
		const pack = this._bodies.get(d3dobj.uuid);
		return pack ? pack.rb : null;
	}

	_createColliderFromShape(shape, rb, opts) {
		let desc;
		switch (shape.type) {
			case 'box':     desc = RAPIER.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz); break;
			case 'sphere':  desc = RAPIER.ColliderDesc.ball(shape.r); break;
			case 'capsule': desc = RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius); break;
			case 'trimesh': desc = RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices); break;
			case 'convex':  desc = RAPIER.ColliderDesc.convexMesh(shape.vertices); break;
			default:        desc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5); break;
		}
		if (shape.offset) {
			desc.setTranslation(shape.offset.x, shape.offset.y, shape.offset.z);
		}
		if (opts.friction != null) desc.setFriction(opts.friction);
		if (opts.restitution != null) desc.setRestitution(opts.restitution);
		desc.setDensity(Math.max(0.1, opts.density || 1.0)); // Ensure minimum density
		desc.setCollisionGroups(0xFFFF0001); // Default group for better collision filtering
		return this.world.createCollider(desc, rb);
	}

	// -------------------- Forces / Impulses --------------------

	applyImpulse(d3dobj, impulse) {
		const rb = this.getBody(d3dobj);
		rb.applyImpulse(impulse, true);
	}

	setLinearVelocity(d3dobj, vel) {
		const rb = this.getBody(d3dobj);
		rb.setLinvel(vel, true);
	}

	setNextKinematicTransform(d3dobj, pos, quat) {
		const rb = this.getBody(d3dobj);
		rb.setNextKinematicTranslation(pos);
		rb.setNextKinematicRotation(quat);
	}

	// -------------------- Character Controller --------------------

	createKCC(snap = 0.01, maxClimbDeg = 50, minSlideDeg = 50) {
		const kcc = this.world.createCharacterController(snap);
		kcc.setSlideEnabled(true);
		kcc.setMaxSlopeClimbAngle(maxClimbDeg * Math.PI / 180);
		kcc.setMinSlopeSlideAngle(minSlideDeg * Math.PI / 180);
		kcc.enableAutostep(0.5, 0.2, true); // Allow climbing small steps
		kcc.enableSnapToGround(snap); // Ensure character stays grounded
		return kcc;
	}

	kccMove(kcc, characterCollider, desiredVec3, rb) {
		kcc.computeColliderMovement(characterCollider, desiredVec3, 1e-4);
		const mv = kcc.computedMovement();
		const t = rb.translation();
		rb.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
		return mv;
	}
}