// d3dquaternion.js
import * as THREE from 'three';

const EPS = 1e-12;

function clamp(x, a, b) {
	return x < a ? a : (x > b ? b : x);
}

export default class D3DQuaternion extends THREE.Quaternion {
	constructor(x = 0, y = 0, z = 0, w = 1) {
		super(x, y, z, w);
	}

	identity() {
		this.x = 0;
		this.y = 0;
		this.z = 0;
		this.w = 1;
		return this;
	}

	cloneD3D() {
		return new D3DQuaternion(this.x, this.y, this.z, this.w);
	}

	copyFrom(q) {
		this.x = Number(q?.x) || 0;
		this.y = Number(q?.y) || 0;
		this.z = Number(q?.z) || 0;
		this.w = (q?.w === undefined ? 1 : (Number(q.w) || 0));
		return this;
	}

	setValues(x = 0, y = 0, z = 0, w = 1) {
		this.x = Number(x) || 0;
		this.y = Number(y) || 0;
		this.z = Number(z) || 0;
		this.w = Number(w) || 0;
		return this;
	}

	dot(q) {
		return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
	}

	angleTo(q) {
		const d = Math.abs(this.dot(q));
		const c = clamp(d, -1, 1);
		return 2 * Math.acos(c);
	}

	inverseTo(out) {
		out = out || new D3DQuaternion();
		const x = this.x, y = this.y, z = this.z, w = this.w;
		const n = x * x + y * y + z * z + w * w;

		if (n < EPS)
			return out.identity();

		const inv = 1 / n;
		out.x = -x * inv;
		out.y = -y * inv;
		out.z = -z * inv;
		out.w =  w * inv;
		return out;
	}

	multiplyTo(q, out) {
		out = out || new D3DQuaternion();

		const ax = this.x, ay = this.y, az = this.z, aw = this.w;
		const bx = q.x, by = q.y, bz = q.z, bw = q.w;

		out.x = aw * bx + ax * bw + ay * bz - az * by;
		out.y = aw * by - ax * bz + ay * bw + az * bx;
		out.z = aw * bz + ax * by - ay * bx + az * bw;
		out.w = aw * bw - ax * bx - ay * by - az * bz;

		return out;
	}

	premultiplyTo(q, out) {
		out = out || new D3DQuaternion();
		return new D3DQuaternion(q.x, q.y, q.z, q.w).multiplyTo(this, out);
	}

	normalizeSelf() {
		const l = Math.hypot(this.x, this.y, this.z, this.w) || 1;
		this.x /= l;
		this.y /= l;
		this.z /= l;
		this.w /= l;
		return this;
	}

	setAngleAxis(angleRad, axis) {
		const ax = Number(axis?.x) || 0;
		const ay = Number(axis?.y) || 0;
		const az = Number(axis?.z) || 0;

		let l = Math.hypot(ax, ay, az);
		if (l < EPS)
			return this.identity();

		l = 1 / l;

		const h = (Number(angleRad) || 0) * 0.5;
		const s = Math.sin(h);

		this.x = (ax * l) * s;
		this.y = (ay * l) * s;
		this.z = (az * l) * s;
		this.w = Math.cos(h);

		return this;
	}

	setEulerRad(x = 0, y = 0, z = 0, order = 'YXZ') {
		const e = new THREE.Euler(Number(x) || 0, Number(y) || 0, Number(z) || 0, order);
		this.setFromEuler(e);
		return this;
	}

	setEulerDeg(x = 0, y = 0, z = 0, order = 'YXZ') {
		const r = THREE.MathUtils.degToRad;
		return this.setEulerRad(r(Number(x) || 0), r(Number(y) || 0), r(Number(z) || 0), order);
	}

	setFromToRotation(fromDir, toDir) {
		const ax = Number(fromDir?.x) || 0;
		const ay = Number(fromDir?.y) || 0;
		const az = Number(fromDir?.z) || 0;

		const bx = Number(toDir?.x) || 0;
		const by = Number(toDir?.y) || 0;
		const bz = Number(toDir?.z) || 0;

		let al = Math.hypot(ax, ay, az);
		let bl = Math.hypot(bx, by, bz);

		if (al < EPS || bl < EPS)
			return this.identity();

		al = 1 / al;
		bl = 1 / bl;

		const a = new THREE.Vector3(ax * al, ay * al, az * al);
		const b = new THREE.Vector3(bx * bl, by * bl, bz * bl);

		this.setFromUnitVectors(a, b);
		return this;
	}

