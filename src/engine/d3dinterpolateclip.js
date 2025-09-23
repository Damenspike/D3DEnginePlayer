/**
 * Interpolate a clip at absolute time (seconds).
 *
 * @param {number} timeSec         Absolute time in seconds (NOT normalized)
 * @param {number[]|null} times    Key times in seconds (ascending). If null/omitted, falls back to evenly-spaced behavior.
 * @param {number[]|Array} values  Flat array (xyz/xyzw)* or array of vec/quat-likes (length = keyCount)
 * @param {'auto'|'vector'|'quaternion'} mode
 * @param {function} tween         Optional easing: u∈[0,1]→[0,1]. If omitted, linear used.
 * @param {function} customInterp  Optional (a,b,u) => interpolated array (same shape as a/b)
 * @returns {{x:number,y:number,z:number,w?:number}|null}
 */
export function interpolateClip(timeSec, times, values, mode = 'auto', tween = (u) => u, customInterp) {
	if (!values || values.length === 0) return null;

	const isFlat = (typeof values[0] === 'number');

	// Helper: resolve stride for flat arrays
	const resolveStrideFlat = (vals, m) => {
		if (m === 'vector') return 3;
		if (m === 'quaternion') return 4;
		const len = vals.length;
		const div3 = (len % 3) === 0;
		const div4 = (len % 4) === 0;
		if (div4 && !div3) return 4;
		if (div3 && !div4) return 3;
		return 3;
	};

	// Helper: read a key value as array [x,y,z] or [x,y,z,w]
	const readValue = (vals, idx, m, flatStride) => {
		if (typeof vals[0] === 'number') {
			const stride = flatStride ?? resolveStrideFlat(vals, m);
			const off = idx * stride;
			return vals.slice(off, off + stride);
		}
		// array/object form
		const v = vals[idx];
		if (Array.isArray(v)) return v.slice();
		if (v && typeof v === 'object') {
			const w = ('w' in v) ? [v.x ?? 0, v.y ?? 0, v.z ?? 0, v.w ?? 0] : [v.x ?? 0, v.y ?? 0, v.z ?? 0];
			return w;
		}
		throw new Error('Bad value in values array');
	};

	const clamp01 = x => x < 0 ? 0 : (x > 1 ? 1 : x);

	const lerpVec3 = (a, b, u) => [
		a[0] + (b[0] - a[0]) * u,
		a[1] + (b[1] - a[1]) * u,
		a[2] + (b[2] - a[2]) * u
	];

	const slerpQuat = (a, b, u) => {
		let ax = a[0], ay = a[1], az = a[2], aw = a[3] ?? 1;
		let bx = b[0], by = b[1], bz = b[2], bw = b[3] ?? 1;
		let dot = ax*bx + ay*by + az*bz + aw*bw;
		if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
		if (1 - dot < 1e-5) {
			let ox = ax + (bx - ax) * u;
			let oy = ay + (by - ay) * u;
			let oz = az + (bz - az) * u;
			let ow = aw + (bw - aw) * u;
			const inv = 1 / Math.hypot(ox, oy, oz, ow);
			return [ox*inv, oy*inv, oz*inv, ow*inv];
		}
		const theta0 = Math.acos(dot);
		const sin0 = Math.sin(theta0);
		const s0 = Math.sin((1 - u) * theta0) / sin0;
		const s1 = Math.sin(u * theta0) / sin0;
		const x = s0*ax + s1*bx;
		const y = s0*ay + s1*by;
		const z = s0*az + s1*bz;
		const w = s0*aw + s1*bw;
		// normalize
		const invL = 1 / Math.hypot(x,y,z,w);
		return [x*invL, y*invL, z*invL, w*invL];
	};

	const toObject = arr => {
		if (!arr) return null;
		if (arr.length === 4) return { x: arr[0], y: arr[1], z: arr[2], w: arr[3] };
		return { x: arr[0], y: arr[1], z: arr[2] };
	};

	// If times is not provided, fall back to evenly-spaced behavior over 0..1 scaled by key count
	if (!Array.isArray(times) || times.length === 0) {
		// legacy evenly spaced path — interpret timeSec in range [0..1] mapped across keys
		const tNorm = clamp01(timeSec); // here caller must pass normalized if they were using old behavior
		if (isFlat) {
			const stride = resolveStrideFlat(values, mode);
			const keys = values.length / stride;
			if (keys <= 1) return toObject(readValue(values, 0, mode, stride));
			let f = tNorm * (keys - 1);
			let i = Math.floor(f);
			if (i >= keys - 1) i = keys - 2;
			const u = f - i;
			const uEased = clamp01(typeof tween === 'function' ? tween(u) : u);
			const a = readValue(values, i, mode, stride);
			const b = readValue(values, i + 1, mode, stride);
			if (typeof customInterp === 'function') return toObject(customInterp(a, b, uEased));
			if (stride === 4) return toObject(slerpQuat(a, b, uEased));
			return toObject(lerpVec3(a, b, uEased));
		}
		const n = values.length;
		let f = tNorm * (n - 1);
		let i = Math.floor(f);
		if (i >= n - 1) i = n - 2;
		const u = f - i;
		const uEased = clamp01(typeof tween === 'function' ? tween(u) : u);
		const a = readValue(values, i, mode);
		const b = readValue(values, i + 1, mode);
		if (typeof customInterp === 'function') return toObject(customInterp(a, b, uEased));
		const stride = (a.length === 4 || mode === 'quaternion') ? 4 : 3;
		return (stride === 4) ? toObject(slerpQuat(a, b, uEased)) : toObject(lerpVec3(a, b, uEased));
	}

	// Absolute-time path: times[] provided (seconds)
	const keyCount = isFlat ? (values.length / resolveStrideFlat(values, mode)) | 0 : values.length;
	if (keyCount <= 0) return null;

	// boundary clamps
	if (timeSec <= times[0]) return toObject(readValue(values, 0, mode));
	if (timeSec >= times[times.length - 1]) return toObject(readValue(values, keyCount - 1, mode));

	// binary search upper bound: first j where times[j] > timeSec
	let lo = 0, hi = times.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		if (times[mid] > timeSec) hi = mid - 1;
		else lo = mid + 1;
	}
	const j = lo, i = j - 1;

	const ti = times[i], tj = times[j];
	const dt = (tj - ti) || 1e-8;
	let u = (timeSec - ti) / dt;
	u = clamp01(typeof tween === 'function' ? tween(u) : u);

	const a = readValue(values, i, mode);
	const b = readValue(values, j, mode);

	if (typeof customInterp === 'function') return toObject(customInterp(a, b, u));

	const stride = (a.length === 4 || mode === 'quaternion') ? 4 : 3;
	return (stride === 4) ? toObject(slerpQuat(a, b, u)) : toObject(lerpVec3(a, b, u));
}