import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export default class RigidbodyManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.component._cache = null;
		this.component._rb = null;

		this.speed = 0;

		this.updateComponent = () => {
			if (!window._player) 
				return;
			if (!this.component.enabled) 
				return;
			
			if (!_physics || !_physics.ready) {
				requestAnimationFrame(this.updateComponent);
				return;
			}

			const next = this._readComponent();

			if (!this.component.bodySetup) {
				this._setupBody(next);
				this.component.bodySetup = true;
				this.component._cache = next;
				
				this.__onInternalBeforeRender = () => {
					this.speed = this.getSpeed();
				};
				return;
			}

			if (this._changed(this.component._cache, next)) {
				this._teardownBody();
				this._setupBody(next);
				this.component._cache = next;
			}
		};
	}

	get kind() {
		return this.component.properties?.kind;
	}
	set kind(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.kind = v;
	}

	get shape() {
		return this.component.properties?.shape;
	}
	set shape(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.shape = v;
	}

	get friction() {
		return this.component.properties?.friction;
	}
	set friction(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.friction = v;
	}

	get bounciness() {
		return this.component.properties?.bounciness;
	}
	set bounciness(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.bounciness = v;
	}

	get density() {
		return this.component.properties?.density;
	}
	set density(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.density = v;
	}

	get shapeBias() {
		return this.component.properties?.shapeBias;
	}
	set shapeBias(v) {
		if (!this.component.properties) this.component.properties = {};
		this.component.properties.shapeBias = v;
	}

	dispose() {
		this._teardownBody();
		this.component.bodySetup = false;
		this.component._cache = null;
	}
	
	setPosition({ x, y, z }) {
		const q = this.d3dobject.object3d.quaternion;
		_physics.setNextKinematicTransform(
			this.d3dobject,
			{ x, y, z },
			{ x: q.x, y: q.y, z: q.z, w: q.w }
		);
	}
	
	setRotation({ x, y, z, w }) {
		const p = this.d3dobject.object3d.position;
		_physics.setNextKinematicTransform(
			this.d3dobject,
			{ x: p.x, y: p.y, z: p.z },
			{ x, y, z, w }
		);
	}
	
	setTransform(pos, rot) {
		_physics.setNextKinematicTransform(this.d3dobject, pos, rot);
	}

	/* ------------------- helpers ------------------- */

	_readComponent() {
		const props = this.component.properties || {};

		const kind        = props.kind        ?? 'dynamic';
		let   shapeType   = props.shape       ?? 'trimesh';
		const friction    = Number(props.friction    ?? 0.5);
		const restitution = Number(props.bounciness  ?? 0.5);
		const density     = Number(props.density     ?? 1.0);
		const shapeBias   = Number(props.shapeBias   ?? 1.0);

		if (kind !== 'fixed' && shapeType === 'trimesh') {
			console.warn(`[RigidbodyManager] Dynamic body cannot use trimesh. Using convex instead.`);
			shapeType = 'convex';
		}

		const shape = this._buildScaledShape(this.d3dobject, shapeType, shapeBias);
		return { kind, shapeType, shape, friction, restitution, density };
	}

	_setupBody(opts) {
		const rb = _physics.addRigidBody(this.d3dobject, {
			kind: opts.kind,
			shape: opts.shape,
			friction: this._clamp01(opts.friction),
			restitution: this._clamp01(opts.restitution),
			density: Math.max(1e-6, opts.density)
		});
		this.component._rb = rb;
	}

	_teardownBody() {
		if (this.component._rb) {
			_physics.remove(this.d3dobject);
			this.component._rb = null;
		}
	}

	_changed(a, b) {
		if (!a) 
			return true;
		return (
			a.kind !== b.kind ||
			a.shapeType !== b.shapeType ||
			a.friction !== b.friction ||
			a.restitution !== b.restitution ||
			a.density !== b.density ||
			this._shapeChanged(a.shape, b.shape)
		);
	}

	_shapeChanged(a, b) {
		if (!a || !b) 
			return true;
		if (a.type !== b.type) 
			return true;
		switch (a.type) {
			case 'box':     return a.hx !== b.hx || a.hy !== b.hy || a.hz !== b.hz;
			case 'sphere':  return a.r !== b.r;
			case 'capsule': return a.halfHeight !== b.halfHeight || a.radius !== b.radius;
			case 'trimesh': return a.vertices !== b.vertices || a.indices !== b.indices;
			case 'convex':  return a.vertices !== b.vertices;
			default:        return true;
		}
	}

	_clamp01(v) {
		return v < 0 ? 0 : (v > 1 ? 1 : v);
	}

	/* ------------------- shape builder ------------------- */

	_buildScaledShape(obj, shapeType, bias) {
		const o = obj.object3d;
		const s = new THREE.Vector3(1, 1, 1);
		o.updateWorldMatrix(true, true);
		o.getWorldScale(s);
		const sx = Math.abs(s.x), sy = Math.abs(s.y), sz = Math.abs(s.z);

		switch (shapeType) {
			case 'box': {
				const bb = this._resolveGeometry(o, { merge: true, type: 'box' });
				let hx = (bb.max.x - bb.min.x) * 0.5 * sx * bias;
				let hy = (bb.max.y - bb.min.y) * 0.5 * sy * bias;
				let hz = (bb.max.z - bb.min.z) * 0.5 * sz * bias;

				const minThickness = 0.25;
				if (hy < minThickness * 0.5) hy = minThickness * 0.5;

				const cx = (bb.min.x + bb.max.x) * 0.5 * sx;
				const cy = (bb.min.y + bb.max.y) * 0.5 * sy + 0.002;
				const cz = (bb.min.z + bb.max.z) * 0.5 * sz;

				return { type: 'box', hx, hy, hz, offset: { x: cx, y: cy, z: cz } };
			}

			case 'sphere': {
				const sphere = this._resolveGeometry(o, { merge: true, type: 'sphere' });
				const r = sphere.radius * Math.max(sx, sy, sz) * bias;
				const offset = { x: sphere.center.x * sx, y: sphere.center.y * sy, z: sphere.center.z * sz };
				return { type: 'sphere', r, offset };
			}

			case 'capsule': {
				const bb = this._resolveGeometry(o, { merge: true, type: 'box' });
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
				let geom = this._resolveGeometry(o, { merge: true, type: 'convex' });
				const scaleMatrix = new THREE.Matrix4().makeScale(sx * bias, sy * bias, sz * bias);
				geom.applyMatrix4(scaleMatrix);
				const verts = this._getPositionFloat32(geom);
				return { type: 'convex', vertices: verts, space: 'local' };
			}

			case 'trimesh':
			default: {
				let src = this._resolveGeometry(o, { merge: true, type: 'trimesh' });
				const scaleMatrix = new THREE.Matrix4().makeScale(sx * bias, sy * bias, sz * bias);
				src.applyMatrix4(scaleMatrix);
				const { vertices, indices } = this._getTriMeshBuffers(src);
				return { type: 'trimesh', vertices, indices, space: 'local' };
			}
		}
	}

	/* ------------------- geometry helpers ------------------- */

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
			mergedGeom = BufferGeometryUtils.mergeGeometries(geometries, false);
		} else {
			mergedGeom = BufferGeometryUtils.mergeGeometries(geometries, true);
		}

		return mergedGeom;
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
	
	getSpeed() {
		const rb = this.component._rb;
		if (!rb) 
			return 0;
		const vel = rb.linvel();
		const speed = Math.hypot(vel.x, vel.y, vel.z);
		return speed;
	}
}