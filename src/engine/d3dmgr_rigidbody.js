// RigidbodyManager.js
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import {
	buildConvexWireGeometry
} from './d3dutility.js';

export default class RigidbodyManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component  = component;

		// runtime fields set by us
		this.component._rb    = null;   // physics rigid body
		this.component._cache = null;   // optional external cache (kept for compatibility)

		// editor helper (wireframe)
		this.__rbHelper = null;

		// live cached motion (updated in play every frame)
		this._cachedVelocity        = new THREE.Vector3();
		this._cachedAngularVelocity = new THREE.Vector3();
		this._cachedSpeed           = 0;
		
		this._lastCoMPos = new THREE.Vector3();
		this._lastRot    = new THREE.Quaternion();
		this._hadPrevSample = false;

		// tuneables
		this._wireOpacity = 0.95;
		this._helperRenderOrder = 10_000_000; 
	}

	/* =========================================================
	 *  LIFECYCLE
	 * ======================================================= */

	updateComponent() {
		if (!this.component.enabled) {
			this.__onInternalEnterFrame = null;
			this._clearHelperGroup();
			return;
		}

		const inEditor = !!window._editor && !window._player;
		const inPlay   = !!window._player;
		const next = this._readComponent();

		if (inEditor) {
			// No bodies in editor
			if (this.component._rb) this._teardownBody();
			this.component.bodySetup = false;

			this.__onInternalEnterFrame = () => {
				// Only draw when selected
				const selected = this._isSelected();
				if (!selected) {
					if (this.__rbHelper) this.__rbHelper.visible = false;
					return;
				}
				this._updateGizmo(next.shape, this.shape, next.kind);
			};

			return;
		}
		
		if (!_physics || !_physics.ready) return; // don't throw/spam; just wait
		
		// Helpers are strictly editor-only
		this._clearHelperGroup();
		
		if (!this.component.bodySetup) {
			this._setupBody(next);
			this.component.bodySetup = true;
			this.component._cache = next;
		} else if (this._changed(this.component._cache, next)) {
			this._teardownBody();
			this._setupBody(next);
			this.component._cache = next;
		}
		
		this.__onInternalPhysicsUpdate = () => {
			this._sampleMotion();
		};
	}

	dispose() {
		this._teardownBody();
		this.component.bodySetup = false;
		this.component._cache = null;
		this._clearHelperGroup();
	}

	/* =========================================================
	 *  PROPERTIES (schema-backed passthroughs)
	 * ======================================================= */

	get kind()               { return this.component.properties.kind; }
	set kind(v)              { this.component.properties.kind = v; }

	get shape()              { return this.component.properties.shape; }
	set shape(v)             { this.component.properties.shape = v; }

	get friction()           { return this.component.properties.friction; }
	set friction(v)          { this.component.properties.friction = v; }

	get bounciness()         { return this.component.properties.bounciness; }
	set bounciness(v)        { this.component.properties.bounciness = v; }

	get density()            { return this.component.properties.density; }
	set density(v)           { this.component.properties.density = v; }

	get autoCalculateShapes(){ return !!this.component.properties.autoCalculateShapes; }
	set autoCalculateShapes(v){ this.component.properties.autoCalculateShapes = !!v; }

	get boxSize()            { return this.component.properties.boxSize; }
	set boxSize(v)           { this.component.properties.boxSize = { x:+v.x, y:+v.y, z:+v.z }; }

	get sphereRadius()       { return this.component.properties.sphereRadius; }
	set sphereRadius(v)      { this.component.properties.sphereRadius = Math.max(0, Number(v) || 0); }

	// Capsule: height = cylinder section only, radius = spherical end radius
	get capsuleHeight()      { return this.component.properties.capsuleHeight; }
	set capsuleHeight(v)     { this.component.properties.capsuleHeight = Math.max(0, Number(v) || 0); }

	get capsuleRadius()      { return this.component.properties.capsuleRadius; }
	set capsuleRadius(v)     { this.component.properties.capsuleRadius = Math.max(0, Number(v) || 0); }

	// Only used for shape building & helper placement. Never used for velocity.
	get shapeOffset()        { return this.component.properties.shapeOffset; }
	set shapeOffset(v)       { this.component.properties.shapeOffset = { x:+v.x||0, y:+v.y||0, z:+v.z||0 }; }

	get drag()               { return this.component.properties.drag || 0; }
	set drag(v) {
		const d = Math.max(0, Number(v) || 0);
		this.component.properties.drag = d;
		const rb = this.component._rb;
		if (rb && rb.setLinearDamping) rb.setLinearDamping(d);
	}

	get angularDrag()        { return this.component.properties.angularDrag || 0; }
	set angularDrag(v) {
		const d = Math.max(0, Number(v) || 0);
		this.component.properties.angularDrag = d;
		const rb = this.component._rb;
		if (rb && rb.setAngularDamping) rb.setAngularDamping(d);
	}

	// Convenience prop aliases (property-style)
	get velocity()           { return Object.freeze(this.getVelocity()); }
	set velocity(v)          { this.setVelocity(v?.x || 0, v?.y || 0, v?.z || 0); }
	
	get angularVelocity()           { return Object.freeze(this.getAngularVelocity()); }
	set angularVelocity(v)          { this.setAngularVelocity(v?.x || 0, v?.y || 0, v?.z || 0); }
	
	get speed()              { return this._cachedSpeed; }

	/* =========================================================
	 *  TRANSFORMS
	 * ======================================================= */

	setPosition({ x, y, z }) {
		const obj = this.d3dobject.object3d;
		const rb  = this.component._rb;

		if (!rb) {
			obj.position.set(x, y, z);
			obj.updateMatrixWorld(true);
			return;
		}

		if (this.kind === 'kinematicPosition') {
			const q = obj.quaternion;
			_physics.setNextKinematicTransform(
				this.d3dobject,
				{ x, y, z },
				{ x: q.x, y: q.y, z: q.z, w: q.w }
			);
		} else {
			rb.setTranslation({ x, y, z }, true);
		}

		obj.position.set(x, y, z);
		obj.updateMatrixWorld(true);
	}

	setRotation({ x, y, z, w }) {
		const obj = this.d3dobject.object3d;
		const rb  = this.component._rb;
		const p   = obj.position;

		if (!rb) {
			obj.quaternion.set(x, y, z, w);
			obj.updateMatrixWorld(true);
			return;
		}

		if (this.kind === 'kinematicPosition') {
			_physics.setNextKinematicTransform(
				this.d3dobject,
				{ x: p.x, y: p.y, z: p.z },
				{ x, y, z, w }
			);
		} else {
			rb.setRotation({ x, y, z, w }, true);
		}

		obj.quaternion.set(x, y, z, w);
		obj.updateMatrixWorld(true);
	}

	setTransform(pos, rot) {
		const obj = this.d3dobject.object3d;
		const rb  = this.component._rb;

		const p = pos ?? obj.position;
		const q = rot ?? obj.quaternion;

		if (!rb) {
			obj.position.set(p.x, p.y, p.z);
			obj.quaternion.set(q.x, q.y, q.z, q.w);
			obj.updateMatrixWorld(true);
			return;
		}

		if (this.kind === 'kinematicPosition') {
			_physics.setNextKinematicTransform(
				this.d3dobject,
				{ x: p.x, y: p.y, z: p.z },
				{ x: q.x, y: q.y, z: q.z, w: q.w }
			);
		} else {
			rb.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
			rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
		}

		obj.position.set(p.x, p.y, p.z);
		obj.quaternion.set(q.x, q.y, q.z, q.w);
		obj.updateMatrixWorld(true);
	}

	/* =========================================================
	 *  PHYSICS BODY
	 * ======================================================= */

	_setupBody(opts) {
		const rb = _physics.addRigidBody(this.d3dobject, {
			kind:        opts.kind,
			shape:       opts.shape,
			friction:    this._clamp01(opts.friction),
			restitution: this._clamp01(opts.restitution),
			density:     Math.max(1e-6, opts.density)
		});
		rb.setLinearDamping(Math.max(0, Number(opts.drag) || 0));
		rb.setAngularDamping(Math.max(0, Number(opts.angularDrag) || 0));
		this.component._rb = rb;
	
		// seed sampler from current RB pose
		const p = rb.translation();
		const q = rb.rotation();
		this._lastCoMPos.set(p.x, p.y, p.z);
		this._lastRot.set(q.x, q.y, q.z, q.w);
		this._hadPrevSample = false;
	
		// reset caches
		this._cachedVelocity.set(0,0,0);
		this._cachedAngularVelocity.set(0,0,0);
		this._cachedSpeed = 0;
	}

	_teardownBody() {
		if (!this.component._rb) return;
		_physics.remove(this.d3dobject);
		this.component._rb = null;

		// zero-out caches so UI doesn't show stale values
		this._cachedVelocity.set(0,0,0);
		this._cachedAngularVelocity.set(0,0,0);
		this._cachedSpeed = 0;
	}

	/* =========================================================
	 * MOTION API – RE-WRITTEN (strong forces, stable speed)
	 * ======================================================= */
	// ---------------------------------------------------------------------
	//  Linear velocity
	// ---------------------------------------------------------------------
	getVelocity() {
		if (!this.component._rb) throw new Error('[RigidbodyManager] getVelocity with no RB.');
		return this._cachedVelocity.clone();
	}
	setVelocity(vx, vy, vz) {
		const rb = this.component._rb;
		if (!rb) throw new Error('[RigidbodyManager] setVelocity called but rigid body is missing.');
	
		const v = { x: vx, y: vy, z: vz };
		if (rb.setLinvel) rb.setLinvel(v, true);
		else if (rb.setLinearVelocity) rb.setLinearVelocity(v);
		else if (_physics?.setLinearVelocity) _physics.setLinearVelocity(this.d3dobject, v);
		else throw new Error('[RigidbodyManager] No API to set linear velocity.');
	
		this._cachedVelocity.set(vx, vy, vz);
		this._cachedSpeed = this._cachedVelocity.length();
	}
	
	/** Add a velocity delta (world or local space) */
	addVelocity(vec, space = 'local') {
		const rb = this.component._rb;
		if (!rb || this.kind === 'fixed') return;
	
		const delta = new THREE.Vector3(vec.x ?? 0, vec.y ?? 0, vec.z ?? 0);
		if (space === 'local') {
			this.d3dobject.object3d.updateMatrixWorld();
			const q = this.d3dobject.object3d.getWorldQuaternion(new THREE.Quaternion());
			delta.applyQuaternion(q);
		}
	
		// ----- read *real* current velocity from the body -----
		let cur = { x: 0, y: 0, z: 0 };
		if (rb.linvel) cur = rb.linvel();
		else if (rb.linearVelocity) cur = rb.linearVelocity();
	
		const newVel = new THREE.Vector3(cur.x, cur.y, cur.z).add(delta);
		this.setVelocity(newVel.x, newVel.y, newVel.z);
	}
	
	/** Unity-style AddForce – modes: 'force' | 'impulse' | 'velocityChange' */
	addForce(vec, { mode = 'force', space = 'local' } = {}) {
		const rb = this.component._rb;
		if (!rb || this.kind === 'fixed') return;
	
		const dt = _physics?.fixedDt ?? (1 / 60);
		const mass = (typeof rb.mass === 'function' ? rb.mass() : rb.mass) ?? 1;
		const f = new THREE.Vector3(vec.x ?? 0, vec.y ?? 0, vec.z ?? 0);
	
		// ----- native Rapier impulse path (preferred) -----
		if (typeof rb.applyImpulse === 'function') {
			let impulse = f.clone();
	
			if (mode === 'force') impulse.multiplyScalar(dt);
			// 'impulse' → use as-is, 'velocityChange' → convert to impulse
			else if (mode === 'velocityChange') impulse.multiplyScalar(mass);
	
			if (space === 'local') {
				this.d3dobject.object3d.updateMatrixWorld();
				const q = this.d3dobject.object3d.getWorldQuaternion(new THREE.Quaternion());
				impulse.applyQuaternion(q);
			}
	
			rb.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
			return;               // early-out – Rapier already applied the impulse
		}
	
		// ----- fallback generic path (single mass division) -----
		let dv;
		switch (mode) {
			case 'velocityChange':
				dv = f;
				break;
			case 'impulse':
				dv = f.clone().multiplyScalar(1 / Math.max(1e-6, mass));
				break;
			case 'force':
			default:
				dv = f.clone().multiplyScalar(dt / Math.max(1e-6, mass));
				break;
		}
		this.addVelocity(dv, space);
	}
	
	// Convenience
	addImpulse(vec, space = 'local') { this.addForce(vec, { mode: 'impulse', space }); }
	
	// ---------------------------------------------------------------------
	//  Angular velocity
	// ---------------------------------------------------------------------
	getAngularVelocity() {
		if (!this.component._rb) throw new Error('[RigidbodyManager] getAngularVelocity with no RB.');
		return this._cachedAngularVelocity.clone();
	}
	setAngularVelocity(wx, wy, wz) {
		const rb = this.component._rb;
		if (!rb) throw new Error('[RigidbodyManager] setAngularVelocity called but rigid body is missing.');
	
		const v = { x: wx, y: wy, z: wz };
		if (rb.setAngvel) rb.setAngvel(v, true);
		else if (_physics?.setAngularVelocity) _physics.setAngularVelocity(this.d3dobject, v);
		else throw new Error('[RigidbodyManager] No API to set angular velocity.');
	
		this._cachedAngularVelocity.set(wx, wy, wz);
	}
	
	/** Add angular-velocity delta (world or local) */
	addAngularVelocity(vec, space = 'local') {
		const rb = this.component._rb;
		if (!rb || this.kind === 'fixed') return;
	
		const delta = new THREE.Vector3(vec.x ?? 0, vec.y ?? 0, vec.z ?? 0);
		if (space === 'local') {
			this.d3dobject.object3d.updateMatrixWorld();
			const q = this.d3dobject.object3d.getWorldQuaternion(new THREE.Quaternion());
			delta.applyQuaternion(q);
		}
	
		let cur = { x: 0, y: 0, z: 0 };
		if (rb.angvel) cur = rb.angvel();
		else if (rb.angularVelocity) cur = rb.angularVelocity();
	
		const newAng = new THREE.Vector3(cur.x, cur.y, cur.z).add(delta);
		this.setAngularVelocity(newAng.x, newAng.y, newAng.z);
	}
	
	addTorque(vec, { mode = 'torque', space = 'local' } = {}) {
		const rb = this.component._rb;
		if (!rb) return;
		
		const dt = _physics.fixedDt;
	
		// build vector
		const t = new THREE.Vector3(vec.x || 0, vec.y || 0, vec.z || 0);
	
		// local -> world
		if (space === 'local') {
			this.d3dobject.object3d.updateMatrixWorld();
			const q = this.d3dobject.object3d.getWorldQuaternion(new THREE.Quaternion());
			t.applyQuaternion(q);
		}
	
		// modes
		if (mode === 'velocityChange') {
			// interpret vec as Δω (rad/s), world-space
			this.addAngularVelocity({ x: t.x, y: t.y, z: t.z }, 'world');
			return;
		}
		if (mode === 'impulse') {
			// torque impulse (N·m·s), world-space
			rb.applyTorqueImpulse({ x: t.x, y: t.y, z: t.z }, true);
			return;
		}
		
		// mode === 'torque' → τ·dt
		const imp = t.multiplyScalar(dt);
		rb.applyTorqueImpulse({ x: imp.x, y: imp.y, z: imp.z }, true);
	}
	
	// Convenience
	addTorqueImpulse(vec, space = 'local') { this.addTorque(vec, { mode: 'impulse', space }); }

	/* =========================================================
	 *  INTERNAL: READ & BUILD SHAPES
	 *  (shapeOffset is only used here + helper; never used for velocity)
	 * ======================================================= */

	_readComponent() {
		const props = this.component.properties;

		let kind        = props.kind ?? 'dynamic';
		let shapeType   = props.shape ?? 'trimesh';
		const friction    = Number(props.friction ?? 0.5);
		const restitution = Number(props.bounciness ?? 0.5);
		const density     = Number(props.density ?? 1.0);
		const drag        = Math.max(0, Number(props.drag ?? 0));
		const angularDrag = Math.max(0, Number(props.angularDrag ?? 0));
		const auto        = !!props.autoCalculateShapes;

		if (kind !== 'fixed' && shapeType === 'trimesh') {
			// strict: throw instead of silent swap? We'll choose strict-but-helpful.
			// You can relax this if you want.
			shapeType = 'convex';
		}

		if (auto) {
			this._autoPopulateDimensions(this.d3dobject, shapeType);
		}

		const dims = {
			boxSize:       props.boxSize,
			sphereRadius:  Number(props.sphereRadius),
			capsuleHeight: Number(props.capsuleHeight),
			capsuleRadius: Number(props.capsuleRadius)
		};

		const shape = this._buildShapeFromProps(this.d3dobject, shapeType, dims);

		return { kind, shapeType, shape, friction, restitution, density, drag, angularDrag };
	}

	_autoPopulateDimensions(d3dobject, shapeType) {
		const props = this.component.properties;
		const o = d3dobject.object3d;

		switch (shapeType) {
			case 'box': {
				const bb   = this._resolveGeometry(o, { merge: true, type: 'box' });
				const size = { x: (bb.max.x - bb.min.x), y: (bb.max.y - bb.min.y), z: (bb.max.z - bb.min.z) };
				const ctr  = { x: (bb.min.x + bb.max.x)/2, y: (bb.min.y + bb.max.y)/2, z: (bb.min.z + bb.max.z)/2 };
				props.boxSize     = size;
				props.shapeOffset = ctr;
				break;
			}
			case 'sphere': {
				const sp = this._resolveGeometry(o, { merge: true, type: 'sphere' });
				props.sphereRadius = sp.radius;
				props.shapeOffset  = sp.center;
				break;
			}
			case 'capsule': {
				const bb    = this._resolveGeometry(o, { merge: true, type: 'box' });
				const sx    = (bb.max.x - bb.min.x);
				const sy    = (bb.max.y - bb.min.y);
				const sz    = (bb.max.z - bb.min.z);
				const eps   = 1e-6;
				const r0    = 0.5 * Math.min(sx, sz);
				const r     = Math.min(r0, Math.max(0, sy * 0.5 - eps));
				const h     = Math.max(0, sy - 2 * r);
				const ctr   = { x: (bb.min.x + bb.max.x)/2, y: (bb.min.y + bb.max.y)/2, z: (bb.min.z + bb.max.z)/2 };

				props.capsuleRadius = r;
				props.capsuleHeight = h;
				props.shapeOffset   = ctr;
				break;
			}
			default:
				// convex / trimesh: leave size/offset alone
				break;
		}
	}

	_buildShapeFromProps(obj, shapeType, dims) {
		const o = obj.object3d;
		const scale = new THREE.Vector3(1, 1, 1);
		o.updateWorldMatrix(true, true);
		o.getWorldScale(scale);

		const sx = Math.max(1e-6, Math.abs(scale.x));
		const sy = Math.max(1e-6, Math.abs(scale.y));
		const sz = Math.max(1e-6, Math.abs(scale.z));

		// Local offset is scaled into parent space; does not affect RB velocities
		const off = this.shapeOffset || { x: 0, y: 0, z: 0 };
		const offset = { x: (off.x || 0) * sx, y: (off.y || 0) * sy, z: (off.z || 0) * sz };

		switch (shapeType) {
			case 'box': {
				let bs = dims.boxSize;
				if (!bs || !Number.isFinite(bs.x) || !Number.isFinite(bs.y) || !Number.isFinite(bs.z)) {
					const bb = this._resolveGeometry(o, { merge: true, type: 'box' });
					bs = { x: (bb.max.x - bb.min.x), y: (bb.max.y - bb.min.y), z: (bb.max.z - bb.min.z) };
				}
				const hx = 0.5 * bs.x * sx;
				const hy = 0.5 * bs.y * sy;
				const hz = 0.5 * bs.z * sz;
				return { type: 'box', hx, hy, hz, offset };
			}

			case 'sphere': {
				let r = Number.isFinite(dims.sphereRadius) ? dims.sphereRadius : undefined;
				if (r == null) {
					const sphere = this._resolveGeometry(o, { merge: true, type: 'sphere' });
					r = sphere.radius;
				}
				const radius = r * Math.max(sx, sy, sz);
				return { type: 'sphere', r: radius, offset };
			}

			case 'capsule': {
				let h = Number.isFinite(dims.capsuleHeight) ? dims.capsuleHeight : undefined;
				let r = Number.isFinite(dims.capsuleRadius) ? dims.capsuleRadius : undefined;

				if (h == null || r == null) {
					const bb = this._resolveGeometry(o, { merge: true, type: 'box' });
					const sx0 = (bb.max.x - bb.min.x);
					const sy0 = (bb.max.y - bb.min.y);
					const sz0 = (bb.max.z - bb.min.z);

					const eps = 1e-6;
					const r0  = 0.5 * Math.min(sx0, sz0);
					r = (r ?? r0);
					r = Math.min(r, Math.max(0, sy0 * 0.5 - eps));
					h = (h ?? (sy0 - 2 * r));
					h = Math.max(0, h);
				}

				const halfHeight = 0.5 * h * sy;              // along Y
				const radius     = Math.max(1e-6, r) * Math.max(sx, sz);
				return { type: 'capsule', halfHeight, radius, offset };
			}

			case 'convex': {
				const geom = this._resolveGeometry(o, { merge: true, type: 'convex' }).clone();
				geom.applyMatrix4(new THREE.Matrix4().makeScale(sx, sy, sz));
				const verts = this._getPositionFloat32(geom);
				return { type: 'convex', vertices: verts, space: 'local' };
			}

			case 'trimesh':
			default: {
				const src = this._resolveGeometry(o, { merge: true, type: 'trimesh' }).clone();
				src.applyMatrix4(new THREE.Matrix4().makeScale(sx, sy, sz));
				const { vertices, indices } = this._getTriMeshBuffers(src);
				return { type: 'trimesh', vertices, indices, space: 'local' };
			}
		}
	}

	/* =========================================================
	 *  GEOMETRY RESOLUTION
	 * ======================================================= */

	_resolveGeometry(obj3d, options = {}) {
		const { merge = false, type } = options;

		if (!merge) {
			if (obj3d.geometry && obj3d.isMesh !== false) return obj3d.geometry;
			let geom = null;
			obj3d.traverse(n => { if (!geom && n.isMesh && n.geometry) geom = n.geometry; });
			if (!geom) throw new Error(`[RigidbodyManager] No geometry found for ${obj3d.name}`);
			return geom;
		}

		const meshes = [];
		obj3d.traverse((node) => {
			if (node.isMesh && node.geometry) meshes.push(node);
		});
		if (meshes.length === 0) {
			throw new Error(`[RigidbodyManager] No geometries to merge for ${obj3d.name}`);
		}

		const parentInvMatrix = new THREE.Matrix4();
		obj3d.updateMatrixWorld(true);
		parentInvMatrix.copy(obj3d.matrixWorld).invert();

		// Fast paths for bounds-only shapes
		if (type === 'box') {
			const combinedBox = new THREE.Box3();
			let first = true;

			for (const mesh of meshes) {
				mesh.updateMatrixWorld(true);
				const geom = mesh.geometry.clone();
				const relative = new THREE.Matrix4().multiplyMatrices(parentInvMatrix, mesh.matrixWorld);
				geom.applyMatrix4(relative);
				geom.computeBoundingBox();
				if (first) {
					combinedBox.copy(geom.boundingBox);
					first = false;
				} else {
					combinedBox.union(geom.boundingBox);
				}
			}
			return combinedBox;
		}

		if (type === 'sphere') {
			const geometries = [];
			for (const mesh of meshes) {
				mesh.updateMatrixWorld(true);
				const relative = new THREE.Matrix4().multiplyMatrices(parentInvMatrix, mesh.matrixWorld);
				const geom = mesh.geometry.clone();
				geom.applyMatrix4(relative);
				geometries.push(geom);
			}
			const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
			merged.computeBoundingSphere();
			return merged.boundingSphere;
		}

		// Full merge
		const geometries = [];
		for (const mesh of meshes) {
			mesh.updateMatrixWorld(true);
			const relative = new THREE.Matrix4().multiplyMatrices(parentInvMatrix, mesh.matrixWorld);
			const geom = mesh.geometry.clone();
			geom.applyMatrix4(relative);
			geometries.push(geom);
		}

		const merged = BufferGeometryUtils.mergeGeometries(geometries, type === 'trimesh');
		return merged;
	}

	_getPositionFloat32(geom) {
		const attr = geom.attributes.position;
		if (attr.isInterleavedBufferAttribute) {
			const src    = attr.data.array;
			const stride = attr.data.stride;
			const offset = attr.offset;
			const count  = attr.count;

			const out = new Float32Array(count * 3);
			for (let i = 0; i < count; i++) {
				const si = i * stride + offset;
				out[i*3 + 0] = src[si + 0];
				out[i*3 + 1] = src[si + 1];
				out[i*3 + 2] = src[si + 2];
			}
			return out;
		}

		const arr = attr.array;
		return (arr instanceof Float32Array) ? arr : new Float32Array(arr);
	}

	_getTriMeshBuffers(geom) {
		const vertices = this._getPositionFloat32(geom);
		let indices;

		if (geom.index && geom.index.array) {
			const src = geom.index.array;
			indices = (src instanceof Uint32Array) ? src
				: (src instanceof Uint16Array ? new Uint32Array(src) : new Uint32Array(src));
		} else {
			const vcount = vertices.length / 3;
			indices = new Uint32Array(vcount);
			for (let i = 0; i < vcount; i++) indices[i] = i;
		}

		if ((vertices.length % 3) !== 0) {
			throw new Error(`[RigidbodyManager] Vertices length not multiple of 3 for ${geom.name}`);
		}

		const vcount = vertices.length / 3;
		for (let i = 0; i < indices.length; i++) {
			const ii = indices[i];
			if (ii < 0 || ii >= vcount) {
				throw new Error(`trimesh index out of range: ${ii}/${vcount}`);
			}
		}

		return { vertices, indices };
	}

	/* =========================================================
	 *  EDITOR WIREFRAME HELPERS
	 * ======================================================= */

	_isSelected() {
		// Minimal assumption: editor exists in editor mode and exposes isSelected
		return window._editor?.isSelected?.(this.d3dobject) ?? true;
	}

	_ensureHelperGroup() {
		if (this.__rbHelper && this.__rbHelper.parent === this.d3dobject.object3d) return;
	
		this._clearHelperGroup();
	
		const g = new THREE.Group();
		g.name = '__rbHelper';
	
		// Force the whole group to the end of the render queue.
		g.renderOrder = this._helperRenderOrder;
	
		// Re-assert state every frame (if materials get mutated elsewhere).
		g.onBeforeRender = () => this._enforceHelperRenderState(g);
	
		this.__rbHelper = g;
		this.d3dobject.object3d.add(g);
	}
	_enforceHelperRenderState(root) {
		const wantOrder   = this._helperRenderOrder ?? 10_000_000;
		const wantOpacity = this._wireOpacity ?? 0.95;
	
		root.traverse((obj) => {
			obj.renderOrder = wantOrder;
			obj.frustumCulled = false; // helpers are overlays; avoid culling popping
	
			const mat = obj.material;
			if (!mat) return;
			const mats = Array.isArray(mat) ? mat : [mat];
	
			for (const m of mats) {
				if (!m) continue;
				m.depthTest = false;
				m.depthWrite = false;
				m.transparent = true;
				if (m.opacity !== undefined) m.opacity = wantOpacity;
			}
		});
	}

	_clearHelperGroup() {
		if (!this.__rbHelper) return;

		this.__rbHelper.traverse(n => {
			if (n.geometry) n.geometry.dispose?.();
			if (n.material) n.material.dispose?.();
		});

		this.__rbHelper.parent?.remove(this.__rbHelper);
		this.__rbHelper = null;
	}

	_makeLine(geom, color) {
		const mat = new THREE.LineBasicMaterial({
			color,
			depthTest:  false,
			depthWrite: false,
			transparent: true,
			opacity: this._wireOpacity
		});
		return new THREE.LineSegments(new THREE.EdgesGeometry(geom), mat);
	}

	_buildWireBox({ hx, hy, hz, offset, color }) {
		const geom = new THREE.BoxGeometry(hx*2, hy*2, hz*2);
		const line = this._makeLine(geom, color);
		if (offset) line.position.set(offset.x || 0, offset.y || 0, offset.z || 0);
		return line;
	}

	_buildWireSphere({ r, offset, color }) {
		const segs = 48;
		const geo  = new THREE.SphereGeometry(r, segs, segs);
		const mat  = new THREE.LineBasicMaterial({
			color,
			depthTest:  false,
			depthWrite: false,
			transparent: true,
			opacity: this._wireOpacity
		});

		const group = new THREE.Group();
		group.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), mat));
		if (offset) group.position.set(offset.x || 0, offset.y || 0, offset.z || 0);
		return group;
	}

	_buildWireCapsule({ radius, halfHeight, offset, color }) {
		const group = new THREE.Group();
		const segs  = 32;
		const h     = Math.max(0, halfHeight * 2);

		const mat = new THREE.LineBasicMaterial({
			color,
			depthTest:  false,
			depthWrite: false,
			transparent: true,
			opacity: this._wireOpacity
		});

		if (h > 0) {
			const cyl = new THREE.CylinderGeometry(radius, radius, h, segs, 1, true);
			group.add(new THREE.LineSegments(new THREE.WireframeGeometry(cyl), mat));
		}

		const sphTop = new THREE.SphereGeometry(radius, segs, Math.max(8, segs/2), 0, Math.PI*2, 0, Math.PI/2);
		sphTop.translate(0,  h * 0.5, 0);
		group.add(new THREE.LineSegments(new THREE.WireframeGeometry(sphTop), mat));

		const sphBot = new THREE.SphereGeometry(radius, segs, Math.max(8, segs/2), 0, Math.PI*2, Math.PI/2, Math.PI/2);
		sphBot.translate(0, -h * 0.5, 0);
		group.add(new THREE.LineSegments(new THREE.WireframeGeometry(sphBot), mat));

		if (offset) group.position.set(offset.x || 0, offset.y || 0, offset.z || 0);
		return group;
	}

	_buildWireFromGeometry(geom, color) {
		const g = geom.clone();
		g.computeBoundingSphere?.();

		const mat = new THREE.LineBasicMaterial({
			color,
			depthTest:  false,
			depthWrite: false,
			transparent: true,
			opacity: this._wireOpacity
		});

		return new THREE.LineSegments(new THREE.EdgesGeometry(g), mat);
	}

	/***
		HELPERS FOR DRAWING GIZMOS
	****/
	/* Build a cheap signature so we only rebuild when needed */
	_sigForHelper(shape, shapeType) {
		switch (shapeType) {
			case 'box': {
				const o = shape.offset || {x:0,y:0,z:0};
				return `box|${shape.hx}|${shape.hy}|${shape.hz}|${o.x}|${o.y}|${o.z}`;
			}
			case 'sphere': {
				const o = shape.offset || {x:0,y:0,z:0};
				return `sphere|${shape.r}|${o.x}|${o.y}|${o.z}`;
			}
			case 'capsule': {
				const o = shape.offset || {x:0,y:0,z:0};
				return `capsule|${shape.radius}|${shape.halfHeight}|${o.x}|${o.y}|${o.z}`;
			}
			case 'convex': {
				const v = shape.vertices;
				const id = v ? `${v.buffer.byteLength}:${v.length}` : 'none';
				const ver = shape.version ?? 0;
				return `convex|${id}|v${ver}`;
			}
			default: return 'unknown';
		}
	}
	
	/* Lean, diffed, and self-contained */
	_updateGizmo(shape, shapeType, kind) {
		const color =
			(kind === 'fixed') ? 0xaaaaaa :
			(kind === 'kinematicPosition') ? 0xffa500 : 0x38a0ff;
	
		this._ensureHelperGroup();
		this.__rbHelper.visible = this._isSelected();
	
		// diff
		const sig = this._sigForHelper(shape, shapeType);
		if (this.__helperSig === sig && this.__helperColor === color) return;
	
		// clear (only if changed)
		for (let i = this.__rbHelper.children.length - 1; i >= 0; i--) {
			const c = this.__rbHelper.children[i];
			this.__rbHelper.remove(c);
			c.geometry?.dispose?.();
			c.material?.dispose?.();
		}
	
		let node = null;
	
		// inline overlay setter (no helpers elsewhere)
		const setOverlay = (obj) => {
			obj.renderOrder = 10_000_000;
			obj.frustumCulled = false;
			const applyMat = (m) => {
				if (!m) return;
				m.depthTest = false;
				m.depthWrite = false;
				m.transparent = true;
				if (m.opacity !== undefined) m.opacity = this._wireOpacity ?? 0.95;
			};
			if (obj.material) {
				if (Array.isArray(obj.material)) obj.material.forEach(applyMat);
				else applyMat(obj.material);
			}
			return obj;
		};
	
		switch (shapeType) {
			case 'box': {
				const geom = new THREE.BoxGeometry(shape.hx*2, shape.hy*2, shape.hz*2);
				const mat  = new THREE.LineBasicMaterial({ color });
				node = new THREE.LineSegments(new THREE.EdgesGeometry(geom), mat);
				if (shape.offset) node.position.set(shape.offset.x||0, shape.offset.y||0, shape.offset.z||0);
				setOverlay(node);
				break;
			}
	
			case 'sphere': {
				const segs = 48;
				const geo  = new THREE.SphereGeometry(shape.r, segs, segs);
				const mat  = new THREE.LineBasicMaterial({ color });
				node = new THREE.LineSegments(new THREE.WireframeGeometry(geo), mat);
				if (shape.offset) node.position.set(shape.offset.x||0, shape.offset.y||0, shape.offset.z||0);
				setOverlay(node);
				break;
			}
	
			case 'capsule': {
				const group = new THREE.Group();
				const segs  = 32;
				const h     = Math.max(0, shape.halfHeight * 2);
	
				const mat = new THREE.LineBasicMaterial({ color });
	
				if (h > 0) {
					const cyl = new THREE.CylinderGeometry(shape.radius, shape.radius, h, segs, 1, true);
					group.add(setOverlay(new THREE.LineSegments(new THREE.WireframeGeometry(cyl), mat.clone())));
				}
	
				const top = new THREE.SphereGeometry(shape.radius, segs, Math.max(8, segs/2), 0, Math.PI*2, 0, Math.PI/2);
				top.translate(0,  h*0.5, 0);
				group.add(setOverlay(new THREE.LineSegments(new THREE.WireframeGeometry(top), mat.clone())));
	
				const bot = new THREE.SphereGeometry(shape.radius, segs, Math.max(8, segs/2), 0, Math.PI*2, Math.PI/2, Math.PI/2);
				bot.translate(0, -h*0.5, 0);
				group.add(setOverlay(new THREE.LineSegments(new THREE.WireframeGeometry(bot), mat.clone())));
	
				if (shape.offset) group.position.set(shape.offset.x||0, shape.offset.y||0, shape.offset.z||0);
				node = group;
				setOverlay(node);
				break;
			}
	
			case 'convex': {
				const verts = shape.vertices;
				if (!(verts instanceof Float32Array)) {
					throw new Error('[RigidbodyManager] Convex helper expects shape.vertices: Float32Array');
				}
				const puff = this._convexBuff ?? 1.005;
				const geom = buildConvexWireGeometry(verts, puff);
			
				const mat = new THREE.LineBasicMaterial({
					color,
					depthTest: false,
					depthWrite: false,
					transparent: true,
					opacity: this._wireOpacity ?? 0.95
				});
			
				node = new THREE.LineSegments(geom, mat);
				node.renderOrder = this._helperRenderOrder ?? 10_000_000;
				node.frustumCulled = false;
				break;
			}
	
			default:
				// nothing to draw
				break;
		}
	
		if (node) this.__rbHelper.add(node);
		this.__helperSig   = sig;
		this.__helperColor = color;
	}
	
	/* =========================================================
	 * INTERNAL: MOTION SAMPLING
	 * ======================================================= */
	_takeSnapshot() {
		return {
			pos: this.d3dobject.worldPosition.clone(),
			rot: this.d3dobject.worldQuaternion.clone()
		};
	}
	_sampleMotion() {
		const now = this._takeSnapshot();
		const then = this._lastSnapshot || now;
		const dt = _physics.fixedDt;
		
		if(dt <= 0) {
			this._lastSnapshot = now;
			return;
		}
		
		// Position
		{
			const posDelta = now.pos.clone().sub(then.pos);
			const velocity = posDelta.clone().divideScalar(dt);
			
			this._cachedVelocity.copy(velocity);
			this._cachedSpeed = velocity.length();
		}
		// Rotation → angular velocity (world vector, rad/s)
		{
			// delta rotation from then → now
			const dq = now.rot.clone().multiply(then.rot.clone().invert()).normalize();
		
			// make sure we take the shortest arc (q and -q are same rotation)
			// flipping when w < 0 avoids 2π jumps
			if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
		
			// angle and axis from quaternion
			// theta in [0, π]
			const w = THREE.MathUtils.clamp(dq.w, -1, 1);
			const theta = 2 * Math.acos(w);                   // total angle rotated
			const sinHalf = Math.sqrt(Math.max(0, 1 - w*w));  // |v| = sin(theta/2)
		
			let axisX = 0, axisY = 0, axisZ = 0;
			if (sinHalf > 1e-8) {
				const inv = 1 / sinHalf;                      // normalize imaginary part
				axisX = dq.x * inv;
				axisY = dq.y * inv;
				axisZ = dq.z * inv;
			} else {
				// near-identity rotation: axis numerically unstable → use imaginary part directly
				// this keeps tiny spins from snapping
				axisX = dq.x * 2; 
				axisY = dq.y * 2; 
				axisZ = dq.z * 2;
			}
		
			// angular velocity ω = axis * (theta / dt)
			const scale = (theta / dt);
			this._cachedAngularVelocity.set(axisX * scale, axisY * scale, axisZ * scale);
		}
		
		this._lastSnapshot = now;
	}
	
	// add these helpers (copied from your old code)
	_changed(a, b) {
		if (!a) return true;
		return (
			a.kind !== b.kind ||
			a.shapeType !== b.shapeType ||
			a.friction !== b.friction ||
			a.restitution !== b.restitution ||
			a.density !== b.density ||
			a.drag !== b.drag ||
			a.angularDrag !== b.angularDrag ||
			this._shapeChanged(a.shape, b.shape)
		);
	}
	_shapeChanged(a, b) {
		if (!a || !b) return true;
		if (a.type !== b.type) return true;
		switch (a.type) {
			case 'box':     return a.hx !== b.hx || a.hy !== b.hy || a.hz !== b.hz;
			case 'sphere':  return a.r !== b.r;
			case 'capsule': return a.halfHeight !== b.halfHeight || a.radius !== b.radius;
			case 'trimesh': return a.vertices !== b.vertices || a.indices !== b.indices;
			case 'convex':  return a.vertices !== b.vertices;
			default:        return true;
		}
	}

	/* =========================================================
	 *  UTILS
	 * ======================================================= */

	_clamp01(v) {
		return v < 0 ? 0 : (v > 1 ? 1 : v);
	}
}