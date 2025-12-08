import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import {
	updateObject,
	getHitNormalRotation,
	isLiveObject
} from './d3dutility.js';

const _TMP_V1 = new THREE.Vector3();
const _TMP_Q1 = new THREE.Quaternion();
const _TMP_M1 = new THREE.Matrix4();
const _TMP_M2 = new THREE.Matrix4();

export default class D3DPhysics {
	// -------------------- World Settings --------------------
	
	get gravity() {
		if (!this.world) return { x: 0, y: -9.81, z: 0 };
		const g = this.world.gravity;
		return { x: g.x, y: g.y, z: g.z };
	}
	
	set gravity(v) {
		if (!this.world) return;
		const gx = v?.x ?? 0;
		const gy = v?.y ?? -9.81;
		const gz = v?.z ?? 0;
		this.world.gravity = { x: gx, y: gy, z: gz };
	}
	
	constructor() {
		this.world = null;
		this.ready = false;
		this.fixedDt = 1 / 60;
		this._accum = 0;
		this.delta = 0;

		this._bodies = new Map(); // d3dobj.uuid -> { rb, colliders:[] }
		this._toObj  = new Map(); // rb.handle -> d3dobj
		this._raycaster = new THREE.Raycaster();
		this._raycastHits = [];
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
		this._accum = Math.min(this._accum + dt, this.fixedDt * 5); // clamp to avoid spiral
		let didSteps = 0;
	
		while(this._accum >= this.fixedDt) {
			this.world.timestep = this.fixedDt;
			this.world.step();
			this._accum -= this.fixedDt;
			didSteps++;
		}
		
		if (didSteps > 0) {
			// Sync RB -> Three/D3D *after* all substeps this render frame
			this._bodies.forEach(({ rb }, uuid) => {
				if(window.__blockPhysTest === true)
					return;
				
				const d3d = this._toObj.get(rb.handle);
				if (!d3d) return;
		
				const obj3d = d3d.object3d;
				if (!obj3d) return;
		
				const t = rb.translation();
				const q = rb.rotation();
		
				const parent = obj3d.parent;
				
				if (parent) {
					// World pose from Rapier
					const worldPos  = _TMP_V1.set(t.x, t.y, t.z);
					const worldQuat = _TMP_Q1.set(q.x, q.y, q.z, q.w);
					const worldScl  = obj3d.scale; // keep local scale
		
					_TMP_M1.compose(worldPos, worldQuat, worldScl);
		
					// parent^-1 * world = local
					parent.updateMatrixWorld(true, false);
					_TMP_M2.copy(parent.matrixWorld).invert().multiply(_TMP_M1);
		
					_TMP_M2.decompose(obj3d.position, obj3d.quaternion, obj3d.scale);
				} else {
					// No parent: world == local
					obj3d.position.set(t.x, t.y, t.z);
					obj3d.quaternion.set(q.x, q.y, q.z, q.w);
				}
		
				obj3d.updateMatrixWorld(true);
			});
		}
		
		return didSteps;
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
	
	// -------------------- Raycasting --------------------
	raycast(origin, direction, opts = {}) {
		const filter    = opts.filter;
		const all       = !!opts.all;
		const maxDist   = Number(opts.maxDistance) || Infinity;
		const recursive = opts.recursive !== false;
		
		let objects = opts.objects || _root.children;
		
		if (filter) {
			// cheap filter: avoid allocations if possible
			objects = objects.filter(filter);
		}
		
		objects = objects.filter(isLiveObject);
		
		// Break down to object3d's themselves
		objects = objects.map(o => o.object3d).filter(Boolean);
	
		if (!objects || objects.length === 0) 
			return null;
		
		// reuse raycaster
		const rc = this._raycaster;
		rc.ray.origin.copy(origin);
		rc.ray.direction.copy(direction).normalize();
		rc.near = 0;
		rc.far  = maxDist;
	
		// optional: layer mask support
		if (opts.layers !== undefined) {
			rc.layers.mask = opts.layers;
		} else {
			// or rc.layers.set(0); if you want a default layer
		}
	
		// reuse the hits array
		this._raycastHits.length = 0;
		const intersects = rc.intersectObjects(objects, recursive);
	
		if (intersects.length === 0) 
			return null;
	
		if (!all) {
			// just find the first hit that belongs to a d3dobject
			for (let i = 0; i < intersects.length; i++) {
				const hit = intersects[i];
				const d3d = this._findD3DObjectFromHit(hit.object);
				if (!d3d) continue;
	
				return {
					hit: true,
					point: hit.point.clone(),
					distance: hit.distance,
					face: hit.face,
					object: d3d,
					object3d: hit.object,
					normal: hit.face?.normal || null
				};
			}
			return null;
		}
	
		// all hits
		for (let i = 0; i < intersects.length; i++) {
			const hit = intersects[i];
			const d3d = hit.object.userData.d3dobject;
			if (!d3d) continue;
	
			this._raycastHits.push({
				hit: true,
				point: hit.point.clone(),
				distance: hit.distance,
				face: hit.face,
				object: d3d,
				object3d: hit.object,
				normal: hit.face?.normal || null
			});
		}
	
		return this._raycastHits;
	}
	raycastFromCamera(camera, mouseX, mouseY, maxDistance = 1000) {
		if(!camera)
			return;
		
		if(!camera.isObject3D)
			camera = camera.object3d;
		
		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera({ x: mouseX, y: mouseY }, camera);
		return this.raycast(raycaster.ray.origin, raycaster.ray.direction, { maxDistance });
	}
	
	_findD3DObjectFromHit(obj) {
		while (obj) {
			const d3d = obj.userData?.d3dobject;
			if (d3d) return d3d;
			obj = obj.parent;
		}
		return null;
	}
	
	/**
	 * Check for objects overlapping a sphere in world space.
	 *
	 * @param {THREE.Vector3} center - Sphere center (world space)
	 * @param {number} radius - Sphere radius
	 * @param {object} [opts={}] - { objects?: Object3D[], filter?: (o)=>boolean }
	 * @returns {Array<{object:any, distance:number, centerDistance:number}>}
	 */
	overlapSphere(center, radius, opts = {}) {
		const filter = opts.filter;
		let objects = opts.objects || _root?.superObjectsThree || [];
		if (filter) objects = objects.filter(filter);
		
		objects = objects.filter(isLiveObject);
	
		const querySphere = new THREE.Sphere(center.clone(), radius);
	
		// --- reusable temps to avoid GC
		const tmpBox = new THREE.Box3();
		const tmpSphere = new THREE.Sphere();
		const tmpV = new THREE.Vector3();
	
		const out = [];
	
		for (let obj of objects) {
			// Skip invisible or no world matrix
			if (!obj || !obj.visible) continue;
	
			let hit = false;
			let centerDistance;
			let surfaceDistance;
	
			// Fast path: Mesh with geometry boundingSphere
			const geo = obj.geometry;
			if (geo && (geo.boundingSphere || geo.boundingBox)) {
				// make sure bounds exist
				if (!geo.boundingSphere && !geo.boundingBox) geo.computeBoundingSphere?.();
	
				if (geo.boundingSphere) {
					// world-space object sphere
					tmpSphere.copy(geo.boundingSphere).applyMatrix4(obj.matrixWorld);
	
					// overlap test
					hit = tmpSphere.intersectsSphere(querySphere);
	
					// distances
					centerDistance = tmpSphere.center.distanceTo(center);
					// distance from the query sphere surface to this object sphere surface (>= 0 if disjoint, 0 if overlapping)
					surfaceDistance = Math.max(0, centerDistance - (tmpSphere.radius + querySphere.radius));
				} else {
					// fallback to box if sphere missing
					tmpBox.copy(geo.boundingBox).applyMatrix4(obj.matrixWorld);
					hit = tmpBox.intersectsSphere(querySphere);
					centerDistance = tmpBox.getCenter(tmpV).distanceTo(center);
					// Box3.distanceToPoint is exact to the box surface; subtract the query radius
					const dToBox = tmpBox.distanceToPoint(center);
					surfaceDistance = Math.max(0, dToBox - querySphere.radius);
				}
			} else {
				// Generic path: compute a world box from the object hierarchy
				tmpBox.setFromObject(obj);
				if (!tmpBox.isEmpty()) {
					hit = tmpBox.intersectsSphere(querySphere);
					centerDistance = tmpBox.getCenter(tmpV).distanceTo(center);
					const dToBox = tmpBox.distanceToPoint(center);
					surfaceDistance = Math.max(0, dToBox - querySphere.radius);
				} else {
					// As a last resort, treat object's world position as a point
					obj.getWorldPosition(tmpV);
					centerDistance = tmpV.distanceTo(center);
					hit = centerDistance <= querySphere.radius;
					surfaceDistance = Math.max(0, centerDistance - querySphere.radius);
				}
			}
	
			if (hit) {
				out.push({
					object: obj.userData?.d3dobject || obj,
					distance: surfaceDistance,     // 0 if overlapping/inside
					centerDistance                 // distance to object bounds center
				});
			}
		}
	
		// nearest first
		out.sort((a, b) => a.centerDistance - b.centerDistance);
		return out;
	}
	
	/**
	 * Linecast between two world-space points (uses existing raycast).
	 *
	 * @param {THREE.Vector3} start - Starting point
	 * @param {THREE.Vector3} end - Ending point
	 * @param {object} [opts={}] - Same options as raycast
	 * @returns {object|null} Same format as raycast
	 */
	linecast(start, end, opts = {}) {
		// Compute direction & distance (exactly like raycast does internally)
		const direction = new THREE.Vector3().subVectors(end, start);
		const maxDistance = start.distanceTo(end);
		
		const hit = this.raycast(start, direction, {...opts, maxDistance});
		
		if (!hit) return null;
		
		return hit;
	}
}