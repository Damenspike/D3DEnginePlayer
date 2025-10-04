// The rigidbody manager, responsible for setting up the body (with fixes applied)
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export default function RigidbodyManager(d3dobject, component) {
	component._cache = null;
	component._rb = null;
	
	this.speed = 0;

	this.updateComponent = () => {
		if (!window._player) return;
		if (!_physics || !_physics.ready) {
			requestAnimationFrame(this.updateComponent);
			return;
		}

		const next = readComponent();

		// first-time setup
		if (!component.bodySetup) {
			setupBody(next);
			component.bodySetup = true;
			component._cache = next;
			
			d3dobject.__onBeforeRender = () => {
				this.speed = getSpeed();
			}
			return;
		}

		// rebuild if changed
		if (changed(component._cache, next)) {
			teardownBody();
			setupBody(next);
			component._cache = next;
		}
	};

	this.dispose = () => {
		teardownBody();
		component.bodySetup = false;
		component._cache = null;
	};
	
	this.setPosition = ({ x, y, z }) => {
		const q = d3dobject.object3d.quaternion; // keep current rotation
		_physics.setNextKinematicTransform(
			d3dobject,
			{ x, y, z },
			{ x: q.x, y: q.y, z: q.z, w: q.w }
		);
	};
	
	this.setRotation = ({ x, y, z, w }) => {
		const p = d3dobject.object3d.position; // keep current position
		_physics.setNextKinematicTransform(
			d3dobject,
			{ x: p.x, y: p.y, z: p.z },
			{ x, y, z, w }
		);
	};
	
	this.setTransform = (pos, rot) => {
		// both position + quaternion provided
		_physics.setNextKinematicTransform(d3dobject, pos, rot);
	};

	/* ------------------- helpers ------------------- */

	function readComponent() {
		const props = component.properties || {};

		const kind        = props.kind        ?? 'dynamic';
		let   shapeType   = props.shape       ?? 'trimesh';
		const friction    = Number(props.friction    ?? 0.5);
		const restitution = Number(props.bounciness  ?? 0.5);
		const density     = Number(props.density     ?? 1.0);
		const shapeBias   = Number(props.shapeBias   ?? 1.0);

		// Disallow trimesh on dynamic bodies
		if (kind !== 'fixed' && shapeType === 'trimesh') {
			console.warn(`[RigidbodyManager] Dynamic body cannot use trimesh. Using convex instead.`);
			shapeType = 'convex';
		}

		const shape = buildScaledShape(d3dobject, shapeType, shapeBias);
		return { kind, shapeType, shape, friction, restitution, density };
	}

	function setupBody(opts) {
		const rb = _physics.addRigidBody(d3dobject, {
			kind: opts.kind,
			shape: opts.shape,
			friction: clamp01(opts.friction),
			restitution: clamp01(opts.restitution),
			density: Math.max(1e-6, opts.density)
		});
		component._rb = rb;
	}

	function teardownBody() {
		if (component._rb) {
			_physics.remove(d3dobject);
			component._rb = null;
		}
	}

	function changed(a, b) {
		if (!a) return true;
		return (
			a.kind !== b.kind ||
			a.shapeType !== b.shapeType ||
			a.friction !== b.friction ||
			a.restitution !== b.restitution ||
			a.density !== b.density ||
			shapeChanged(a.shape, b.shape)
		);
	}

	function shapeChanged(a, b) {
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

	const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

	/* ------------------- shape builder ------------------- */

	function buildScaledShape(obj, shapeType, bias) {
		const o = obj.object3d;
		const s = new THREE.Vector3(1, 1, 1);
		o.updateWorldMatrix(true, true);
		o.getWorldScale(s);
		const sx = Math.abs(s.x), sy = Math.abs(s.y), sz = Math.abs(s.z);

		switch (shapeType) {
			case 'box': {
				const bb = resolveGeometry(o, { merge: true, type: 'box' });
				// half-extents
				let hx = (bb.max.x - bb.min.x) * 0.5 * sx * bias;
				let hy = (bb.max.y - bb.min.y) * 0.5 * sy * bias;
				let hz = (bb.max.z - bb.min.z) * 0.5 * sz * bias;

				// safety: give “plane” some thickness
				const minThickness = 0.25;
				if (hy < minThickness * 0.5) hy = minThickness * 0.5;

				// pivot offset
				const cx = (bb.min.x + bb.max.x) * 0.5 * sx;
				const cy = (bb.min.y + bb.max.y) * 0.5 * sy + 0.002; // small lift (2mm)
				const cz = (bb.min.z + bb.max.z) * 0.5 * sz;

				return { type: 'box', hx, hy, hz, offset: { x: cx, y: cy, z: cz } };
			}

			case 'sphere': {
				const sphere = resolveGeometry(o, { merge: true, type: 'sphere' });
				const r = sphere.radius * Math.max(sx, sy, sz) * bias;
				const offset = { x: sphere.center.x * sx, y: sphere.center.y * sy, z: sphere.center.z * sz };
				return { type: 'sphere', r, offset };
			}

			case 'capsule': {
				const bb = resolveGeometry(o, { merge: true, type: 'box' });
				const hxL = (bb.max.x - bb.min.x) * 0.5;
				const hyL = (bb.max.y - bb.min.y) * 0.5;
				const hzL = (bb.max.z - bb.min.z) * 0.5;

				let radius     = Math.max(hxL, hzL) * Math.max(sx, sz) * bias;
				let halfHeight = Math.max(0, hyL - Math.max(hxL, hzL)) * sy * bias;

				const cx = (bb.min.x + bb.max.x) * 0.5 * sx;
				const cy = (bb.min.y + bb.max.y) * 0.5 * sy;
				const cz = (bb.min.z + bb.max.z) * 0.5 * sz;

				return { type: 'capsule', halfHeight, radius, offset: { x: cx, y: cy, z: cz } };
			}

			case 'convex': {
				let geom = resolveGeometry(o, { merge: true, type: 'convex' });
				const scaleMatrix = new THREE.Matrix4().makeScale(sx * bias, sy * bias, sz * bias);
				geom.applyMatrix4(scaleMatrix);
				const verts = getPositionFloat32(geom);
				return { type: 'convex', vertices: verts, space: 'local' };
			}

			case 'trimesh':
			default: {
				let src = resolveGeometry(o, { merge: true, type: 'trimesh' });
				const scaleMatrix = new THREE.Matrix4().makeScale(sx * bias, sy * bias, sz * bias);
				src.applyMatrix4(scaleMatrix);
				const { vertices, indices } = getTriMeshBuffers(src);
				return { type: 'trimesh', vertices, indices, space: 'local' };
			}
		}
	}

	/* ------------------- geometry helpers ------------------- */

	function resolveGeometry(obj3d, options = {}) {
		const { merge = false, type } = options;

		if (!merge) {
			// Original behavior: pick first geometry (self or child)
			if (obj3d.geometry && obj3d.isMesh !== false) return obj3d.geometry;
			let geom = null;
			obj3d.traverse(n => { if (!geom && n.isMesh && n.geometry) geom = n.geometry; });
			if (!geom) throw new Error(`[RigidbodyManager] No geometry found for ${obj3d.name}`);
			return geom;
		}

		// Merge mode: collect all meshes (including self if applicable)
		const meshes = [];
		obj3d.traverse((node) => {
			if (node.isMesh && node.geometry) {
				meshes.push(node);
			}
		});

		if (meshes.length === 0) {
			throw new Error(`[RigidbodyManager] No geometries to merge for ${obj3d.name}`);
		}

		const parentInvMatrix = new THREE.Matrix4();
		obj3d.updateMatrixWorld(true);
		parentInvMatrix.copy(obj3d.matrixWorld).invert();

		if (type === 'box') {
			// For box (and capsule fallback): compute a combined bounding box in parent local space
			const combinedBox = new THREE.Box3();
			let first = true;

			for (let mesh of meshes) {
				mesh.updateMatrixWorld(true);
				const geom = mesh.geometry.clone();
				const relativeMatrix = new THREE.Matrix4().multiplyMatrices(parentInvMatrix, mesh.matrixWorld);
				geom.applyMatrix4(relativeMatrix);
				geom.computeBoundingBox();
				const bb = geom.boundingBox;
				if (first) {
					combinedBox.copy(bb);
					first = false;
				} else {
					combinedBox.union(bb);
				}
			}

			return combinedBox;
		}

		if (type === 'sphere') {
			// For sphere: merge geometries, then compute bounding sphere
			const geometries = [];
			for (let mesh of meshes) {
				mesh.updateMatrixWorld(true);
				const relativeMatrix = new THREE.Matrix4().multiplyMatrices(parentInvMatrix, mesh.matrixWorld);
				const geom = mesh.geometry.clone();
				geom.applyMatrix4(relativeMatrix);
				geometries.push(geom);
			}
			const mergedGeom = BufferGeometryUtils.mergeGeometries(geometries, false);
			mergedGeom.computeBoundingSphere();
			return mergedGeom.boundingSphere;
		}

		// For convex and trimesh: merge geometries
		const geometries = [];
		for (let mesh of meshes) {
			mesh.updateMatrixWorld(true);
			const relativeMatrix = new THREE.Matrix4().multiplyMatrices(parentInvMatrix, mesh.matrixWorld);
			const geom = mesh.geometry.clone();
			geom.applyMatrix4(relativeMatrix);
			geometries.push(geom);
		}

		let mergedGeom;
		if (type === 'convex') {
			// For convex: merge vertices only, no indices needed
			mergedGeom = BufferGeometryUtils.mergeGeometries(geometries, false);
		} else {
			// For trimesh: merge geometries with indices
			mergedGeom = BufferGeometryUtils.mergeGeometries(geometries, true);
		}

		return mergedGeom;
	}

	function getPositionFloat32(geom) {
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

	function getTriMeshBuffers(geom) {
		const vertices = getPositionFloat32(geom);
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

		if ((vertices.length % 3) !== 0)
			console.warn(`[RigidbodyManager] Vertices length not multiple of 3 for ${geom.name}`);

		const vcount = vertices.length / 3;
		for (let i = 0; i < indices.length; i++) {
			const ii = indices[i];
			if (ii < 0 || ii >= vcount)
				throw new Error(`trimesh index out of range: ${ii}/${vcount}`);
		}
		return { vertices, indices };
	}
	
	function getSpeed() {
		const rb = component._rb;
		if(!rb) return 0;
		const vel = rb.linvel(); // Rapier linear velocity {x, y, z}
		const speed = Math.hypot(vel.x, vel.y, vel.z); // Magnitude in m/s
		return speed;
	}
}