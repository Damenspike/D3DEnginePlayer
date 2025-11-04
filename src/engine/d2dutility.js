// d2dutility.js
// Lightweight math + picking + selection utilities for 2D editors.
// All functions are pure and parameterized (no globals).

/* ========================= MATRICES ========================= */

export function mul(A, B) {
	return {
		a: A.a * B.a + A.c * B.b,
		b: A.b * B.a + A.d * B.b,
		c: A.a * B.c + A.c * B.d,
		d: A.b * B.c + A.d * B.d,
		e: A.a * B.e + A.c * B.f + A.e,
		f: A.b * B.e + A.d * B.f + A.f
	};
}

export function applyMat(M, x, y) {
	return { x: M.a * x + M.c * y + M.e, y: M.b * x + M.d * y + M.f };
}

export function worldMatrix(node) {
	if (!node) return { a:1, b:0, c:0, d:1, e:0, f:0 };
	let M = { a:1, b:0, c:0, d:1, e:0, f:0 };
	const chain = [];
	let n = node;
	while (n) { chain.push(n); n = n.parent; }
	for (let i = chain.length - 1; i >= 0; --i) {
		const o  = chain[i];
		const tx = Number(o.position?.x || 0);
		const ty = Number(o.position?.y || 0);
		const sx = Number(o.scale?.x ?? 1);
		const sy = Number(o.scale?.y ?? 1);
		const rz = Number(o.rotation?.z ?? 0);
		const c = Math.cos(rz), s = Math.sin(rz);
		const L = { a: c * sx, b: s * sx, c: -s * sy, d: c * sy, e: tx, f: ty };
		M = mul(M, L);
	}
	return M;
}

export function invert(M) {
	const det = M.a * M.d - M.b * M.c || 1e-12;
	const ia =  M.d / det;
	const ib = -M.b / det;
	const ic = -M.c / det;
	const id =  M.a / det;
	const ie = -(ia * M.e + ic * M.f);
	const iff = -(ib * M.e + id * M.f);
	return { a: ia, b: ib, c: ic, d: id, e: ie, f: iff };
}

export function worldMatrixInverse(node) {
	return invert(worldMatrix(node));
}

/* ========================= PIXELS ↔ WORLD ========================= */

export function pxToWorld(renderer, px = 10) {
	const k = (renderer?.pixelRatio || 1) * (renderer?.viewScale || 1);
	return px / k;
}

/**
 * Screen mouse event → world coords
 * Assumes renderer2D canvas scaling is pixelRatio*viewScale.
 */
export function eventToWorld(e, canvas, renderer) {
	 const rect = canvas.getBoundingClientRect();
	 const sx = canvas.width  / rect.width;
	 const sy = canvas.height / rect.height;
 
	 // canvas-space (device pixels)
	 const cx = (e.clientX - rect.left) * sx;
	 const cy = (e.clientY - rect.top)  * sy;
 
	 const pr  = renderer?.pixelRatio || 1;
	 const vs  = renderer?.viewScale  || 1;
	 const k   = pr * vs;
	 const off = renderer?.viewOffset || { x: 0, y: 0 }; // device-pixel pan (if used)
 
	 // invert: world = (canvas - off) / (pr*vs)
	 return { x: (cx - off.x) / k, y: (cy - off.y) / k };
 }

/* ========================= GEOMETRY & PATHS ========================= */

export function isClosed(pts) {
	if (!pts || pts.length < 2) return false;
	const a = pts[0], b = pts[pts.length - 1];
	return Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) <= 1e-6;
}

export function pointInPolygon(x, y, pts) {
	let inside = false;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const xi = pts[i].x, yi = pts[i].y;
		const xj = pts[j].x, yj = pts[j].y;
		const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
		if (intersect) inside = !inside;
	}
	return inside;
}

export function distSqToSeg(px, py, a, b) {
	const vx = b.x - a.x, vy = b.y - a.y;
	const wx = px - a.x, wy = py - a.y;
	const c1 = vx * wx + vy * wy;
	if (c1 <= 0) return wx * wx + wy * wy;
	const c2 = vx * vx + vy * vy;
	if (c2 <= c1) {
		const dx = px - b.x, dy = py - b.y;
		return dx * dx + dy * dy;
	}
	const t = c1 / c2;
	const projx = a.x + t * vx, projy = a.y + t * vy;
	const dx = px - projx, dy = py - projy;
	return dx * dx + dy * dy;
}

export function pointNearPolyline(x, y, pts, tol) {
	const t2 = tol * tol;
	for (let i = 0; i < pts.length - 1; i++) {
		if (distSqToSeg(x, y, pts[i], pts[i + 1]) <= t2) return true;
	}
	return false;
}

/**
 * Aggregate local points out of a Graphic2D object.
 * Supports either { _paths: Point[][] } or { _points: Point[] }.
 */
export function localPoints(o) {
	const g = o?.graphic2d;
	if (!g) return null;
	if (Array.isArray(g._paths)) {
		const out = [];
		for (const path of g._paths) if (Array.isArray(path)) out.push(...path);
		return out;
	}
	if (Array.isArray(g._points)) return g._points;
	return null;
}

/* ========================= TRAVERSAL & BOUNDS ========================= */

export function traverse2D(node, fn) {
	if (!node) return;
	if (node.is2D) fn(node);
	const kids = node.children || node._children || [];
	for (const c of kids) traverse2D(c, fn);
}

export function worldAABB(node) {
	const pts = localPoints(node);
	if (!pts || pts.length === 0) return null;
	const M = worldMatrix(node);
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of pts) {
		const wp = applyMat(M, p.x, p.y);
		if (wp.x < minX) minX = wp.x;
		if (wp.y < minY) minY = wp.y;
		if (wp.x > maxX) maxX = wp.x;
		if (wp.y > maxY) maxY = wp.y;
	}
	return { minX, minY, maxX, maxY };
}

export function worldAABBDeep(root) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	traverse2D(root, (o) => {
		const pts = localPoints(o);
		if (!pts || pts.length === 0) return;
		const M = worldMatrix(o);
		for (const p of pts) {
			const wp = applyMat(M, p.x, p.y);
			if (wp.x < minX) minX = wp.x;
			if (wp.y < minY) minY = wp.y;
			if (wp.x > maxX) maxX = wp.x;
			if (wp.y > maxY) maxY = wp.y;
		}
	});
	if (!isFinite(minX)) return null;
	return { minX, minY, maxX, maxY };
}

/* ========================= SELECTION FRAMES ========================= */

export function selectionAABB(objs) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const o of objs) {
		const bb = worldAABBDeep(o);
		if (!bb) continue;
		if (bb.minX < minX) minX = bb.minX;
		if (bb.minY < minY) minY = bb.minY;
		if (bb.maxX > maxX) maxX = bb.maxX;
		if (bb.maxY > maxY) maxY = bb.maxY;
	}
	if (!isFinite(minX)) return null;
	return { minX, minY, maxX, maxY };
}

/**
 * Returns an averaged frame { cx, cy, theta } for a set of 2D objects.
 */
