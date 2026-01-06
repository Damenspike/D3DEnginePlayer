// d3deuler.js
import * as THREE from 'three';
import D3DQuaternion from './d3dquaternion.js';

export default class D3DEuler extends THREE.Euler {
	constructor(x = 0, y = 0, z = 0, order = 'YXZ') {
		super(x, y, z, order);
	}

	identity() {
		this.x = 0;
		this.y = 0;
		this.z = 0;
		return this;
	}

	cloneD3D() {
		return new D3DEuler(this.x, this.y, this.z, this.order);
	}

	copyFrom(e) {
		this.x = Number(e?.x) || 0;
		this.y = Number(e?.y) || 0;
		this.z = Number(e?.z) || 0;
		this.order = e?.order || this.order;
		return this;
	}

	setRadians(x = 0, y = 0, z = 0, order = this.order) {
		this.set(
			Number(x) || 0,
			Number(y) || 0,
			Number(z) || 0,
			order
		);
		return this;
	}

	setDegrees(x = 0, y = 0, z = 0, order = this.order) {
		const r = THREE.MathUtils.degToRad;
		return this.setRadians(
			r(Number(x) || 0),
			r(Number(y) || 0),
			r(Number(z) || 0),
			order
		);
	}

	setFromDegrees(v, order = this.order) {
		return this.setDegrees(v?.x, v?.y, v?.z, order);
	}

	setFromQuaternion(q, order = this.order) {
		super.setFromQuaternion(q, order);
		return this;
	}

	toRadians(out) {
		out = out || {};
		out.x = this.x;
		out.y = this.y;
		out.z = this.z;
		out.order = this.order;
		return out;
	}

	toDegrees(out) {
		const d = THREE.MathUtils.radToDeg;
		out = out || {};
		out.x = d(this.x);
		out.y = d(this.y);
		out.z = d(this.z);
		out.order = this.order;
		return out;
	}

	addRadians(x = 0, y = 0, z = 0) {
		this.x += Number(x) || 0;
		this.y += Number(y) || 0;
		this.z += Number(z) || 0;
		return this;
	}

	addDegrees(x = 0, y = 0, z = 0) {
		const r = THREE.MathUtils.degToRad;
		this.x += r(Number(x) || 0);
		this.y += r(Number(y) || 0);
		this.z += r(Number(z) || 0);
		return this;
	}

	equals(e, eps = 1e-6) {
		return (
			Math.abs(this.x - e.x) <= eps &&
			Math.abs(this.y - e.y) <= eps &&
			Math.abs(this.z - e.z) <= eps &&
			this.order === e.order
		);
	}

	deltaTo(e, out) {
		out = out || {};
		out.x = (e.x - this.x);
		out.y = (e.y - this.y);
		out.z = (e.z - this.z);
		out.order = this.order;
		return out;
	}

	deltaToDegrees(e, out) {
		const d = THREE.MathUtils.radToDeg;
		out = out || {};
		out.x = d(e.x - this.x);
		out.y = d(e.y - this.y);
		out.z = d(e.z - this.z);
		out.order = this.order;
		return out;
	}

	toQuaternion(out) {
		out = out || new D3DQuaternion();
		out.setFromEuler(this);
		return out;
	}

	normalizeAngles() {
		const wrap = a => {
			a = a % (Math.PI * 2);
			return a > Math.PI ? a - Math.PI * 2 : (a < -Math.PI ? a + Math.PI * 2 : a);
		};

		this.x = wrap(this.x);
		this.y = wrap(this.y);
		this.z = wrap(this.z);
		return this;
	}
}