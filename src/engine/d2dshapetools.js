// d2dshapetools.js
//
// Dedicated shape-altering helpers for Graphic2D paths.
//
// Exports:
//   simplifyShape(d3dobjects, { tolerance, addStep })
//   straightenShape(d3dobjects, { strength, addStep })
//   smoothShape(d3dobjects, { strength, iterations, addStep })
//
// Notes:
//   - d3dobjects can be a single object or an array.
//   - All functions operate on graphic2d._paths.
//   - History step is only added if options.addStep is truthy.
//   - Simplify: reduces point count, drops cx/cy (pure poly).
//   - Straighten: only adjusts/removes cx/cy (anchors unchanged).
//   - Smooth: smooths anchors while preserving curve handles.

import * as U from './d2dutility.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function simplifyShape(d3dobjects, options = {}) {
	const objs = _normalizeObjects(d3dobjects);
	if (!objs.length) return;

	const tolerance = Number(options.tolerance ?? 1.0); // local units
	if (!(tolerance > 0)) return;

	const before = [];
	const after  = [];

	for (const obj of objs) {
		const paths = _getPaths(obj);
		if (!paths || !paths.length) continue;

		const beforePaths = U.clonePaths(paths);
		const newPaths    = U.clonePaths(paths);

		for (const path of newPaths) {
			_simplifyPathInPlace(path, tolerance);
		}

		before.push({ obj, paths: beforePaths });
		after.push({ obj, paths: newPaths });

		_setPaths(obj, newPaths);
	}

	if (!before.length) return;

	if (options.addStep) {
		_editor.addStep({
			name: 'Simplify Shape',
			undo: () => {
				for (const s of before) _setPaths(s.obj, U.clonePaths(s.paths));
			},
			redo: () => {
				for (const s of after) _setPaths(s.obj, U.clonePaths(s.paths));
			}
		});
	}
}

export function straightenShape(d3dobjects, options = {}) {
	const objs = _normalizeObjects(d3dobjects);
	if (!objs.length) return;

	let strength = Number(options.strength ?? 1.0); // 0..1
	if (!Number.isFinite(strength)) strength = 1.0;
	if (strength < 0) strength = 0;
	if (strength > 1) strength = 1;
	if (strength === 0) return;

	const before = [];
	const after  = [];

	for (const obj of objs) {
		const paths = _getPaths(obj);
		if (!paths || !paths.length) continue;

		const beforePaths = U.clonePaths(paths);
		const newPaths    = U.clonePaths(paths);

		for (const path of newPaths) {
			_straightenPathInPlace(path, strength);
		}

		before.push({ obj, paths: beforePaths });
		after.push({ obj, paths: newPaths });

		_setPaths(obj, newPaths);
	}

	if (!before.length) return;

	if (options.addStep) {
		_editor.addStep({
			name: 'Straighten Shape',
			undo: () => {
				for (const s of before) _setPaths(s.obj, U.clonePaths(s.paths));
			},
			redo: () => {
				for (const s of after) _setPaths(s.obj, U.clonePaths(s.paths));
			}
		});
	}
}

export function smoothShape(d3dobjects, options = {}) {
	const objs = _normalizeObjects(d3dobjects);
	if (!objs.length) return;

	let strength   = Number(options.strength ?? 0.5); // 0..1
	let iterations = Number(options.iterations ?? 1);

	if (!Number.isFinite(strength) || strength <= 0) return;
	if (!Number.isFinite(iterations) || iterations < 1) iterations = 1;

	const before = [];
	const after  = [];

	for (const obj of objs) {
		const paths = _getPaths(obj);
		if (!paths || !paths.length) continue;

		const beforePaths = U.clonePaths(paths);
		const newPaths    = U.clonePaths(paths);

		for (const path of newPaths) {
			_smoothPathInPlace(path, strength, iterations);
		}

		before.push({ obj, paths: beforePaths });
		after.push({ obj, paths: newPaths });

		_setPaths(obj, newPaths);
	}

	if (!before.length) return;

	if (options.addStep) {
		_editor.addStep({
			name: 'Smooth Shape',
			undo: () => {
				for (const s of before) _setPaths(s.obj, U.clonePaths(s.paths));
			},
			redo: () => {
				for (const s of after) _setPaths(s.obj, U.clonePaths(s.paths));
			}
		});
	}
}

export default {
	simplifyShape,
	straightenShape,
	smoothShape
};

// ---------------------------------------------------------------------------
// Internal helpers: object + path access
// ---------------------------------------------------------------------------