export function selectionFrame(objs) {
	const aabb = selectionAABB(objs);
	if (!aabb) return null;
	const cx = (aabb.minX + aabb.maxX) / 2;
	const cy = (aabb.minY + aabb.maxY) / 2;

	let sum = 0, n = 0;
	for (const o of objs) {
		const M = worldMatrix(o);
		const ang = Math.atan2(M.b, M.a);
		if (Number.isFinite(ang)) { sum += ang; n++; }
	}
	const theta = n ? (sum / n) : 0;
	return { cx, cy, theta };
}

/**
 * Oriented bounding box in a frame {cx,cy,theta}.
 */
export function selectionOBB(roots, frame) {
	const { cx, cy, theta } = frame;
	const c = Math.cos(-theta), s = Math.sin(-theta);
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

	const accum = (o) => {
		const pts = localPoints(o);
		if (!pts || pts.length === 0) return;
		const M = worldMatrix(o);
		for (const p of pts) {
			const wp = applyMat(M, p.x, p.y);
			const dx = wp.x - cx, dy = wp.y - cy;
			const lx = dx * c - dy * s;
			const ly = dx * s + dy * c;
			if (lx < minX) minX = lx;
			if (ly < minY) minY = ly;
			if (lx > maxX) maxX = lx;
			if (ly > maxY) maxY = ly;
		}
	};

	for (const r of roots) traverse2D(r, accum);
	if (!isFinite(minX)) return null;
	return { minX, minY, maxX, maxY };
}

/* ========================= FRAMES & RECTS ========================= */