	setLookRotation(forward, up) {
		const fx = Number(forward?.x) || 0;
		const fy = Number(forward?.y) || 0;
		const fz = Number(forward?.z) || 0;
	
		let fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
		if (fl < 1e-12) {
			this.set(0, 0, 0, 1);
			return this;
		}
	
		const fwd = new THREE.Vector3(fx / fl, fy / fl, fz / fl);
	
		let ux = Number(up?.x);
		let uy = Number(up?.y);
		let uz = Number(up?.z);
	
		if (!Number.isFinite(ux) || !Number.isFinite(uy) || !Number.isFinite(uz)) {
			ux = 0; uy = 1; uz = 0;
		}
	
		let ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
		if (ul < 1e-12) {
			ux = 0; uy = 1; uz = 0;
			ul = 1;
		}
	
		const upv = new THREE.Vector3(ux / ul, uy / ul, uz / ul);
	
		const z = fwd.clone().multiplyScalar(-1);
	
		let x = upv.clone().cross(z);
		if (x.lengthSq() < 1e-12) {
			if (Math.abs(z.y) < 0.999) upv.set(0, 1, 0);
			else upv.set(1, 0, 0);
	
			x = upv.clone().cross(z);
		}
	
		x.normalize();
		const y = z.clone().cross(x);
	
		const m = new THREE.Matrix4();
		m.makeBasis(x, y, z);
	
		this.setFromRotationMatrix(m);
		return this;
	}

	setLookRotationYawOnly(forward, worldUp) {
		const fx = Number(forward?.x) || 0;
		const fz = Number(forward?.z) || 0;

		let l = Math.hypot(fx, fz);
		if (l < EPS)
			return this.identity();

		const x = fx / l;
		const z = fz / l;

		const yaw = Math.atan2(x, -z);

		const ux = (worldUp && worldUp.x !== undefined) ? (Number(worldUp.x) || 0) : 0;
		const uy = (worldUp && worldUp.y !== undefined) ? (Number(worldUp.y) || 0) : 1;
		const uz = (worldUp && worldUp.z !== undefined) ? (Number(worldUp.z) || 0) : 0;

		let ul = Math.hypot(ux, uy, uz);
		if (ul < EPS) ul = 1;

		return this.setAngleAxis(yaw, { x: ux / ul, y: uy / ul, z: uz / ul });
	}

	slerpTo(q, t, out) {
		out = out || new D3DQuaternion();
		out.copyFrom(this);
		out.slerp(q, clamp(Number(t) || 0, 0, 1));
		return out;
	}

	lerpTo(q, t, out) {
		out = out || new D3DQuaternion();

		const tt = clamp(Number(t) || 0, 0, 1);

		out.x = this.x + (q.x - this.x) * tt;
		out.y = this.y + (q.y - this.y) * tt;
		out.z = this.z + (q.z - this.z) * tt;
		out.w = this.w + (q.w - this.w) * tt;

		return out.normalizeSelf();
	}

	rotateTowards(q, maxRadiansDelta, out) {
		out = out || new D3DQuaternion();

		const ang = this.angleTo(q);
		if (ang <= EPS) {
			out.copyFrom(q);
			return out;
		}

		const t = Math.min(1, (Number(maxRadiansDelta) || 0) / ang);
		return this.slerpTo(q, t, out);
	}

	toEulerRad(order = 'YXZ') {
		const e = new THREE.Euler().setFromQuaternion(this, order);
		return { x: e.x, y: e.y, z: e.z, order };
	}

	toEulerDeg(order = 'YXZ') {
		const e = this.toEulerRad(order);
		const d = THREE.MathUtils.radToDeg;
		return { x: d(e.x), y: d(e.y), z: d(e.z), order: e.order };
	}

	toForward(out) {
		out = out || new THREE.Vector3();
		return out.set(0, 0, -1).applyQuaternion(this);
	}

	toRight(out) {
		out = out || new THREE.Vector3();
		return out.set(1, 0, 0).applyQuaternion(this);
	}

	toUp(out) {
		out = out || new THREE.Vector3();
		return out.set(0, 1, 0).applyQuaternion(this);
	}
}