function _normalizeObjects(d3dobjects) {
	if (!d3dobjects) return [];
	if (Array.isArray(d3dobjects)) return d3dobjects.filter(Boolean);
	return [d3dobjects];
}

function _getPaths(d3dobject) {
	const g2d = d3dobject?.graphic2d;
	if (!g2d) return null;

	let paths = Array.isArray(g2d._paths) ? g2d._paths : null;

	// Legacy _points → _paths merge
	if (Array.isArray(g2d._points) && g2d._points.length) {
		paths = paths ? [...paths, [...g2d._points]] : [[...g2d._points]];
		delete g2d._points;
	}

	if (!paths || !paths.length) return null;
	return paths;
}

function _setPaths(d3dobject, newPaths) {
	if (!d3dobject) return;

	if (!d3dobject.graphic2d) d3dobject.graphic2d = {};
	d3dobject.graphic2d._paths = newPaths;

	d3dobject.invalidateGraphic2D?.();
	d3dobject.checkSymbols?.();
	_editor?.requestRender?.();
}

// ---------------------------------------------------------------------------
// Simplify (RDP on logical anchors; drops cx/cy)
// ---------------------------------------------------------------------------

function _simplifyPathInPlace(path, tolerance) {
	if (!Array.isArray(path) || path.length < 3) return;

	const logical = U.logicalPoints(path);
	if (!logical || logical.length < 3) return;

	const closed = U.isClosedPoints(path);
	const simplified = _rdpSimplify(logical, tolerance, closed);
	if (!simplified || simplified.length < 2) return;

	path.length = 0;
	for (const pt of simplified) {
		path.push({ x: pt.x, y: pt.y });
	}

	if (closed && path.length >= 2) {
		const a = path[0];
		const b = path[path.length - 1];
		if (!U.approx(a.x, b.x) || !U.approx(a.y, b.y)) {
			path.push({ x: a.x, y: a.y });
		}
	}
}

function _rdpSimplify(points, tolerance, closed) {
	if (!points || points.length <= 2) return points.slice();

	const eps = tolerance * tolerance;

	const sqSegDist = (p, a, b) => {
		let x = a.x;
		let y = a.y;

		let dx = b.x - x;
		let dy = b.y - y;

		if (dx !== 0 || dy !== 0) {
			const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
			if (t > 1) {
				x = b.x;
				y = b.y;
			} else if (t > 0) {
				x += dx * t;
				y += dy * t;
			}
		}

		dx = p.x - x;
		dy = p.y - y;

		return dx * dx + dy * dy;
	};

	const simplifySection = (pts, first, last, out) => {
		let maxSq = 0;
		let idx   = -1;

		const a = pts[first];
		const b = pts[last];

		for (let i = first + 1; i < last; i++) {
			const sq = sqSegDist(pts[i], a, b);
			if (sq > maxSq) {
				maxSq = sq;
				idx   = i;
			}
		}

		if (maxSq > eps && idx !== -1) {
			if (idx - first > 1)
				simplifySection(pts, first, idx, out);
			out.push(pts[idx]);
			if (last - idx > 1)
				simplifySection(pts, idx, last, out);
		}
	};

	if (closed) {
		const core = points.slice(0, points.length - 1);
		if (core.length <= 2) return points.slice();

		const out = [core[0]];
		simplifySection(core, 0, core.length - 1, out);
		out.push(core[core.length - 1]);
		out.push({ x: out[0].x, y: out[0].y });
		return out;
	}

	const out = [points[0]];
	simplifySection(points, 0, points.length - 1, out);
	out.push(points[points.length - 1]);
	return out;
}

// ---------------------------------------------------------------------------
// Straighten (lerp cx/cy towards mid-point; or delete at strength≈1)
// ---------------------------------------------------------------------------

function _straightenPathInPlace(path, strength) {
	if (!Array.isArray(path) || path.length < 2) return;

	const logical = U.logicalPoints(path);
	if (!logical || logical.length < 2) return;

	const closed = U.isClosedPoints(path);
	const logicalCount = logical.length;

	for (let li = 0; li < logicalCount; li++) {
		const curr = logical[li];

		let prev = null;
		if (closed) {
			prev = logical[(li - 1 + logicalCount) % logicalCount];
		} else {
			if (li === 0) continue;
			prev = logical[li - 1];
		}
		if (!prev) continue;

		// We pull the control towards the straight chord mid-point.
		const targetCx = (prev.x + curr.x) * 0.5;
		const targetCy = (prev.y + curr.y) * 0.5;

		const rawIndices = U.logicalIndexMap(path, li);

		for (const rawIndex of rawIndices) {
			const pt = path[rawIndex];
			if (!pt) continue;

			const origCx = Number.isFinite(pt.cx) ? pt.cx : curr.x;
			const origCy = Number.isFinite(pt.cy) ? pt.cy : curr.y;

			if (strength >= 0.999) {
				// Fully straight: drop the handle.
				delete pt.cx;
				delete pt.cy;
			} else {
				pt.cx = origCx + (targetCx - origCx) * strength;
				pt.cy = origCy + (targetCy - origCy) * strength;
			}
		}
	}

	if (closed && path.length >= 2) {
		const a = path[0];
		const b = path[path.length - 1];
		if (!U.approx(a.x, b.x) || !U.approx(a.y, b.y)) {
			path[path.length - 1] = { x: a.x, y: a.y };
		}
	}
}