export function toFrameLocal(wx, wy, cx, cy, theta) {
	const c = Math.cos(-theta), s = Math.sin(-theta);
	const dx = wx - cx, dy = wy - cy;
	return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export function rectFromPoints(a, b) {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	const w = Math.abs(b.x - a.x);
	const h = Math.abs(b.y - a.y);
	return { x, y, w, h };
}

export function rectIntersectsAABB(rect, aabb) {
	return (
		aabb.minX < rect.x + rect.w &&
		aabb.maxX > rect.x &&
		aabb.minY < rect.y + rect.h &&
		aabb.maxY > rect.y
	);
}

/* ========================= ANGLES & QUATS ========================= */

export function snapAngleSoft(a, step = Math.PI / 4, tol = Math.PI / 36) {
	const k = Math.round(a / step) * step;
	return (Math.abs(a - k) < tol) ? k : a;
}

export function quatFromZ(rad) {
	const half = rad * 0.5;
	return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
}

/* ========================= HIT-TESTS ========================= */

/**
 * Hit test a single 2D object in world coordinates.
 * @param {object} o       2D object
 * @param {number} wx      world x
 * @param {number} wy      world y
 * @param {object} opts    { renderer, strokePadPx=6 }
 */
export function hitObject(o, wx, wy, opts = {}) {
	if (!passesAncestorMasks(o, wx, wy)) return false;
	
	const isBitmap = o.hasComponent('Bitmap2D')
	
	if (isBitmap) {
		// same local rect the renderer uses
		const rect = localBitmapRectFromGraphic2D(o);
		if (rect) {
			const Minv = worldMatrixInverse(o);
			const lp = applyMat(Minv, wx, wy); // world → local (handles nesting, rotation, scale)
			const x0 = rect.x, x1 = rect.x + rect.w;
			const y0 = rect.y, y1 = rect.y + rect.h;
			if (lp.x >= x0 && lp.x <= x1 && lp.y >= y0 && lp.y <= y1) return true;
		} else {
			// fallback: world AABB containment if rect is unavailable
			const bb = worldAABBDeep(o);
			if (bb && wx >= bb.minX && wx <= bb.maxX && wy >= bb.minY && wy <= bb.maxY) return true;
		}
		// If not inside, continue to generic path logic (in case there is any)
	}
	
	const pts = localPoints(o);
	if (!pts || pts.length < 2) return false;
	
	const Minv = worldMatrixInverse(o);
	const lp = applyMat(Minv, wx, wy);
	
	const g = o?.graphic2d || {};
	const hasFill   = !!(g.fill || g.filled || g.hasFill || g.fillStyle);
	const hasStroke = !!(g.line || g.stroke || g.stroked || g.hasStroke || g.strokeStyle || g.lineWidth);
	const strokeW   = Number(g.lineWidth || g.strokeWidth || 0);
	
	const padPx = Number(opts.strokePadPx ?? 6);
	const tol = Math.max(pxToWorld(opts.renderer, padPx), strokeW * 0.5);
	
	// Fill: treat as closed
	if (hasFill && pointInPolygon(lp.x, lp.y, pts)) return true;
	
	// Stroke: near any segment
	if (hasStroke && pointNearPolyline(lp.x, lp.y, pts, tol)) return true;
	
	// Optionally test closing segment for open-but-rendered shapes
	if (hasStroke && pts.length > 1) {
	const a = pts[pts.length - 1], b = pts[0];
	if (distSqToSeg(lp.x, lp.y, a, b) <= tol * tol) return true;
	}
	
	return false;
 }

/**
 * Deep hit test: a root node vs. world point (includes descendants).
 * Quick-reject via deep AABB padded by pixel tolerance.
 */
export function hitObjectDeep(root, wx, wy, opts = {}) {
	const bb = worldAABBDeep(root);
	if (!bb) return false;

	const pad = pxToWorld(opts.renderer, Number(opts.padPx ?? 8));
	if (wx < bb.minX - pad || wx > bb.maxX + pad || wy < bb.minY - pad || wy > bb.maxY + pad) {
		return false;
	}

	if (root.__simpleHit) return true; // app-specific fast path

	let hit = false;
	traverse2D(root, (node) => {
		if (hit) return;
		if (hitObject(node, wx, wy, opts)) hit = true;
	});
	return hit;
}

// d2dutility.js — ADD these exports

/* ==================== numeric helpers ==================== */
export const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/* ==================== renderer/canvas helpers ==================== */
export function canvasScale(d2drenderer) {
	const pr = d2drenderer.pixelRatio || 1;
	const vs = d2drenderer.viewScale  || 1;
	return pr * vs;
}

export function mouseToCanvas(canvas, e) {
	const rect = canvas.getBoundingClientRect();
	const x = (e.clientX - rect.left) * (canvas.width / rect.width);
	const y = (e.clientY - rect.top) * (canvas.height / rect.height);
	return { x, y };
}

/* ==================== DOMMatrix helpers ==================== */
export function worldDOMMatrix(node) {
	let m = new DOMMatrix();
	const stack = [];
	for (let n = node; n; n = n.parent) stack.push(n);
	stack.reverse();
	for (const o of stack) {
		const tx = Number(o.position?.x) || 0;
		const ty = Number(o.position?.y) || 0;
		const rz = Number(o.rotation?.z) || 0;
		const sx = Number(o.scale?.x) || 1;
		const sy = Number(o.scale?.y) || 1;
		m = m.translate(tx, ty).rotate(rz * 180 / Math.PI).scale(sx, sy);
	}
	return m;
}

export function applyDOM(M, x, y) {
	const p = new DOMPoint(x, y).matrixTransform(M);
	return { x: p.x, y: p.y };
}

export function viewMatrix(d2drenderer) {
	const pr  = d2drenderer.pixelRatio || 1;
	const vs  = d2drenderer.viewScale  || 1;
	const off = d2drenderer.viewOffset || { x:0, y:0 };
	return new DOMMatrix().translate(off.x, off.y).scale(pr * vs);
}

export function childScreenMatrix(d2drenderer, child) {
	return viewMatrix(d2drenderer).multiply(worldDOMMatrix(child));
}

export function hostToChildLocal(hostNode, childNode, pHost) {
	const W_host  = worldDOMMatrix(hostNode);
	const W_child = worldDOMMatrix(childNode);
	const M = W_child.inverse().multiply(W_host);
	const q = new DOMPoint(pHost.x, pHost.y).matrixTransform(M);
	return { x: q.x, y: q.y };
}

/* ==================== points/paths helpers ==================== */
export function isClosedPoints(points, eps = 1e-6) {
	if (points.length < 2) return false;
	const a = points[0], b = points[points.length - 1];
	return approx(a.x, b.x, eps) && approx(a.y, b.y, eps);
}

export function logicalPoints(points, eps = 1e-6) {
	if (points.length < 2) return points.slice();
	const a = points[0], b = points[points.length - 1];
	if (approx(a.x, b.x, eps) && approx(a.y, b.y, eps)) return points.slice(0, -1);
	return points.slice();
}

export function logicalIndexMap(points, lindex, eps = 1e-6) {
	const last = points.length - 1;
	if (points.length >= 2) {
		const a = points[0], b = points[last];
		if (approx(a.x, b.x, eps) && approx(a.y, b.y, eps)) {
			if (lindex === 0) return [0, last];
		}
	}
	return [lindex];
}

export function clonePaths(paths) {
	return paths.map(path => path.map(p => ({ x: p.x, y: p.y })));
}

export function snapshotPointsFor(obj, selectedByPath /* Map(pidx -> [lindex]) */) {
	const g = obj?.graphic2d;
	const paths = Array.isArray(g?._paths) ? g._paths : [];
	const items = [];
	for (const [pidx, lis] of selectedByPath.entries()) {
		const path = paths[pidx] || [];
		for (const li of lis) {
			const map = logicalIndexMap(path, li);
			for (const pi of map) {
				const p = path[pi];
				items.push({ pidx, i: pi, x: p.x, y: p.y });
			}
		}
	}
	return { obj, items };
}

export function applyPointsSnapshot(obj, snap) {
	if (!snap || snap.obj !== obj) return;
	const paths = obj?.graphic2d?._paths || [];
	for (const it of snap.items) {
		const path = paths[it.pidx];
		if (path && path[it.i]) {
			path[it.i].x = it.x;
			path[it.i].y = it.y;
		}
	}
	obj.checkSymbols?.();
}

export function pointSegDist2(p, a, b) {
	const vx = b.x - a.x, vy = b.y - a.y;
	const wx = p.x - a.x, wy = p.y - a.y;
	const vv = vx * vx + vy * vy || 1e-12;
	let t = (wx * vx + wy * vy) / vv;
	if (t < 0) t = 0; else if (t > 1) t = 1;
	const px = a.x + t * vx;
	const py = a.y + t * vy;
	const dx = p.x - px, dy = p.y - py;
	return { d2: dx * dx + dy * dy, t };
}

/* Rect-like (Text2D/Bitmap2D) drag metadata */
export function isRectLike2D(obj) {
	return obj?.hasComponent?.('Text2D') || obj?.hasComponent?.('Bitmap2D');
}

export function buildTextDragMeta(obj, pidx, lindex) {
	const paths = obj?.graphic2d?._paths || [];
	const path  = paths[pidx] || [];
	if (path.length < 4) return { active:false };

	const wasClosed = isClosedPoints(path);
	const logical = logicalPoints(path);
	const grabP   = logical[lindex];
	if (!grabP) return { active:false };

	const eps = 1e-6;
	const sameX = [];
	const sameY = [];
	for (let i = 0; i < path.length; i++) {
		const p = path[i];
		if (Math.abs(p.x - grabP.x) <= eps) sameX.push(i);
		if (Math.abs(p.y - grabP.y) <= eps) sameY.push(i);
	}

	return {
		active: true,
		pidx,
		moveXIdx: Array.from(new Set(sameX)),
		moveYIdx: Array.from(new Set(sameY)),
		wasClosed
	};
}

/* ==================== canvas-space bounds + snapping ==================== */
export function objBoundsCanvas(d2drenderer, obj) {
	const g = obj?.graphic2d;
	const paths = Array.isArray(g?._paths) ? g._paths : [];
	if (paths.length === 0) return null;

	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	const M = childScreenMatrix(d2drenderer, obj);

	for (const path of paths) {
		for (const p of (path || [])) {
			const q = new DOMPoint(p.x, p.y).matrixTransform(M);
			if (q.x < minx) minx = q.x;
			if (q.y < miny) miny = q.y;
			if (q.x > maxx) maxx = q.x;
			if (q.y > maxy) maxy = q.y;
		}
	}
	if (!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) return null;
	return {
		l: minx, r: maxx, t: miny, b: maxy,
		cx: (minx + maxx) * 0.5,
		cy: (miny + maxy) * 0.5
	};
}

export function selectionBoundsCanvas(d2drenderer, objs) {
	let rect = null;
	for (const o of objs) {
		const b = objBoundsCanvas(d2drenderer, o);
		if (!b) continue;
		if (!rect) rect = { ...b };
		else {
			rect.l = Math.min(rect.l, b.l);
			rect.t = Math.min(rect.t, b.t);
			rect.r = Math.max(rect.r, b.r);
			rect.b = Math.max(rect.b, b.b);
			rect.cx = (rect.l + rect.r) * 0.5;
			rect.cy = (rect.t + rect.b) * 0.5;
		}
	}
	return rect;
}

export function buildAlignGuides(d2drenderer, canvas, focusNode, selectedObjs) {
	const w = canvas.width, h = canvas.height;
	const selectedSet = new Set(selectedObjs);

	const pool = Array.isArray(focusNode?.children) ? focusNode.children
		: (Array.isArray(_root?.children) ? _root.children : []);

	const candidates = [];
	for (const n of pool) {
		if (selectedSet.has(n)) continue;
		if (!n?.is2D || !Array.isArray(n.graphic2d?._paths)) continue;
		const b = objBoundsCanvas(d2drenderer, n);
		if (b) candidates.push(b);
	}

	const v = new Set([w * 0.5]);   // vertical lines (x)
	const hset = new Set([h * 0.5]); // horizontal lines (y)

	for (const b of candidates) {
		v.add(b.l); v.add(b.cx); v.add(b.r);
		hset.add(b.t); hset.add(b.cy); hset.add(b.b);
	}
	return { v: Array.from(v.values()), h: Array.from(hset.values()) };
}

export function findSnapDelta(rect, guides, snapPx) {
	let bestDx = 0, bestDy = 0;
	let vLine = null, hLine = null;

	// X: compare left/center/right to each vertical guide
	let best = Infinity;
	const vx = [rect.l, rect.cx, rect.r];
	for (const gx of guides.v) {
		for (const x of vx) {
			const d = gx - x; const ad = Math.abs(d);
			if (ad <= snapPx && ad < best) { best = ad; bestDx = d; vLine = gx; }
		}
	}

	// Y: compare top/middle/bottom to each horizontal guide
	best = Infinity;
	const vy = [rect.t, rect.cy, rect.b];
	for (const gy of guides.h) {
		for (const y of vy) {
			const d = gy - y; const ad = Math.abs(d);
			if (ad <= snapPx && ad < best) { best = ad; bestDy = d; hLine = gy; }
		}
	}
	return { dx: bestDx, dy: bestDy, vLine, hLine };
}

/* List 2D roots in painter's order (later = topmost) */
export function all2DInDrawOrder(host) {
	const out = [];
	(host?.children || []).forEach(o => { if (o?.is2D && Array.isArray(o.graphic2d?._paths)) out.push(o); });
	out.sort((a, b) => (a.position?.z || 0) - (b.position?.z || 0));
	return out;
}

/* ---------------- matrices & coords ---------------- */
export function hostScreenMatrix(d2dr, host){
	return viewMatrix(d2dr).multiply(worldDOMMatrix(host || _editor?.focus || _root));
}
export function canvasToLocal(d2dr, host, canvasPt){
	const inv = hostScreenMatrix(d2dr, host).inverse();
	const q = new DOMPoint(canvasPt.x, canvasPt.y).matrixTransform(inv);
	return { x:q.x, y:q.y };
}
export function localToCanvas(d2dr, host, localPt){
	const M = hostScreenMatrix(d2dr, host);
	const q = new DOMPoint(localPt.x, localPt.y).matrixTransform(M);
	return { x:q.x, y:q.y };
}
export function childToHostLocal(hostNode, childNode, pChild){
	const W_host  = worldDOMMatrix(hostNode || _root);
	const W_child = worldDOMMatrix(childNode);
	const M = W_host.inverse().multiply(W_child);
	const q = new DOMPoint(pChild.x, pChild.y).matrixTransform(M);
	return { x: q.x, y: q.y };
}

/* ---------------- pixels & simplify ---------------- */
export function pxToLocalScalar(d2dr, px){ return px / ((d2dr.pixelRatio||1) * (d2dr.viewScale||1)); }
export function rdpSimplify(points, epsilonLocal){
	if (!points || points.length < 3) return points ? points.slice() : [];
	const sqEps = epsilonLocal * epsilonLocal;
	const sqSegDist = (p, a, b) => {
		let x=a.x, y=a.y, dx=b.x-x, dy=b.y-y;
		if (dx!==0 || dy!==0) {
			const t=((p.x-x)*dx+(p.y-y)*dy)/(dx*dx+dy*dy);
			if (t>1){ x=b.x; y=b.y; }
			else if (t>0){ x+=dx*t; y+=dy*t; }
		}
		dx=p.x-x; dy=p.y-y; return dx*dx+dy*dy;
	};
	const keep=new Array(points.length).fill(false);
	keep[0]=keep[points.length-1]=true;
	const stack=[[0,points.length-1]];
	while (stack.length){
		const [first,last]=stack.pop();
		let idx=-1, maxSq=-1;
		for (let i=first+1;i<last;i++){
			const d=sqSegDist(points[i], points[first], points[last]);
			if (d>maxSq){ idx=i; maxSq=d; }
		}
		if (maxSq>sqEps && idx!==-1){ keep[idx]=true; stack.push([first,idx],[idx,last]); }
	}
	const out=[]; for (let i=0;i<points.length;i++) if (keep[i]) out.push(points[i]);
	return out;
}
export function spacingSimplify(points, minStepLocal){
	if (!points || points.length < 3) return points ? points.slice() : [];
	const out=[points[0]];
	let last=points[0];
	const min2=minStepLocal*minStepLocal;
	for (let i=1;i<points.length-1;i++){
		const p=points[i], dx=p.x-last.x, dy=p.y-last.y;
		if (dx*dx+dy*dy >= min2){ out.push(p); last=p; }
	}
	out.push(points[points.length-1]);
	return out;
}
export function simplifyAdaptive(d2dr, points, { tool='pencil', simplifyPx, minStepPx } = {}){
	const defaults = { brush:{simplifyPx:1.25,minStepPx:0.75}, pencil:{simplifyPx:2.25,minStepPx:1.25} };
	const cfg = {
		simplifyPx: simplifyPx ?? defaults[tool]?.simplifyPx ?? 2.0,
		minStepPx:  minStepPx  ?? defaults[tool]?.minStepPx  ?? 1.0
	};
	const epsLocal  = pxToLocalScalar(d2dr, cfg.simplifyPx);
	const stepLocal = pxToLocalScalar(d2dr, cfg.minStepPx);
	return spacingSimplify(rdpSimplify(points, epsLocal), stepLocal);
}

/* ---------------- geometry ---------------- */
export const approxPt  = (a,b)=>approx(a.x,b.x)&&approx(a.y,b.y);
export function dist2D(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy; }
export function makeRectPoints(a,b){
	return [
		{ x:a.x, y:a.y },
		{ x:b.x, y:a.y },
		{ x:b.x, y:b.y },
		{ x:a.x, y:b.y },
		{ x:a.x, y:a.y }
	];
}
export function makeEllipsePoints(a,b,segs=64){
	const cx=(a.x+b.x)*0.5, cy=(a.y+b.y)*0.5;
	const rx=Math.max(0.1, Math.abs(b.x-a.x)*0.5);
	const ry=Math.max(0.1, Math.abs(b.y-a.y)*0.5);
	const out=[];
	for (let i=0;i<segs;i++){ const t=(i/segs)*Math.PI*2; out.push({ x:cx+Math.cos(t)*rx, y:cy+Math.sin(t)*ry }); }
	out.push({ x:out[0].x, y:out[0].y });
	return out;
}
export function cleanAndClose(points){
	const pts=(points||[]).filter(p=>isFinite(p?.x)&&isFinite(p?.y)).map(p=>({x:+p.x,y:+p.y}));
	if (pts.length===0) return pts;
	const ded=[pts[0]];
	for (let i=1;i<pts.length;i++) if (!approxPt(pts[i], ded[ded.length-1])) ded.push(pts[i]);
	if (!ded.length) return ded;
	if (!approxPt(ded[0], ded[ded.length-1])) ded.push({ x:ded[0].x, y:ded[0].y });
	return ded;
}
export function circlePolygon(c,r,segs=24){
	const out=[]; for (let i=0;i<segs;i++){ const t=(i/segs)*Math.PI*2; out.push({x:c.x+Math.cos(t)*r,y:c.y+Math.sin(t)*r}); }
	out.push({ x:out[0].x, y:out[0].y }); return out;
}
export function normals(a,b){ const dx=b.x-a.x, dy=b.y-a.y; const L=Math.hypot(dx,dy)||1; return { x:-dy/L, y:dx/L }; }
export function strokeToPolygon(pts, radius, allowCircle){
	if (!pts || pts.length<2){
		if (allowCircle && pts && pts.length===1) return circlePolygon(pts[0], radius);
		return pts ? pts.map(p=>({x:p.x,y:p.y})) : [];
	}
	const left=[], right=[], n=pts.length;
	for (let i=0;i<n;i++){
		const p=pts[i];
		let nrm;
		if (i===0) nrm=normals(pts[i],pts[i+1]);
		else if (i===n-1) nrm=normals(pts[i-1],pts[i]);
		else {
			const n1=normals(pts[i-1],pts[i]), n2=normals(pts[i],pts[i+1]);
			const nx=n1.x+n2.x, ny=n1.y+n2.y, L=Math.hypot(nx,ny)||1; nrm={x:nx/L,y:ny/L};
		}
		left.push({ x:p.x+nrm.x*radius, y:p.y+nrm.y*radius });
		right.push({ x:p.x-nrm.x*radius, y:p.y-nrm.y*radius });
	}
	right.reverse();
	const poly=left.concat(right);
	if (poly.length>0) poly.push({ x:poly[0].x, y:poly[0].y });
	return poly;
}
export function centerObject(obj){
	const paths = Array.isArray(obj?.graphic2d?._paths) ? obj.graphic2d._paths : [];
	if (paths.length===0) return;
	let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
	for (const path of paths){
		for (const p of path){ const x=+p.x||0, y=+p.y||0;
			if (x<minx)minx=x; if (y<miny)miny=y; if (x>maxx)maxx=x; if (y>maxy)maxy=y; }
	}
	if (!isFinite(minx)||!isFinite(miny)||!isFinite(maxx)||!isFinite(maxy)) return;
	const cx=(minx+maxx)*0.5, cy=(miny+maxy)*0.5;
	for (const path of paths) for (const p of path){ p.x -= cx; p.y -= cy; }
	obj.position = { x:(+obj.position?.x||0)+cx, y:(+obj.position?.y||0)+cy, z:+obj.position?.z||0 };
	obj.invalidateGraphic2D?.();
}

/* ---------------- color ---------------- */
export function hex8(v, fallback){
	if (!v || typeof v !== 'string') return fallback || 'rgba(255,255,255,1)';
	if (v.startsWith('#') && (v.length === 9 || v.length === 7)) {
		if (v.length === 7) return v;
		const r = parseInt(v.slice(1,3),16);
		const g = parseInt(v.slice(3,5),16);
		const b = parseInt(v.slice(5,7),16);
		const a = parseInt(v.slice(7,9),16) / 255;
		return `rgba(${r},${g},${b},${a})`;
	}
	if (v.startsWith('0x')) {
		const n = Number(v);
		const r = (n >> 24) & 0xff;
		const g = (n >> 16) & 0xff;
		const b = (n >> 8) & 0xff;
		const a = (n & 0xff) / 255;
		return `rgba(${r},${g},${b},${a})`;
	}
	return v;
}

/* ---------------- polygon math used by subtract ---------------- */
export const signedArea = (poly)=> {
	let a=0; for (let i=0;i<poly.length-1;i++) a += poly[i].x*poly[i+1].y - poly[i+1].x*poly[i].y;
	return a*0.5;
};
function _ensureCCW(poly){ const p=cleanAndClose(poly).slice(); if (p.length>=3 && signedArea(p)<0) p.reverse(); return p; }
function _segIntersect(a,b,c,d){
	const bax=b.x-a.x, bay=b.y-a.y, cdx=d.x-c.x, cdy=d.y-c.y;
	const den = bax*(-cdy) - bay*(-cdx);
	if (Math.abs(den) < 1e-12) return {hit:false};
	const cxax=c.x-a.x, cyay=c.y-a.y;
	const t = (cxax*(-cdy) - cyay*(-cdx)) / den;
	const u = (cxax*(-bay) + cyay*(bax)) / den;
	if (t<-1e-12 || t>1+1e-12 || u<-1e-12 || u>1+1e-12) return {hit:false};
	return {hit:true, t:Math.max(0,Math.min(1,t)), u:Math.max(0,Math.min(1,u)),
		x:a.x + bax*t, y:a.y + bay*t};
}
function _pointInPolygon(p, poly){
	let inside=false;
	for (let i=0, j=poly.length-1; i<poly.length; j=i++){
		const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
		const inter = ((yi>p.y)!==(yj>p.y)) && (p.x < (xj-xi)*(p.y-yi)/((yj-yi)||1e-12) + xi);
		if (inter) inside = !inside;
	}
	return inside;
}
function _makeNode(p){ return { x:p.x, y:p.y, next:null, prev:null, neighbor:null, alpha:0, entry:false, visited:false, intersect:false, orig:true }; }
function _linkRing(pts){
	const base=(approxPt(pts[0], pts[pts.length-1]))? pts.slice(0,-1) : pts.slice();
	if (base.length<3) return null;
	const clean=[base[0]]; for (let i=1;i<base.length;i++) if (!approxPt(base[i], clean[clean.length-1])) clean.push(base[i]);
	if (clean.length<3) return null;
	const nodes=clean.map(p=>_makeNode(p));
	const n=nodes.length;
	for (let i=0;i<n;i++){ nodes[i].next = nodes[(i+1)%n]; nodes[i].prev = nodes[(i-1+n)%n]; }
	return nodes[0];
}
function _insertAfter(a, x){ x.prev=a; x.next=a.next; a.next.prev=x; a.next=x; }
function _nextOriginal(n){ let k=n.next; while (k!==n && k && !k.orig) k=k.next; return k; }
function _ringCountOriginal(head){ let cnt=0, k=head; do{ if (k.orig) cnt++; k=k.next; } while (k!==head); return cnt; }
function _ringToArray(head){ const out=[]; let n=head; do{ out.push({x:n.x,y:n.y}); n=n.next; } while (n!==head);
	if (!approxPt(out[0], out[out.length-1])) out.push({x:out[0].x,y:out[0].y}); return out; }

function _booleanDiffSimple(Ain, Bin){
	const A = _linkRing(Ain), B = _linkRing(Bin);
	if (!A || !B) return [];

	// insert intersections
	let a = A; const aEdges = _ringCountOriginal(A);
	for (let i=0;i<aEdges;i++){
		const ai=a, aj=_nextOriginal(ai);
		let b = B; const bEdges = _ringCountOriginal(B);
		for (let j=0;j<bEdges;j++){
			const bi=b, bj=_nextOriginal(bi);
			const inter=_segIntersect(ai,aj,bi,bj);
			if (inter.hit){
				const an={..._makeNode({x:inter.x,y:inter.y}), intersect:true, orig:false, alpha:inter.t};
				const bn={..._makeNode({x:inter.x,y:inter.y}), intersect:true, orig:false, alpha:inter.u};
				an.neighbor=bn; bn.neighbor=an;
				let p=ai; while (p.next!==aj && p.next.intersect && p.next.alpha < an.alpha) p=p.next; _insertAfter(p, an);
				p=bi; while (p.next!==bj && p.next.intersect && p.next.alpha < bn.alpha) p=p.next; _insertAfter(p, bn);
			}
			b=_nextOriginal(b);
		}
		a=_nextOriginal(a);
	}

	// early out: no intersections
	let any=false; { let t=A; do{ if (t.intersect){ any=true; break; } t=t.next; } while (t!==A); }
	if (!any){
		const Aarr=_ringToArray(A), Barr=_ringToArray(B);
		if (Aarr.length<4) return [];
		if (Barr.length<4) return [Aarr];
		const aInsideB=_pointInPolygon(Aarr[0], Barr);
		const bInsideA=_pointInPolygon(Barr[0], Aarr);
		if (bInsideA && !aInsideB){
			const Aout=Aarr.slice(), Bout=Barr.slice();
			const areaA=signedArea(Aout), areaB=signedArea(Bout);
			if ((areaA>=0 && areaB>=0) || (areaA<=0 && areaB<=0)) Bout.reverse();
			return [Aout, Bout];
		}
		return (!aInsideB) ? [Aarr] : [];
	}

	// mark entry toggles along A
	let inside = _pointInPolygon({x:A.x,y:A.y}, Bin);
	let cur=A;
	do{ if (cur.intersect){ cur.entry=!inside; inside=!inside; } cur=cur.next; } while (cur!==A);

	// trace
	const results=[];
	const nextUnvisited=()=>{ let k=A; do{ if (k.intersect && !k.visited) return k; k=k.next; } while (k!==A); return null; };
	let start;
	while ((start=nextUnvisited())){
		const out=[]; let n=start; let forward=n.entry; let steps=0;
		while (steps++<10000){
			if (n.visited && n===start) break;
			n.visited=true; out.push({x:n.x,y:n.y});
			if (n.intersect){ n.neighbor.visited=true; n=n.neighbor; out.push({x:n.x,y:n.y}); forward=!forward; }
			n = forward ? n.next : n.prev;
			if (n===start){ out.push({x:n.x,y:n.y}); break; }
		}
		const clean=cleanAndClose(out);
		if (clean.length>=4) results.push(clean);
	}
	return results;
}
export function diffPathsByCutter(paths, cutter){
	if (!Array.isArray(paths) || paths.length===0) return [];
	const C=_ensureCCW(cutter);
	if (C.length<4 || Math.abs(signedArea(C))<1e-9) return paths.map(p=>p.slice());
	const out=[];
	for (const P of paths){
		const A=_ensureCCW(P);
		if (A.length<4 || Math.abs(signedArea(A))<1e-9){ out.push(P.slice()); continue; }
		const parts=_booleanDiffSimple(A, C);
		for (const r of parts){
			const rr=cleanAndClose(r);
			if (rr.length>=3){ if (signedArea(rr)<0) rr.reverse(); out.push(rr); }
		}
	}
	return out;
}

export function buildCompoundPathForGraphic(graphic) {
	if (!graphic) return null;

	// normalize to array of {points, subtract, borderRadius}
	let entries = [];
	if (Array.isArray(graphic._paths)) {
		for (const p of graphic._paths) {
			if (Array.isArray(p)) entries.push({ points: p, subtract:false, borderRadius: graphic.borderRadius });
			else if (p?.points)  entries.push({ points: p.points, subtract: !!p.subtract, borderRadius: p.borderRadius ?? graphic.borderRadius });
		}
	}
	if (Array.isArray(graphic._points)) {
		entries.push({ points: graphic._points, subtract:false, borderRadius: graphic.borderRadius });
	}

	const approxClosed = (pts) =>
		pts.length >= 3 &&
		Math.abs(pts[0].x - pts[pts.length-1].x) < 1e-6 &&
		Math.abs(pts[0].y - pts[pts.length-1].y) < 1e-6;

	const roundedPath = (pts, r) => {
		if (!approxClosed(pts) || !r || pts.length < 3) return null;
		const base = pts.slice(0, -1);
		const n = base.length;
		if (n < 3) return null;
		const get = i => base[(i+n)%n];
		const p = new Path2D();
		for (let i=0;i<n;i++){
			const p0=get(i-1), p1=get(i), p2=get(i+1);
			const v1x=p1.x-p0.x, v1y=p1.y-p0.y;
			const v2x=p2.x-p1.x, v2y=p2.y-p1.y;
			const l1=Math.hypot(v1x,v1y)||1, l2=Math.hypot(v2x,v2y)||1;
			const rr=Math.min(Math.max(0,Number(r)||0), l1/2, l2/2);
			const inX = p1.x - (v1x/l1)*rr, inY = p1.y - (v1y/l1)*rr;
			const outX= p1.x + (v2x/l2)*rr, outY= p1.y + (v2y/l2)*rr;
			if (i===0) p.moveTo(inX,inY); else p.lineTo(inX,inY);
			p.quadraticCurveTo(p1.x,p1.y,outX,outY);
		}
		p.closePath();
		return p;
	};

	const rawPath = (pts) => {
		const p = new Path2D();
		p.moveTo(pts[0].x, pts[0].y);
		for (let i=1;i<pts.length;i++) p.lineTo(pts[i].x, pts[i].y);
		if (approxClosed(pts)) p.closePath();
		return p;
	};

	// one compound path: add non-subtract + subtract (holes handled by evenodd at clip time)
	const compound = new Path2D();
	let any = false;
	for (const e of entries) {
		if (!Array.isArray(e.points) || e.points.length < 2) continue;
		const p = roundedPath(e.points, e.borderRadius) || rawPath(e.points);
		if (!p) continue;
		compound.addPath(p);
		any = true;
	}
	return any ? compound : null;
}

// --- add near your paths helpers ---
function _collectGraphicEntries(graphic) {
	// normalize to array of { points: Point[], subtract: boolean }
	const out = [];
	if (!graphic) return out;

	// _paths can be either Point[] or {points, subtract}
	if (Array.isArray(graphic._paths)) {
		for (const p of graphic._paths) {
			if (!p) continue;
			if (Array.isArray(p)) out.push({ points: p, subtract:false });
			else if (Array.isArray(p.points)) out.push({ points: p.points, subtract: !!p.subtract });
		}
	}
	// legacy _points → one positive path
	if (Array.isArray(graphic._points)) {
		out.push({ points: graphic._points, subtract:false });
	}
	return out;
}

function _closedPoly(pts) {
	if (!Array.isArray(pts) || pts.length < 3) return null;
	const a = pts[0], b = pts[pts.length - 1];
	const closed = Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) <= 1e-6;
	return closed ? pts : null;
}

