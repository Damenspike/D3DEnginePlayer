// d3dvector3.js
import * as THREE from 'three';
import D3DQuaternion from './d3dquaternion.js';

export default class D3DVector3 extends THREE.Vector3 {
	constructor(x = 0, y = 0, z = 0) {
		super(x, y, z);
	}

	// =====================================================
	// BASIC SETTERS
	// =====================================================

	zero() {
		this.set(0, 0, 0);
		return this;
	}

	one() {
		this.set(1, 1, 1);
		return this;
	}

	up() {
		this.set(0, 1, 0);
		return this;
	}

	down() {
		this.set(0, -1, 0);
		return this;
	}

	right() {
		this.set(1, 0, 0);
		return this;
	}

	left() {
		this.set(-1, 0, 0);
		return this;
	}

	forward() {
		this.set(0, 0, -1);
		return this;
	}

	back() {
		this.set(0, 0, 1);
		return this;
	}

	copyFrom(v) {
		this.x = Number(v?.x) || 0;
		this.y = Number(v?.y) || 0;
		this.z = Number(v?.z) || 0;
		return this;
	}

	setXYZ(x = 0, y = 0, z = 0) {
		this.x = Number(x) || 0;
		this.y = Number(y) || 0;
		this.z = Number(z) || 0;
		return this;
	}

	cloneD3D() {
		return new D3DVector3(this.x, this.y, this.z);
	}

	withX(x) {
		return new D3DVector3(x, this.y, this.z);
	}

	withY(y) {
		return new D3DVector3(this.x, y, this.z);
	}

	withZ(z) {
		return new D3DVector3(this.x, this.y, z);
	}

	// =====================================================
	// MAGNITUDE / NORMALIZATION
	// =====================================================

	magnitude() {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}

	sqrMagnitude() {
		return this.x * this.x + this.y * this.y + this.z * this.z;
	}

	normalizeSafe() {
		const len = this.magnitude();
		if (len < 1e-12) {
			this.set(0, 0, 0);
			return this;
		}
		const inv = 1 / len;
		this.x *= inv;
		this.y *= inv;
		this.z *= inv;
		return this;
	}

	normalized() {
		const len = this.magnitude();
		if (len < 1e-12)
			return new D3DVector3(0, 0, 0);

		const inv = 1 / len;
		return new D3DVector3(
			this.x * inv,
			this.y * inv,
			this.z * inv
		);
	}

	// =====================================================
	// DOT / CROSS / ANGLES
	// =====================================================

	dot(v) {
		return this.x * v.x + this.y * v.y + this.z * v.z;
	}

	crossTo(v) {
		return new D3DVector3(
			this.y * v.z - this.z * v.y,
			this.z * v.x - this.x * v.z,
			this.x * v.y - this.y * v.x
		);
	}

	angleTo(v) {
		const la = this.magnitude();
		const lb = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
		if (la < 1e-12 || lb < 1e-12) return 0;

		const d = Math.min(1, Math.max(-1, this.dot(v) / (la * lb)));
		return THREE.MathUtils.radToDeg(Math.acos(d));
	}

	distanceTo(v) {
		const dx = this.x - v.x;
		const dy = this.y - v.y;
		const dz = this.z - v.z;
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	// =====================================================
	// INTERPOLATION / MOVEMENT
	// =====================================================

	lerpTo(v, t) {
		t = Math.max(0, Math.min(1, Number(t) || 0));
		this.x += (v.x - this.x) * t;
		this.y += (v.y - this.y) * t;
		this.z += (v.z - this.z) * t;
		return this;
	}

	moveTowards(v, maxDistanceDelta) {
		const dx = v.x - this.x;
		const dy = v.y - this.y;
		const dz = v.z - this.z;

		const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
		if (dist <= maxDistanceDelta || dist < 1e-12) {
			this.copyFrom(v);
			return this;
		}

		const s = maxDistanceDelta / dist;
		this.x += dx * s;
		this.y += dy * s;
		this.z += dz * s;
		return this;
	}

	movedTowards(v, maxDistanceDelta) {
		return this.cloneD3D().moveTowards(v, maxDistanceDelta);
	}

	// =====================================================
	// PROJECTION / REFLECTION
	// =====================================================

	projectOn(v) {
		const lenSq = v.x * v.x + v.y * v.y + v.z * v.z;
		if (lenSq < 1e-12) {
			this.set(0, 0, 0);
			return this;
		}

		const s = this.dot(v) / lenSq;
		this.x = v.x * s;
		this.y = v.y * s;
		this.z = v.z * s;
		return this;
	}

	projectOnPlane(n) {
		const lenSq = n.x * n.x + n.y * n.y + n.z * n.z;
		if (lenSq < 1e-12)
			return this;

		const s = this.dot(n) / lenSq;
		this.x -= n.x * s;
		this.y -= n.y * s;
		this.z -= n.z * s;
		return this;
	}

	reflect(normal) {
		const nx = normal.x;
		const ny = normal.y;
		const nz = normal.z;

		const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
		if (len < 1e-12)
			return this;

		const inv = 1 / len;
		const nxx = nx * inv;
		const nyy = ny * inv;
		const nzz = nz * inv;

		const d = this.x * nxx + this.y * nyy + this.z * nzz;

		this.x -= 2 * d * nxx;
		this.y -= 2 * d * nyy;
		this.z -= 2 * d * nzz;
		return this;
	}

	// =====================================================
	// ROTATION / QUATERNION HELPERS
	// =====================================================

	lookRotation(up) {
		return new D3DQuaternion().setLookRotation(this, up);
	}

	yawOnlyLookRotation() {
		const f = this.cloneD3D();
		f.y = 0;
		if (f.sqrMagnitude() < 1e-12)
			return new D3DQuaternion();

		f.normalizeSafe();
		return new D3DQuaternion().setLookRotation(f);
	}

	// =====================================================
	// UTILS
	// =====================================================

	toObject(out) {
		out = out || {};
		out.x = this.x;
		out.y = this.y;
		out.z = this.z;
		return out;
	}
}