// ---------------------------------------------------------------------------
// Smooth (anchor smoothing; preserves curve handles)
// ---------------------------------------------------------------------------

function _smoothPathInPlace(path, strength, iterations) {
	if (!Array.isArray(path) || path.length < 3) return;

	const logical = U.logicalPoints(path);
	if (!logical || logical.length < 3) return;

	const closed = U.isClosedPoints(path);
	const logicalCount = logical.length;

	// Build one entry per logical anchor:
	//   x,y       : anchor position
	//   hx,hy     : handle offset (cx - x, cy - y) if any
	//   hasHandle : whether this logical has a handle
	//   rawIdxs   : indices in path[] that correspond to this logical vertex
	const work = [];

	for (let li = 0; li < logicalCount; li++) {
		const anchor  = logical[li];
		const rawIdxs = U.logicalIndexMap(path, li);

		let cx = null, cy = null;
		for (const ri of rawIdxs) {
			const p = path[ri];
			if (p && Number.isFinite(p.cx) && Number.isFinite(p.cy)) {
				cx = p.cx;
				cy = p.cy;
				break;
			}
		}

		let hx = 0, hy = 0;
		let hasHandle = false;

		if (cx != null && cy != null) {
			hx = cx - anchor.x;
			hy = cy - anchor.y;
			hasHandle = true;
		}

		work.push({
			x: anchor.x,
			y: anchor.y,
			hx,
			hy,
			hasHandle,
			rawIdxs
		});
	}

	iterations |= 0;
	if (iterations < 1) iterations = 1;

	for (let iter = 0; iter < iterations; iter++) {
		const n = work.length;
		if (n < 3) break;

		const smoothed = new Array(n);

		if (closed) {
			for (let i = 0; i < n; i++) {
				const prev = work[(i - 1 + n) % n];
				const curr = work[i];
				const next = work[(i + 1) % n];

				smoothed[i] = {
					x: (prev.x + curr.x * 2 + next.x) * 0.25,
					y: (prev.y + curr.y * 2 + next.y) * 0.25
				};
			}
		} else {
			// Endpoints fixed (Flash-like smoothing)
			smoothed[0]     = { x: work[0].x,     y: work[0].y     };
			smoothed[n - 1] = { x: work[n - 1].x, y: work[n - 1].y };

			for (let i = 1; i < n - 1; i++) {
				const prev = work[i - 1];
				const curr = work[i];
				const next = work[i + 1];

				smoothed[i] = {
					x: (prev.x + curr.x * 2 + next.x) * 0.25,
					y: (prev.y + curr.y * 2 + next.y) * 0.25
				};
			}
		}

		// Apply blend with `strength` to anchors only.
		for (let i = 0; i < n; i++) {
			const w = work[i];
			const s = smoothed[i];

			w.x = w.x + (s.x - w.x) * strength;
			w.y = w.y + (s.y - w.y) * strength;
			// NOTE: hx,hy (handle offset) is unchanged here,
			// so curvature is preserved while the polyline is smoothed.
		}
	}

	// Write back to raw path: anchors + handles
	for (const w of work) {
		for (const ri of w.rawIdxs) {
			const p = path[ri];
			if (!p) continue;

			p.x = w.x;
			p.y = w.y;

			if (w.hasHandle) {
				p.cx = w.x + w.hx;
				p.cy = w.y + w.hy;
			} else {
				// No logical handle → ensure any stray cx/cy is removed
				delete p.cx;
				delete p.cy;
			}
		}
	}

	// Keep closed paths properly closed
	if (closed && path.length >= 2) {
		const a = path[0];
		const b = path[path.length - 1];
		if (!U.approx(a.x, b.x) || !U.approx(a.y, b.y)) {
			path[path.length - 1] = { x: a.x, y: a.y };
		}
	}
}