/**
 * Test if a LOCAL point (x,y in the node's local space) is inside a graphic's mask area.
 * Mask area == (union of positive closed paths) minus (union of subtract closed paths).
 */
export function pointInGraphicMaskLocal(graphic, x, y) {
	const entries = _collectGraphicEntries(graphic);
	if (entries.length === 0) return false;

	let inPos = false; // inside any positive
	let inNeg = false; // inside any subtract

	for (const { points, subtract } of entries) {
		const poly = _closedPoly(points);
		if (!poly) continue; // ignore open paths for mask tests
		const inside = pointInPolygon(x, y, poly);
		if (subtract) { if (inside) inNeg = true; }
		else          { if (inside) inPos = true; }
	}
	return inPos && !inNeg;
}

/**
 * True if (wx,wy) passes all ancestor masks (including the node itself if it has mask=true).
 * Walks up the hierarchy; any mask that does NOT contain the point rejects the hit.
 */
export function passesAncestorMasks(node, wx, wy) {
	let n = node;
	while (n) {
		const g = n.graphic2d;
		if (g?.mask === true) {
			const Minv = worldMatrixInverse(n);
			const lp = applyMat(Minv, wx, wy);
			if (!pointInGraphicMaskLocal(g, lp.x, lp.y)) return false;
		}
		n = n.parent;
	}
	return true;
}

