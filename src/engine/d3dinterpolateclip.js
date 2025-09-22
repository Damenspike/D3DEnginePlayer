/**
 * Interpolate a normalized time over a clip.
 * - t: 0..1
 * - values: EITHER a flat array (x,y,z)* or (x,y,z,w)*, OR an array of vector/quat-likes
 * - mode: 'vector' | 'quaternion' | 'auto' (auto infers stride for flat data; defaults to 'vector' if ambiguous)
 * - tween: easing function
 * - customInterp: optional (a,b,u) -> same shape as a/b
 *
 * Returns a plain object: {x,y,z} or {x,y,z,w}
 */
export function interpolateClip(t, values, mode = 'auto', tween = Tween.Linear, customInterp) {
	if (!values || values.length === 0) return null;
	if (values.length === 1) return toObject(values[0]);

	t = clamp01(t);

	const isFlat = typeof values[0] === 'number';

	if (isFlat) {
		const stride = resolveStrideFlat(values, mode);
		const keys = values.length / stride;
		if (keys <= 1) return toObject(values.slice(0, stride));

		const f = t * (keys - 1);
		let i = Math.floor(f);
		if (i >= keys - 1) i = keys - 2;

		const u = f - i;
		const uEased = clamp01(tween ? tween(u) : u);

		const a = readFlat(values, i, stride);
		const b = readFlat(values, i + 1, stride);

		if (typeof customInterp === 'function') {
			return toObject(customInterp(a, b, uEased));
		}

		if (stride === 4) return toObject(slerpQuat(a, b, uEased));
		return toObject(lerpVec3(a, b, uEased));
	}

	// Non-flat fallback (array of vector/quat-like values)
	const n = values.length;
	const f = t * (n - 1);
	let i = Math.floor(f);
	if (i >= n - 1) i = n - 2;

	const u = f - i;
	const uEased = clamp01(tween ? tween(u) : u);

	const a = toArrayLike(values[i]);
	const b = toArrayLike(values[i + 1]);

	if (typeof customInterp === 'function') {
		return toObject(customInterp(a, b, uEased));
	}

	const stride = (a.length === 4 || mode === 'quaternion') ? 4 : 3;
	return (stride === 4)
		? toObject(slerpQuat(a, b, uEased))
		: toObject(lerpVec3(a, b, uEased));
}

// ----------------------
// Internals
// ----------------------
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

function resolveStrideFlat(values, mode) {
	if (mode === 'vector') return 3;
	if (mode === 'quaternion') return 4;

	const len = values.length;
	const div3 = (len % 3) === 0;
	const div4 = (len % 4) === 0;

	if (div4 && !div3) return 4;
	if (div3 && !div4) return 3;

	// Ambiguous (divisible by both): default to vector unless caller specifies
	return 3;
}

function readFlat(values, keyIndex, stride) {
	const i = keyIndex * stride;
	return values.slice(i, i + stride);
}

function lerpVec3(a, b, u) {
	return [
		a[0] + (b[0] - a[0]) * u,
		a[1] + (b[1] - a[1]) * u,
		a[2] + (b[2] - a[2]) * u,
	];
}

function slerpQuat(a, b, u) {
	let ax = a[0], ay = a[1], az = a[2], aw = a[3];
	let bx = b[0], by = b[1], bz = b[2], bw = b[3];

	let dot = ax*bx + ay*by + az*bz + aw*bw;

	if (dot < 0) {
		dot = -dot;
		bx = -bx; by = -by; bz = -bz; bw = -bw;
	}

	if (1 - dot < 1e-5) {
		let ox = ax + (bx - ax) * u;
		let oy = ay + (by - ay) * u;
		let oz = az + (bz - az) * u;
		let ow = aw + (bw - aw) * u;
		const inv = 1 / Math.hypot(ox, oy, oz, ow);
		return [ox*inv, oy*inv, oz*inv, ow*inv];
	}

	const theta0 = Math.acos(dot);
	const theta = theta0 * u;
	const sinTheta = Math.sin(theta);
	const sinTheta0 = Math.sin(theta0);

	const s0 = Math.cos(theta) - dot * (sinTheta / sinTheta0);
	const s1 = sinTheta / sinTheta0;

	const ox = (s0 * ax) + (s1 * bx);
	const oy = (s0 * ay) + (s1 * by);
	const oz = (s0 * az) + (s1 * bz);
	const ow = (s0 * aw) + (s1 * bw);

	return [ox, oy, oz, ow];
}

function toArrayLike(v) {
	if (Array.isArray(v)) return v.slice();
	if (v && typeof v === 'object') {
		if ('w' in v) return [v.x, v.y, v.z, v.w];
		return [v.x, v.y, v.z];
	}
	throw new Error('Value must be vector or quaternion (array/object)');
}

function toObject(v) {
	if (v.length === 4) return { x: v[0], y: v[1], z: v[2], w: v[3] };
	return { x: v[0], y: v[1], z: v[2] };
}