import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import {
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
		
		this._bodies = new Map(); // d3dobj.uuid -> { rb, colliders:[], kind, batched }
		this._toObj  = new Map(); // rb.handle -> d3dobj
		
		this._toObjCollider = new Map(); // collider.handle -> d3dobj (for batched fixed)
		this._staticRoot = null;         // single fixed rigidbody for all static colliders
		
		this._raycaster = new THREE.Raycaster();
		this._raycastHits = [];
	}

	async init(gravity = { x: 0, y: -9.81, z: 0 }) {
		await RAPIER.init();
		this.world = new RAPIER.World(gravity);
		this.ready = true;
	
		this.world.integrationParameters.maxVelocityIterations = 8;
		this.world.integrationParameters.maxPositionIterations = 4;
		this.world.integrationParameters.maxStabilizationIterations = 2;
		this.world.integrationParameters.erp = 0.3;
		this.world.integrationParameters.maxCcdSubsteps = 4;
	
		// One fixed RB that never moves; all static colliders attach to this.
		const desc = RAPIER.RigidBodyDesc.fixed();
		desc.setTranslation(0, 0, 0);
		desc.setRotation({ x: 0, y: 0, z: 0, w: 1 });
		this._staticRoot = this.world.createRigidBody(desc);
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
			this._bodies.forEach(({ rb, kind }, uuid) => {
				if (window.__blockPhysTest === true)
					return;
		
				// batched fixed has no rb, and fixed never moves anyway
				if (!rb || kind === 'fixed')
					return;
		
				// sleeping dynamics don't change pose; skip transform work
				if (rb.isSleeping && rb.isSleeping())
					return;
		
				const d3d = this._toObj.get(rb.handle);
				if (!d3d) return;
		
				const obj3d = d3d.object3d;
				if (!obj3d) return;
		
				const t = rb.translation();
				const q = rb.rotation();
		
				const parent = obj3d.parent;
		
				if (parent) {
					const worldPos  = _TMP_V1.set(t.x, t.y, t.z);
					const worldQuat = _TMP_Q1.set(q.x, q.y, q.z, q.w);
					const worldScl  = obj3d.scale;
		
					_TMP_M1.compose(worldPos, worldQuat, worldScl);
		
					parent.updateMatrixWorld(true, false);
					_TMP_M2.copy(parent.matrixWorld).invert().multiply(_TMP_M1);
		
					_TMP_M2.decompose(obj3d.position, obj3d.quaternion, obj3d.scale);
				} else {
					obj3d.position.set(t.x, t.y, t.z);
					obj3d.quaternion.set(q.x, q.y, q.z, q.w);
				}
		
				obj3d.updateMatrixWorld(true);
			});
		}
		
		return didSteps;
	}

	dispose() {
		if (this.world) {
			// Remove everything we created (including batched fixed colliders)
			this._bodies.forEach((pack) => {
				for (let i = 0; i < pack.colliders.length; i++)
					this.world.removeCollider(pack.colliders[i], true);
	
				if (pack.rb)
					this.world.removeRigidBody(pack.rb);
			});
	
			// Remove the static root RB too
			if (this._staticRoot)
				this.world.removeRigidBody(this._staticRoot);
	
			// Free world memory (rapier3d-compat supports .free())
			this.world.free?.();
		}
	
		this._bodies.clear();
		this._toObj.clear();
		this._toObjCollider.clear();
	
		this._staticRoot = null;
		this.world = null;
		this.ready = false;
	}

	// -------------------- Rigidbodies / Colliders --------------------

	addRigidBody(d3dobj, opts = {}) {
		const kind = opts.kind || 'dynamic';
	
		// default: batch fixed unless explicitly disabled
		const batchStatic = (opts.batchStatic !== false);
	
		const worldPos = _TMP_V1;
		const worldQuat = _TMP_Q1;
		d3dobj.object3d.getWorldPosition(worldPos);
		d3dobj.object3d.getWorldQuaternion(worldQuat);
	
		// ---------- FIXED (BATCHED) ----------
		if (kind === 'fixed' && batchStatic) {
			const rb = null;
			const colliders = [];
	
			if (opts.shape) {
				const c = this._createColliderFromShape(opts.shape, this._staticRoot, opts, worldPos, worldQuat, true);
				colliders.push(c);
				this._toObjCollider.set(c.handle, d3dobj);
			}
	
			this._bodies.set(d3dobj.uuid, { rb, colliders, kind: 'fixed', batched: true });
			return null;
		}
	
		// ---------- NORMAL RB (DYNAMIC / KINEMATIC / UNBATCHED FIXED) ----------
		let desc;
		if (kind === 'fixed') desc = RAPIER.RigidBodyDesc.fixed();
		else if (kind === 'kinematicPosition') desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
		else {
			desc = RAPIER.RigidBodyDesc.dynamic();
	
			// CCD is expensive. Only turn it on if asked.
			if (opts.ccd !== false)
				desc.setCcdEnabled(true);
		}
	
		desc.setTranslation(worldPos.x, worldPos.y, worldPos.z);
		desc.setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
	
		// this isn't actually density; it's additional mass. keep if you rely on it, otherwise remove.
		desc.setAdditionalMass(Math.max(0.1, opts.density || 1.0));
	
		const rb = this.world.createRigidBody(desc);
		const colliders = [];
	
		if (opts.shape) {
			const c = this._createColliderFromShape(opts.shape, rb, opts, worldPos, worldQuat, false);
			colliders.push(c);
		}
	
		this._bodies.set(d3dobj.uuid, { rb, colliders, kind, batched: false });
		this._toObj.set(rb.handle, d3dobj);
		return rb;
	}

	remove(d3dobj) {
		const pack = this._bodies.get(d3dobj.uuid);
		if (!pack) return;
	
		for (let i = 0; i < pack.colliders.length; i++) {
			const c = pack.colliders[i];
			this._toObjCollider.delete(c.handle);
			this.world.removeCollider(c, true);
		}
	
		if (pack.rb) {
			this.world.removeRigidBody(pack.rb);
			this._toObj.delete(pack.rb.handle);
		}
	
		this._bodies.delete(d3dobj.uuid);
	}

	getBody(d3dobj) {
		const pack = this._bodies.get(d3dobj.uuid);
		return pack ? pack.rb : null;
	}

	_createColliderFromShape(shape, rb, opts, worldPos, worldQuat, batchedFixed = false) {
		let desc;
	
		switch (shape.type) {
			case 'box':     desc = RAPIER.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz); break;
			case 'sphere':  desc = RAPIER.ColliderDesc.ball(shape.r); break;
			case 'capsule': desc = RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius); break;
			case 'trimesh': desc = RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices); break;
			case 'convex':  desc = RAPIER.ColliderDesc.convexMesh(shape.vertices); break;
			default:        desc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5); break;
		}
	
		// ----- placement -----
		if (batchedFixed) {
			// collider local == world because staticRoot is identity at origin
			let tx = worldPos.x, ty = worldPos.y, tz = worldPos.z;
	
			// apply rotated offset (offset is in object local space)
			if (shape.offset) {
				_TMP_V1.set(shape.offset.x || 0, shape.offset.y || 0, shape.offset.z || 0);
				_TMP_V1.applyQuaternion(worldQuat);
	
				tx += _TMP_V1.x;
				ty += _TMP_V1.y;
				tz += _TMP_V1.z;
			}
	
			desc.setTranslation(tx, ty, tz);
			if (desc.setRotation)
				desc.setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
		} else {
			// normal: rb already has world transform; offset is local
			if (shape.offset)
				desc.setTranslation(shape.offset.x, shape.offset.y, shape.offset.z);
		}
	
		// ----- material -----
		if (opts.friction != null) desc.setFriction(opts.friction);
		if (opts.restitution != null) desc.setRestitution(opts.restitution);
	
		// density is meaningless for fixed; don't set it for batched fixed
		if (!batchedFixed)
			desc.setDensity(Math.max(0.1, opts.density || 1.0));
	
		// collision groups: do this properly later, but keep your current behavior
		desc.setCollisionGroups(0xFFFF0001);
	
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
		
		let objects = opts.objects || _root.__meshStore || [];
		
		if(filter && typeof filter !== 'function')
			throw new Error('Invalid filter value. Filter must be a Function<boolean>');
		
		const object3ds = [];
		objects.forEach(o => {
			if(filter && !filter(o))
				return;
			
			if(o?.object3d && isLiveObject(o))
				object3ds.push(o.object3d);
		});
		objects = object3ds;
		
		if (!objects || objects.length === 0) 
			return null;
		
		// reuse raycaster
		const rc = this._raycaster;
		rc.ray.origin.copy(origin);
		rc.ray.direction.copy(direction);
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
	
	rigidcast(origin, direction, opts = {}) {
		if(!this.world)
			return null;
	
		const filter  = opts.filter;
		const all     = !!opts.all;
		const maxDist = Number(opts.maxDistance);
		const solid   = (opts.solid !== false);
	
		if(filter && typeof filter !== 'function')
			throw new Error('Invalid filter value. Filter must be a Function<boolean>');
	
		if(!Number.isFinite(maxDist) || maxDist <= 0)
			return null;
	
		const ray = this._rapierRay || (this._rapierRay = new RAPIER.Ray(
			{ x: 0, y: 0, z: 0 },
			{ x: 0, y: 0, z: 1 }
		));
	
		ray.origin.x = origin.x;
		ray.origin.y = origin.y;
		ray.origin.z = origin.z;
		ray.dir.x = direction.x;
		ray.dir.y = direction.y;
		ray.dir.z = direction.z;
	
		const resolveD3D = (collider) => {
			if(!collider)
				return null;
	
			const d3dFixed = this._toObjCollider?.get(collider.handle);
			if(d3dFixed)
				return d3dFixed;
	
			const rbHandle = collider.parent?.();
			if(rbHandle != null) {
				const d3d = this._toObj?.get(rbHandle);
				if(d3d)
					return d3d;
			}
	
			return collider.userData?.d3dobject || null;
		};
	
		// OPTIONAL: respect opts.objects like your THREE raycast does
		let allow = null;
		if(Array.isArray(opts.objects) && opts.objects.length > 0) {
			allow = new Set();
			for(let i = 0; i < opts.objects.length; i++) {
				const o = opts.objects[i];
				if(o?.uuid && o?.object3d) allow.add(o.uuid);
				else if(o?.userData?.d3dobject?.uuid) allow.add(o.userData.d3dobject.uuid);
				else if(o?.object3d?.userData?.d3dobject?.uuid) allow.add(o.object3d.userData.d3dobject.uuid);
			}
			if(allow.size < 1) allow = null;
		}
	
		const predicate = (filter || allow)
			? (collider) => {
				const d3d = resolveD3D(collider);
				if(!d3d)
					return false;
	
				if(allow && !allow.has(d3d.uuid))
					return false;
	
				if(filter)
					return !!filter(d3d);
	
				return true;
			}
			: undefined;
	
		const excludeCollider = opts.excludeCollider || null;
		const excludeRigidBody = opts.excludeRigidBody || null;
	
		if(!all) {
			const hit = this.world.castRayAndGetNormal(
				ray,
				maxDist,
				solid,
				undefined,
				undefined,
				excludeCollider,
				excludeRigidBody,
				predicate
			);
	
			if(!hit)
				return null;
	
			const collider = hit.collider;                 // <-- FIX
			const toi = hit.timeOfImpact;                  // <-- FIX
			const d3d = resolveD3D(collider);
			if(!d3d)
				return null;
	
			return {
				hit: true,
				point: new THREE.Vector3(
					origin.x + direction.x * toi,
					origin.y + direction.y * toi,
					origin.z + direction.z * toi
				),
				normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
				distance: toi,
				object: d3d,
				colliderHandle: collider?.handle
			};
		}
	
		const out = this._raycastHits;
		out.length = 0;
	
		this.world.intersectionsWithRay(
			ray,
			maxDist,
			solid,
			(intersect) => {
				const collider = intersect.collider;        // <-- FIX
				const toi = intersect.timeOfImpact;         // <-- FIX
				const d3d = resolveD3D(collider);
				if(!d3d)
					return true;
	
				out.push({
					hit: true,
					point: new THREE.Vector3(
						origin.x + direction.x * toi,
						origin.y + direction.y * toi,
						origin.z + direction.z * toi
					),
					distance: toi,
					object: d3d,
					colliderHandle: collider?.handle
				});
	
				return true;
			},
			undefined,
			undefined,
			excludeCollider,
			excludeRigidBody,
			predicate
		);
	
		if(out.length < 1)
			return null;
	
		out.sort((a, b) => a.distance - b.distance);
		return out;
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
	 * @returns {Array<{object:any, distance:number, centerDistance:number, point:THREE.Vector3}>}
	 */
	overlapSphere(center, radius, opts = {}) {
		const filter = opts.filter;
		let objects = opts.objects || _root.children;
		
		if(filter && typeof filter !== 'function')
			throw new Error('Invalid filter value. Filter must be a Function<boolean>');
		
		const object3ds = [];
		objects.forEach(o => {
			if(filter && !filter(o))
				return;
			
			if(o?.object3d && isLiveObject(o))
				object3ds.push(o.object3d);
		});
		objects = object3ds;
		
		const querySphere = new THREE.Sphere(center.clone(), radius);
	
		// --- reusable temps to avoid GC
		const tmpBox = new THREE.Box3();
		const tmpSphere = new THREE.Sphere();
		const tmpV = new THREE.Vector3();
		const tmpDir = new THREE.Vector3();
		const tmpHit = new THREE.Vector3();
	
		const out = [];
	
		for (let obj of objects) {
			if (!obj || !obj.visible) continue;
	
			let hit = false;
			let centerDistance;
			let surfaceDistance;
	
			const geo = obj.geometry;
			if (geo && (geo.boundingSphere || geo.boundingBox)) {
				if (!geo.boundingSphere && !geo.boundingBox) geo.computeBoundingSphere?.();
	
				if (geo.boundingSphere) {
					// world-space object sphere
					tmpSphere.copy(geo.boundingSphere).applyMatrix4(obj.matrixWorld);
	
					// overlap test
					hit = tmpSphere.intersectsSphere(querySphere);
	
					// distances
					centerDistance = tmpSphere.center.distanceTo(center);
					surfaceDistance = Math.max(0, centerDistance - (tmpSphere.radius + querySphere.radius));
	
					if (hit) {
						// hit point = closest point on object sphere to query center
						tmpDir.subVectors(center, tmpSphere.center);
						if (tmpDir.lengthSq() === 0) tmpDir.set(0, 1, 0);
						else tmpDir.normalize();
	
						tmpHit.copy(tmpSphere.center).addScaledVector(tmpDir, tmpSphere.radius);
					}
				} else {
					// fallback to box if sphere missing
					tmpBox.copy(geo.boundingBox).applyMatrix4(obj.matrixWorld);
	
					hit = tmpBox.intersectsSphere(querySphere);
					centerDistance = tmpBox.getCenter(tmpV).distanceTo(center);
	
					const dToBox = tmpBox.distanceToPoint(center);
					surfaceDistance = Math.max(0, dToBox - querySphere.radius);
	
					if (hit) {
						// hit point = closest point on box to query center
						tmpBox.clampPoint(center, tmpHit);
					}
				}
			} else {
				// Generic path: compute a world box from the object hierarchy
				tmpBox.setFromObject(obj);
	
				if (!tmpBox.isEmpty()) {
					hit = tmpBox.intersectsSphere(querySphere);
					centerDistance = tmpBox.getCenter(tmpV).distanceTo(center);
	
					const dToBox = tmpBox.distanceToPoint(center);
					surfaceDistance = Math.max(0, dToBox - querySphere.radius);
	
					if (hit) {
						tmpBox.clampPoint(center, tmpHit);
					}
				} else {
					// As a last resort, treat object's world position as a point
					obj.getWorldPosition(tmpV);
					centerDistance = tmpV.distanceTo(center);
	
					hit = centerDistance <= querySphere.radius;
					surfaceDistance = Math.max(0, centerDistance - querySphere.radius);
	
					if (hit) {
						tmpHit.copy(tmpV);
					}
				}
			}
	
			if (hit) {
				out.push({
					object: obj.userData?.d3dobject || obj,
					distance: surfaceDistance,     // 0 if overlapping/inside
					centerDistance,
					point: tmpHit.clone()          // world-space hit point
				});
			}
		}
	
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
		const direction = new THREE.Vector3().subVectors(end, start).normalize();
		const maxDistance = start.distanceTo(end);
		
		const hit = this.raycast(start, direction, {...opts, maxDistance});
		
		if (!hit) return null;
		
		return hit;
	}
	
	rigidline(start, end, opts = {}) {
		// Compute direction & distance (exactly like raycast does internally)
		const direction = new THREE.Vector3().subVectors(end, start).normalize();
		const maxDistance = start.distanceTo(end);
		
		const hit = this.rigidcast(start, direction, {...opts, maxDistance});
		
		if (!hit) return null;
		
		return hit;
	}
	
	rigidsphere(center, radius, opts = {}) {
		if(!this.world)
			return null;
	
		const filter = opts.filter;
		const all = (opts.all !== false); // default all for overlaps
		const solid = (opts.solid !== false);
	
		if(filter && typeof filter !== 'function')
			throw new Error('Invalid filter value. Filter must be a Function<boolean>');
	
		const r = Number(radius);
		if(!Number.isFinite(r) || r <= 0)
			return null;
	
		// optional: limit like your THREE overlapSphere did
		let allow = null;
		if(Array.isArray(opts.objects) && opts.objects.length > 0) {
			allow = new Set();
			for(let i = 0; i < opts.objects.length; i++) {
				const o = opts.objects[i];
				if(o?.uuid && o?.object3d) allow.add(o.uuid);
				else if(o?.userData?.d3dobject?.uuid) allow.add(o.userData.d3dobject.uuid);
				else if(o?.object3d?.userData?.d3dobject?.uuid) allow.add(o.object3d.userData.d3dobject.uuid);
			}
			if(allow.size < 1) allow = null;
		}
	
		const resolveD3D = (collider) => {
			if(!collider)
				return null;
	
			const d3dFixed = this._toObjCollider?.get(collider.handle);
			if(d3dFixed)
				return d3dFixed;
	
			const rbHandle = collider.parent?.();
			if(rbHandle != null) {
				const d3d = this._toObj?.get(rbHandle);
				if(d3d)
					return d3d;
			}
	
			return collider.userData?.d3dobject || null;
		};
	
		// Reuse a ball shape object (no GC)
		const shape = this._rapierBall || (this._rapierBall = new RAPIER.Ball(r));
		if(shape.radius !== r) {
			// rapier shapes are immutable-ish; easiest is recreate when radius changes
			this._rapierBall = new RAPIER.Ball(r);
		}
	
		const pos = { x: center.x, y: center.y, z: center.z };
		const rot = { x: 0, y: 0, z: 0, w: 1 };
	
		// results
		const out = this._raycastHits;
		out.length = 0;
	
		// temp output point
		const tmpP = _TMP_V1;
		const tmpHit = new THREE.Vector3();
	
		const excludeCollider = opts.excludeCollider || null;
		const excludeRigidBody = opts.excludeRigidBody || null;
	
		// Rapier gives you intersecting colliders; we then compute a contact-ish point
		this.world.intersectionsWithShape(
			pos,
			rot,
			this._rapierBall,
			(collider) => {
				if(excludeCollider && collider.handle === excludeCollider)
					return true;
	
				if(excludeRigidBody) {
					const rbHandle = collider.parent?.();
					if(rbHandle != null && rbHandle === excludeRigidBody)
						return true;
				}
	
				const d3d = resolveD3D(collider);
				if(!d3d)
					return true;
	
				if(allow && !allow.has(d3d.uuid))
					return true;
	
				if(filter && !filter(d3d))
					return true;
	
				// closest point on collider to sphere center (world space)
				// NOTE: Rapier has `collider.shape` + `collider.translation/rotation`.
				// Best lightweight approach: use Rapier’s own point projection:
				const proj = collider.projectPoint(pos, solid); // returns { point, isInside }
				const px = proj.point.x, py = proj.point.y, pz = proj.point.z;
	
				tmpHit.set(px, py, pz);
	
				// distance from sphere surface to collider (0 if overlapping/inside)
				// if proj.isInside => center is inside collider => distance 0 for overlap purposes
				const dCenterToPoint = tmpHit.distanceTo(center);
				const surfaceDistance = proj.isInside ? 0 : Math.max(0, dCenterToPoint - r);
	
				out.push({
					hit: true,
					object: d3d,
					point: tmpHit.clone(),
					distance: surfaceDistance,
					colliderHandle: collider.handle
				});
	
				return true;
			},
			undefined,
			undefined,
			excludeCollider,
			excludeRigidBody
		);
	
		if(out.length < 1)
			return null;
	
		// nearest first
		out.sort((a, b) => a.distance - b.distance);
	
		return all ? out : out[0];
	}
	
	setTranslation(d3dobj, pos) {
		const pack = this._bodies.get(d3dobj.uuid);
		if (!pack) return;
	
		if (pack.rb) {
			pack.rb.setTranslation(pos, true);
			return;
		}
	
		// batched fixed: move its collider(s)
		if (!pack.colliders || pack.colliders.length < 1) return;
	
		// assume first collider is the main one
		const c = pack.colliders[0];
		c.setTranslation(pos);
	}
	
	setRotation(d3dobj, quat) {
		const pack = this._bodies.get(d3dobj.uuid);
		if (!pack) return;
	
		if (pack.rb) {
			pack.rb.setRotation(quat, true);
			return;
		}
	
		if (!pack.colliders || pack.colliders.length < 1) return;
	
		const c = pack.colliders[0];
		if (c.setRotation)
			c.setRotation(quat);
	}
}