/* ==================== color helpers ==================== */

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

// split by top-level commas (ignores commas inside parentheses)
function splitTopLevel(listStr){
	const out = [];
	let depth = 0, start = 0;
	for (let i=0; i<listStr.length; i++){
		const ch = listStr[i];
		if (ch === '(') depth++;
		else if (ch === ')') depth = Math.max(0, depth-1);
		else if (ch === ',' && depth === 0){
			out.push(listStr.slice(start, i).trim());
			start = i+1;
		}
	}
	out.push(listStr.slice(start).trim());
	return out.filter(Boolean);
}

// Normalize color tokens: supports #rgb/#rrggbb/#rrggbbaa, 0xRRGGBBAA, rgb(...), rgba(...), case-insensitive.
export function hex8ToRgba(input, fallback='#000'){
	if (!input) return fallback;
	let s = String(input).trim();

	// Treat uppercase functions
	s = s.replace(/^RGB(A?)\s*\(/, (_m,a)=> a ? 'rgba(' : 'rgb(');

	// #rrggbbaa → rgba
	const m8 = s.match(/^#([0-9a-f]{8})$/i);
	if (m8){
		const h = m8[1];
		const r = parseInt(h.slice(0,2),16);
		const g = parseInt(h.slice(2,4),16);
		const b = parseInt(h.slice(4,6),16);
		const a = parseInt(h.slice(6,8),16) / 255;
		return `rgba(${r},${g},${b},${clamp01(a)})`;
	}

	// 0xRRGGBBAA → rgba
	const m0x = s.match(/^0x([0-9a-f]{8})$/i);
	if (m0x){
		const n = parseInt(m0x[1], 16) >>> 0;
		const r = (n >>> 24) & 0xff;
		const g = (n >>> 16) & 0xff;
		const b = (n >>> 8)  & 0xff;
		const a = (n & 0xff) / 255;
		return `rgba(${r},${g},${b},${clamp01(a)})`;
	}

	// #rrggbb / #rgb → let canvas handle
	if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;

	// rgb(r,g,b) → rgba(r,g,b,1)
	const mRgb = s.match(/^rgb\(\s*([^)]*)\)$/i);
	if (mRgb){
		const parts = mRgb[1].split(',').map(t=>t.trim());
		if (parts.length >= 3) return `rgba(${parts[0]},${parts[1]},${parts[2]},1)`;
	}

	// rgba(...) or named color: pass through as-is
	return s || fallback;
}

// Parse "color [offset]" where offset is "##%" or 0..1
function parseColorStop(stopStr){
	// split off the final numeric token if present
	const m = stopStr.match(/^(.*?)(?:\s+([0-9.]+%|[0-9.]+))?$/);
	if (!m) return null;
	const colorRaw = m[1].trim();
	let off = m[2];

	const color = hex8ToRgba(colorRaw, null);
	if (!color) return null;

	let offset = null;
	if (off != null){
		offset = /%$/.test(off) ? clamp01(parseFloat(off)/100) : clamp01(parseFloat(off));
		if (!Number.isFinite(offset)) offset = null;
	}
	return { color, offset };
}

// Fill in missing offsets evenly, clamp & sort
function normalizeStops(stops){
	const parsed = stops.map(parseColorStop).filter(Boolean);
	if (parsed.length === 0) return parsed;
	const missing = parsed.some(s=> s.offset == null);
	if (missing){
		const n = parsed.length;
		for (let i=0;i<n;i++) parsed[i].offset = (n===1) ? 0 : i/(n-1);
	} else {
		for (const s of parsed) s.offset = clamp01(s.offset);
		parsed.sort((a,b)=> a.offset - b.offset);
	}
	return parsed;
}

/* ===================== gradient parsers ===================== */

export function parseLinearGradient(s){
	// linear-gradient( [angle]?, stop, stop, ... )
	const inner = s.slice(s.indexOf('(')+1, s.lastIndexOf(')'));
	const parts = splitTopLevel(inner);
	if (parts.length === 0) return null;

	let angleRad = 0;
	let startIdx = 0;

	// angle first?
	const m = parts[0].match(/(-?\d+(\.\d+)?)\s*deg/i);
	if (m){
		angleRad = (parseFloat(m[1]) * Math.PI) / 180;
		startIdx = 1;
	}

	const stops = normalizeStops(parts.slice(startIdx));
	if (stops.length === 0) return null;

	return { angleRad, stops };
}

export function parseRadialGradient(s){
	// radial-gradient( [<shape>? <size>? [at <pos>]?]?, stop, stop, ... )
	const inner = s.slice(s.indexOf('(')+1, s.lastIndexOf(')'));
	const parts = splitTopLevel(inner);
	if (parts.length === 0) return null;

	let cx = 0.5, cy = 0.5;
	let startIdx = 0;

	// Known tokens we should consume if they appear in the leading segment
	const SHAPES = /(?:^|\s)(circle|ellipse)(?:\s|$)/i;
	const SIZES  = /(?:^|\s)(closest-side|farthest-side|closest-corner|farthest-corner)(?:\s|$)/i;

	const lead = parts[0].trim();

	// Helper: extract "at X% Y%" from a string if present
	const extractAt = (str) => {
		// allow "at 30% 60%" or "at 30 60" (we'll treat bare numbers as percents 0..100)
		const m = str.match(/\bat\s+([0-9.]+)(%?)\s+([0-9.]+)(%?)/i);
		if (!m) return false;
		const nx = parseFloat(m[1]); const ny = parseFloat(m[3]);
		if (!Number.isFinite(nx) || !Number.isFinite(ny)) return false;
		const x = m[2] === '%' ? nx/100 : nx/100;
		const y = m[4] === '%' ? ny/100 : ny/100;
		cx = Math.max(0, Math.min(1, x));
		cy = Math.max(0, Math.min(1, y));
		return true;
	};

	// Cases we should treat as a “leading descriptor” that must be consumed:
	//  - "circle"
	//  - "ellipse"
	//  - any size keyword
	//  - "at X Y" by itself
	//  - any combination of the above (order-insensitive, typical CSS is shape size at pos)
	let consumedLead = false;
	if (SHAPES.test(lead) || SIZES.test(lead) || /\bat\s+/i.test(lead)) {
		// If there’s an "at ..." clause in the lead, extract center
		extractAt(lead);
		consumedLead = true;
	} else if (/^\s*at\s+/i.test(lead)) {
		// If the entire first part is just "at X Y"
		if (extractAt(lead)) consumedLead = true;
	}

	if (consumedLead) startIdx = 1;

	const stops = normalizeStops(parts.slice(startIdx));
	if (stops.length === 0) return null;

	return { cx, cy, stops };
}

/* ===================== main: toCanvasPaint ===================== */

export function toCanvasPaint(ctx, paint, bounds) {
	if (!paint) return '#000';
	if (typeof paint !== 'string') {
		// later: normalize objects -> css string here
		return '#000';
	}
	const s = paint.trim();

	// ----- linear-gradient -----
	if (/^linear-gradient/i.test(s)) {
		const g = parseLinearGradient(s);
		if (!g) return s;

		// Center of bounds
		const cx = bounds.x + bounds.w * 0.5;
		const cy = bounds.y + bounds.h * 0.5;

		// Canvas vs CSS angle: canvas 0rad = +X, CSS 0deg = "to top"
		// We keep your original correction:
		const angleRad = g.angleRad - Math.PI / 2;

		const ux = Math.cos(angleRad), uy = Math.sin(angleRad);
		const rx = bounds.w * 0.5,     ry = bounds.h * 0.5;
		const L  = Math.hypot(ux * rx, uy * ry) || 1;

		const x0 = cx - ux * L, y0 = cy - uy * L;
		const x1 = cx + ux * L, y1 = cy + uy * L;

		const grad = ctx.createLinearGradient(x0, y0, x1, y1);
		for (const stop of g.stops) {
			grad.addColorStop(stop.offset, hex8ToRgba(stop.color, stop.color));
		}
		return grad;
	}

	// ----- radial-gradient -----
	if (/^radial-gradient/i.test(s)) {
		const g = parseRadialGradient(s);
		if (!g) return s;

		const cx = bounds.x + bounds.w * g.cx;
		const cy = bounds.y + bounds.h * g.cy;
		const r  = Math.hypot(bounds.w, bounds.h) * 0.5; // simple fit

		const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
		for (const stop of g.stops) {
			grad.addColorStop(stop.offset, hex8ToRgba(stop.color, stop.color));
		}
		return grad;
	}

	// ----- solid -----
	if (s.startsWith('#') || s.startsWith('0x')) return hex8ToRgba(s, s);
	// rgb(...) / rgba(...) / named → pass through (but normalize RGB→rgba)
	return hex8ToRgba(s, s);
}
export function localBitmapRectFromGraphic2D(o) {
	const g = o?.graphic2d;
	const p0 = g?._paths?.[0];
	if (!Array.isArray(p0) || p0.length < 2) return null;

	let minX = p0[0].x, maxX = p0[0].x, minY = p0[0].y, maxY = p0[0].y;
	for (let i = 1; i < p0.length; i++) {
		const p = p0[i];
		if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
	}
	const w = maxX - minX, h = maxY - minY;
	if (!(w > 0 && h > 0)) return null;
	return { x: minX, y: minY, w, h };
}
export function localAABB(obj) {
	const g = obj?.graphic2d;
	const paths = Array.isArray(g?._paths) ? g._paths : [];
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const path of paths) {
		if (!Array.isArray(path)) continue;
		for (const p of path) {
			const x = +p.x || 0, y = +p.y || 0;
			if (x < minX) minX = x; if (y < minY) minY = y;
			if (x > maxX) maxX = x; if (y > maxY) maxY = y;
		}
	}
	if (!isFinite(minX)) return null;
	return { minX, minY, maxX, maxY, width: (maxX - minX), height: (maxY - minY) };
}
export function localBoundsOfGraphic(obj) {
	const g = obj?.graphic2d;
	const paths = Array.isArray(g?._paths) ? g._paths : null;
	if (!paths || paths.length === 0) 
		return null;

	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const path of paths) {
		if (!Array.isArray(path)) 
			continue;
		for (const p of path) {
			const x = +p.x || 0;
			const y = +p.y || 0;
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}
	if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) 
		return null;

	return { minX, minY, maxX, maxY };
}
/**
 * Scale all local points by (sx, sy) anchored at (ax, ay).
 * For width-only changes, pass (sx=kx, sy=1) and anchor at minX.
 * For height-only changes, pass (sx=1, sy=ky) and anchor at minY.
 */
