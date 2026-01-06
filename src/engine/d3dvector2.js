// d3dvector2.js
import * as THREE from 'three';

export default class D3DVector2 extends THREE.Vector2 {
	constructor(x = 0, y = 0) {
		super(x, y);
	}

	identity() {
		this.x = 0;
		this.y = 0;
		return this;
	}

	one() {
		this.x = 1;
		this.y = 1;
		return this;
	}

	up() {
		this.x = 0;
		this.y = 1;
		return this;
	}

	down() {
		this.x = 0;
		this.y = -1;
		return this;
	}

	right() {
		this.x = 1;
		this.y = 0;
		return this;
	}

	left() {
		this.x = -1;
		this.y = 0;
		return this;
	}

	cloneD3D() {
		return new D3DVector2(this.x, this.y);
	}

	copyFrom(v) {
		this.x = Number(v?.x) || 0;
		this.y = Number(v?.y) || 0;
		return this;
	}

	setXY(x = 0, y = 0) {
		this.x = Number(x) || 0;
		this.y = Number(y) || 0;
		return this;
	}

	dot(v) {
		return this.x * v.x + this.y * v.y;
	}

	cross(v) {
		return this.x * v.y - this.y * v.x;
	}

	angleTo(v) {
		const la = Math.hypot(this.x, this.y);
		const lb = Math.hypot(v.x, v.y);
		if (la < 1e-12 || lb < 1e-12) return 0;

		const d = Math.min(1, Math.max(-1, this.dot(v) / (la * lb)));
		return Math.acos(d);
	}

	signedAngleTo(v) {
		const ang = this.angleTo(v);
		const s = Math.sign(this.cross(v));
		return ang * s;
	}

	distanceTo(v) {
		return Math.hypot(this.x - v.x, this.y - v.y);
	}

	lerpTo(v, t) {
		t = Math.max(0, Math.min(1, Number(t) || 0));
		this.x = this.x + (v.x - this.x) * t;
		this.y = this.y + (v.y - this.y) * t;
		return this;
	}

	movedTowards(v, maxDistanceDelta) {
		const dx = v.x - this.x;
		const dy = v.y - this.y;
		const dist = Math.hypot(dx, dy);

		if (dist <= maxDistanceDelta || dist < 1e-12)
			return new D3DVector2(v.x, v.y);

		const s = maxDistanceDelta / dist;
		return new D3DVector2(
			this.x + dx * s,
			this.y + dy * s
		);
	}

	moveTowards(v, maxDistanceDelta) {
		const dx = v.x - this.x;
		const dy = v.y - this.y;
		const dist = Math.hypot(dx, dy);

		if (dist <= maxDistanceDelta || dist < 1e-12) {
			this.x = v.x;
			this.y = v.y;
			return this;
		}

		const s = maxDistanceDelta / dist;
		this.x = this.x + dx * s;
		this.y = this.y + dy * s;
		return this;
	}

	reflect(normal) {
		const nx = normal.x;
		const ny = normal.y;

		const len = Math.hypot(nx, ny);
		if (len < 1e-12)
			return this;

		const inv = 1 / len;
		const nxx = nx * inv;
		const nyy = ny * inv;

		const d = this.x * nxx + this.y * nyy;

		this.x = this.x - 2 * d * nxx;
		this.y = this.y - 2 * d * nyy;
		return this;
	}

	magnitude() {
		return Math.hypot(this.x, this.y);
	}

	sqrMagnitude() {
		return this.x * this.x + this.y * this.y;
	}

	normalizeSafe() {
		const len = Math.hypot(this.x, this.y);
		if (len < 1e-12) {
			this.x = 0;
			this.y = 0;
			return this;
		}

		const inv = 1 / len;
		this.x *= inv;
		this.y *= inv;
		return this;
	}

	withX(x) {
		return new D3DVector2(Number(x) || 0, this.y);
	}

	withY(y) {
		return new D3DVector2(this.x, Number(y) || 0);
	}

	normalized() {
		const len = Math.hypot(this.x, this.y);
		if (len < 1e-12)
			return new D3DVector2(0, 0);

		const inv = 1 / len;
		return new D3DVector2(this.x * inv, this.y * inv);
	}

	angle() {
		return Math.atan2(this.y, this.x);
	}

	rotate(rad) {
		rad = Number(rad) || 0;
		const c = Math.cos(rad);
		const s = Math.sin(rad);

		const x = this.x * c - this.y * s;
		const y = this.x * s + this.y * c;

		this.x = x;
		this.y = y;
		return this;
	}

	rotated(rad) {
		rad = Number(rad) || 0;
		const c = Math.cos(rad);
		const s = Math.sin(rad);

		return new D3DVector2(
			this.x * c - this.y * s,
			this.x * s + this.y * c
		);
	}

	rotateAround(point, rad) {
		rad = Number(rad) || 0;

		const px = Number(point?.x) || 0;
		const py = Number(point?.y) || 0;

		const dx = this.x - px;
		const dy = this.y - py;

		const c = Math.cos(rad);
		const s = Math.sin(rad);

		this.x = px + dx * c - dy * s;
		this.y = py + dx * s + dy * c;
		return this;
	}

	perpendicular() {
		const x = -this.y;
		const y = this.x;
		this.x = x;
		this.y = y;
		return this;
	}

	perpendicularVector() {
		return new D3DVector2(-this.y, this.x);
	}

	projectOn(v) {
		const lenSq = v.x * v.x + v.y * v.y;
		if (lenSq < 1e-12) {
			this.x = 0;
			this.y = 0;
			return this;
		}

		const s = (this.x * v.x + this.y * v.y) / lenSq;
		this.x = v.x * s;
		this.y = v.y * s;
		return this;
	}

	projectOnNormal(n) {
		const s = (this.x * n.x + this.y * n.y);
		this.x = n.x * s;
		this.y = n.y * s;
		return this;
	}

	toObject(out) {
		out = out || {};
		out.x = this.x;
		out.y = this.y;
		return out;
	}
}