export function scaleGraphicPathsLocalFromEdge(obj, sx, sy, ax = 0, ay = 0) {
	const g = obj?.graphic2d;
	const paths = Array.isArray(g?._paths) ? g._paths : null;
	if (!paths || paths.length === 0) 
		return;

	const Sx = Number.isFinite(sx) ? +sx : 1;
	const Sy = Number.isFinite(sy) ? +sy : 1;
	const AX = +ax || 0;
	const AY = +ay || 0;

	for (const path of paths) {
		if (!Array.isArray(path)) 
			continue;
		for (const p of path) {
			const px = +p.x || 0;
			const py = +p.y || 0;
			p.x = AX + (px - AX) * Sx;
			p.y = AY + (py - AY) * Sy;
		}
	}
}
export function getGraphicPivotLocal(obj){
	// Prefer explicit pivots if your system exposes them
	const g = obj?.graphic2d;
	if (g && (Number.isFinite(g.pivotX) || Number.isFinite(g.pivotY))) {
		return { x: +g.pivotX || 0, y: +g.pivotY || 0 };
	}
	if (g?.pivot && (Number.isFinite(g.pivot.x) || Number.isFinite(g.pivot.y))) {
		return { x: +g.pivot.x || 0, y: +g.pivot.y || 0 };
	}
	if (obj?.pivot && (Number.isFinite(obj.pivot.x) || Number.isFinite(obj.pivot.y))) {
		return { x: +obj.pivot.x || 0, y: +obj.pivot.y || 0 };
	}

	// Fallback: center of local bounds
	const bb = localBoundsOfGraphic(obj);
	if (!bb) return { x: 0, y: 0 };
	return { x: (bb.minX + bb.maxX) * 0.5, y: (bb.minY + bb.maxY) * 0.5 };
}

/* ========================= DEFAULT BUNDLE ========================= */

const D2DUtil = {
	// matrices
	mul, applyMat, worldMatrix, invert, worldMatrixInverse,
	// px/world
	pxToWorld, eventToWorld,
	// geometry / paths
	isClosed, pointInPolygon, distSqToSeg, pointNearPolyline, localPoints, logicalPoints, logicalIndexMap,
	// traversal / bounds
	traverse2D, worldAABB, worldAABBDeep,
	// selection frames
	selectionAABB, selectionFrame, selectionOBB,
	// frames / rects
	toFrameLocal, rectFromPoints, rectIntersectsAABB,
	// angles / quats
	snapAngleSoft, quatFromZ,
	// hits
	hitObject, hitObjectDeep
};

export default D2DUtil;