// d2dbitmaptrace.js
//
// Bitmap2D -> Container + multiple Graphic2D children (Flash-style trace).
//
// Parameters:
//   - colorThreshold: 0..255  (colour difference tolerance)
//   - minArea:        pixels  (minimum region size to keep, in sampled space)
//
// Result example:
//   "Dog Traced" (container, sibling of original bitmap object)
//     -> "Dog Graphic 1" (nose region, correct fill colour)
//     -> "Dog Graphic 2" (eye region, correct fill colour, with holes)
//     -> ...

const MAX_TRACE_SIDE = 256; // clamp longest side for tracing
const ALPHA_MIN      = 16;  // treat pixels with alpha < this as transparent
const USE_CURVES     = true; // set false if you want pure polys

export const BITMAP_TRACE_DEFAULTS = Object.freeze({
	colorThreshold: 32, // 0..255
	minArea: 16,         // pixels (after internal downscale)
	simplifyPx: 1.5
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Trace a Bitmap2D on the given object into a new container with Graphic2D children.
 *
 * @param {D3DObject} d3dobject  Object with a Bitmap2D component.
 * @param {JSZip}     zip        JSZip instance for the current project.
 * @param {object}    [options]  { colorThreshold, minArea }
 * @returns {Promise<D3DObject|null>}  Container object ("Dog Traced") or null.
 */
export async function traceBitmap2DToGraphic2D(d3dobject, zip, options = {}) {
	const opts = { ...BITMAP_TRACE_DEFAULTS, ...options };
	
	const simplifyPx = opts.simplifyPx;
	
	if (!d3dobject)
		throw new Error('traceBitmap2DToGraphic2D: d3dobject is required');
	if (!zip)
		throw new Error('traceBitmap2DToGraphic2D: JSZip instance is required');

	// --- 0) Grab Bitmap2D and source UUID ---
	const bitmap = d3dobject.getComponent('Bitmap2D');
	if (!bitmap) {
		_editor.showError({
			name: 'Trace Bitmap',
			message: 'Object is not a Bitmap2D'
		});
		console.warn('[BitmapTrace] Object', d3dobject.name, 'has no Bitmap2D component:', d3dobject);
		return null;
	}

	const srcUUID = bitmap.source;
	if (!srcUUID) {
		console.warn('[BitmapTrace] Bitmap2D has no source set');
		return null;
	}

	if (!_root || typeof _root.resolvePath !== 'function') {
		console.warn('[BitmapTrace] _root.resolvePath is not available');
		return null;
	}

	const internalPath = _root.resolvePath(srcUUID);
	if (!internalPath) {
		console.warn('[BitmapTrace] Could not resolve bitmap path for uuid:', srcUUID);
		return null;
	}

	const zipKey = internalPath.replace(/^\/+/, '');
	const file = zip.file(zipKey);
	if (!file) {
		console.warn('[BitmapTrace] JSZip has no file for path:', zipKey);
		return null;
	}

	// --- 1) Load image from JSZip ---
	const img = await _loadImageFromZipFile(file);
	if (!img || !img.width || !img.height) {
		console.warn('[BitmapTrace] Failed to decode image');
		return null;
	}

	// --- 2) Rasterize to a clamped canvas for tracing (image-space only) ---
	const canvas = _rasterizeToClampedCanvas(img);
	const width  = canvas.width;
	const height = canvas.height;

	const ctx = canvas.getContext('2d');
	const imgData = ctx.getImageData(0, 0, width, height);
	const data = imgData.data;

	// --- 3) Segment into colour regions (flood fill in sample space) ---
	const { regions, labels } = _segmentByColor(data, width, height, opts.colorThreshold);

	if (!regions.length) {
		console.warn('[BitmapTrace] No regions found (image is empty or fully transparent?)');
		return null;
	}

	// --- 4) Compute the bitmap's local rect (where the image lives) ---
	const localRect = _getLocalBitmapRect(d3dobject);
	const boxX = localRect.x;
	const boxY = localRect.y;
	const boxW = localRect.w || 1;
	const boxH = localRect.h || 1;

	// --- 5) For each region >= minArea:
	//       - find *all* boundary loops (outer + holes)
	//       - simplify
	//       - map into local rect
	const regionShapes = [];

	for (let r = 0; r < regions.length; r++) {
		const region = regions[r];
		if (region.area < opts.minArea)
			continue;

		const loops = _traceRegionLoops(labels, width, height, region.id);
		if (!loops || !loops.length) continue;

		const pathsLocal = [];

		for (const loop of loops) {
			if (!loop || loop.length < 3) continue;

			let pts = loop;

			// Simplify in sample pixel space
			if (simplifyPx > 0 && pts.length > 3)
				pts = _simplifyRDP(pts, simplifyPx);

			if (!pts || pts.length < 3) continue;

			// Map to local rect
			let mapped = pts.map(p => ({
				x: boxX + (p.x / width)  * boxW,
				y: boxY + (p.y / height) * boxH
			}));

			// Close path explicitly
			const f = mapped[0];
			const l = mapped[mapped.length - 1];
			if (f.x !== l.x || f.y !== l.y)
				mapped.push({ x: f.x, y: f.y });

			// Optional curve smoothing using cx,cy on each vertex
			if (USE_CURVES && mapped.length >= 4)
				mapped = _addQuadraticControls(mapped);

			pathsLocal.push(mapped);
		}

		if (!pathsLocal.length) continue;

		const fillColor = _rgbToHex8(region.r, region.g, region.b); // '#rrggbbaa'
		regionShapes.push({ paths: pathsLocal, fillColor });
	}

	if (!regionShapes.length) {
		console.warn('[BitmapTrace] No usable regions (all under minArea or simplified away)');
		return null;
	}

	// --- 6) Build container as sibling of the original bitmap ---
	const baseName      = d3dobject.name || 'Bitmap';
	const containerName = baseName + ' Traced';

	// Use current editor focus as host (matches previous behaviour)
	const host = _editor.focus;

	if (!host || typeof host.createObject !== 'function') {
		console.warn('[BitmapTrace] No valid host with createObject() found');
		return null;
	}
	
	const container = await host.createObject({ name: containerName });
	if (!container) {
		console.warn('[BitmapTrace] Failed to create container object');
		return null;
	}
	
	container.addComponent('Container2D');

	// Match original transform so traced shapes line up in world space
	_copyTransform2D(d3dobject, container);

	// --- 7) Create one Graphic2D child per region, assign paths + fill colour ---
	let graphicIndex = 1;

	for (const shape of regionShapes) {
		const childName = `${baseName} Graphic ${graphicIndex++}`;

		const props = {
			_paths: [[]],
			fill: true,
			line: false,
			fillColor: '#000000ff',
			lineColor: '#ffffffff',
			lineWidth: 1,
			lineCap: 'round',
			lineJoin: 'round',
			miterLimit: 10
		};

		const childData = {
			name: childName,
			components: [
				{ type: 'Graphic2D', properties: props }
			]
		};

		const child = await container.createObject(childData);
		if (!child) continue;

		const g2d = child.graphic2d || (child.graphic2d = {});

		// Geometry: multiple closed paths (outer + holes).
		// Your renderer uses fill(combo, 'evenodd'), so this will naturally support holes.
		g2d._paths = shape.paths;

		// Style: region fill colour, no stroke
		g2d.fill       = true;
		g2d.fillColor  = shape.fillColor; // '#rrggbbaa'
		g2d.line       = false;
		g2d.lineWidth  = 0;
		g2d.outline    = false;

		child.invalidateGraphic2D?.();
		child.checkSymbols?.();
	}

	return container;
}

export default traceBitmap2DToGraphic2D;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function _loadImageFromZipFile(file) {
	const blob = await file.async('blob');
	// ImageBitmap is fast and works in Electron
	return await createImageBitmap(blob);
}

function _rasterizeToClampedCanvas(img) {
	const iw = img.width;
	const ih = img.height;

	const longest = Math.max(iw, ih);
	const scale = longest > MAX_TRACE_SIDE ? (MAX_TRACE_SIDE / longest) : 1;

	const w = Math.max(1, (iw * scale) | 0);
	const h = Math.max(1, (ih * scale) | 0);

	const canvas = document.createElement('canvas');
	canvas.width  = w;
	canvas.height = h;

	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = true;
	ctx.clearRect(0, 0, w, h);
	ctx.drawImage(img, 0, 0, w, h);

	return canvas;
}

/**
 * Find the local rect used by drawBitmap: bounds of graphic2d._paths[0].
 */
function _getLocalBitmapRect(d3dobject) {
	const g2d = d3dobject.graphic2d;
	const pts = Array.isArray(g2d?._paths) && g2d._paths[0] ? g2d._paths[0] : null;

	if (!pts || !pts.length) {
		// Fallback: unit rect
		return { x: 0, y: 0, w: 1, h: 1 };
	}

	let minX = pts[0].x, maxX = pts[0].x;
	let minY = pts[0].y, maxY = pts[0].y;

	for (let i = 1; i < pts.length; i++) {
		const p = pts[i];
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}

	return {
		x: minX,
		y: minY,
		w: Math.max(0.0001, maxX - minX),
		h: Math.max(0.0001, maxY - minY)
	};
}

// ---------------------------------------------------------------------------
// Region segmentation (colour-based flood fill, ignoring transparent)
// ---------------------------------------------------------------------------

function _segmentByColor(data, width, height, colorThreshold) {
	const t = Math.max(0, Math.min(255, colorThreshold | 0));

	const total = width * height;
	const labels = new Int32Array(total);
	for (let i = 0; i < total; i++)
		labels[i] = -1;

	const regions = [];

	const idx = (x, y) => y * width + x;

	const inBounds = (x, y) => (x >= 0 && x < width && y >= 0 && y < height);

	const getRGBA = (i) => {
		const p = i * 4;
		return [
			data[p    ],
			data[p + 1],
			data[p + 2],
			data[p + 3]
		];
	};

	const colorDiffOk = (r0, g0, b0, r1, g1, b1) => {
		const dr = Math.abs(r0 - r1);
		const dg = Math.abs(g0 - g1);
		const db = Math.abs(b0 - b1);
		return Math.max(dr, dg, db) <= t;
	};

	const dir4x = [ 1, -1,  0,  0 ];
	const dir4y = [ 0,  0,  1, -1 ];

	let regionId = 0;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const startIdx = idx(x, y);
			if (labels[startIdx] !== -1)
				continue;

			const [r0, g0, b0, a0] = getRGBA(startIdx);
			if (a0 < ALPHA_MIN) {
				labels[startIdx] = -2; // transparent sentinel
				continue;
			}

			const queue = [startIdx];
			labels[startIdx] = regionId;

			let area = 0;
			let sumR = 0;
			let sumG = 0;
			let sumB = 0;

			while (queue.length) {
				const pi = queue.pop();
				const px = pi % width;
				const py = (pi / width) | 0;

				const [r, g, b, a] = getRGBA(pi);
				if (a < ALPHA_MIN) continue; // should not happen if flood-fill is correct

				area++;
				sumR += r;
				sumG += g;
				sumB += b;

				for (let d = 0; d < 4; d++) {
					const nx = px + dir4x[d];
					const ny = py + dir4y[d];
					if (!inBounds(nx, ny)) continue;

					const ni = idx(nx, ny);
					if (labels[ni] !== -1) continue;

					const [nr, ng, nb, na] = getRGBA(ni);
					if (na < ALPHA_MIN) {
						labels[ni] = -2; // transparent
						continue;
					}

					if (!colorDiffOk(r0, g0, b0, nr, ng, nb)) continue;

					labels[ni] = regionId;
					queue.push(ni);
				}
			}

			if (area > 0) {
				regions.push({
					id: regionId,
					area,
					r: (sumR / area) | 0,
					g: (sumG / area) | 0,
					b: (sumB / area) | 0
				});
				regionId++;
			}
		}
	}

	return { regions, labels };
}

// ---------------------------------------------------------------------------
// Boundary tracing for a single region -> *all* loops (outer + holes)
// ---------------------------------------------------------------------------

function _traceRegionLoops(labels, width, height, regionId) {
	// ----- helpers -----
	const idx = (x, y) => y * width + x;

	const inRegion = (x, y) =>
		(x >= 0 && x < width && y >= 0 && y < height && labels[idx(x, y)] === regionId);

	// We'll build boundary segments on the integer grid (0..width, 0..height).
	// Each segment is between two vertices {x,y}.
	const edges = [];
	const adjacency = new Map(); // key "x,y" -> [edgeIndex, ...]

	const makeKey = (p) => `${p.x},${p.y}`;

	function addEdge(a, b) {
		const edge = { a, b };
		const ei = edges.length;
		edges.push(edge);

		const ka = makeKey(a);
		const kb = makeKey(b);

		let la = adjacency.get(ka);
		if (!la) { la = []; adjacency.set(ka, la); }
		la.push(ei);

		let lb = adjacency.get(kb);
		if (!lb) { lb = []; adjacency.set(kb, lb); }
		lb.push(ei);
	}

	// ----- 1) Collect all boundary edges for this region -----
	// For each "inside" pixel (x,y), we look at its 4 neighbors.
	// Where neighbor is "outside", we add an edge along that side.
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (!inRegion(x, y)) continue;

			// LEFT edge between (x,y) and (x,y+1)
			if (!inRegion(x - 1, y)) {
				addEdge(
					{ x: x,     y: y     },
					{ x: x,     y: y + 1 }
				);
			}

			// RIGHT edge between (x+1,y) and (x+1,y+1)
			if (!inRegion(x + 1, y)) {
				addEdge(
					{ x: x + 1, y: y     },
					{ x: x + 1, y: y + 1 }
				);
			}

			// TOP edge between (x,y) and (x+1,y)
			if (!inRegion(x, y - 1)) {
				addEdge(
					{ x: x,     y: y     },
					{ x: x + 1, y: y     }
				);
			}

			// BOTTOM edge between (x,y+1) and (x+1,y+1)
			if (!inRegion(x, y + 1)) {
				addEdge(
					{ x: x,     y: y + 1 },
					{ x: x + 1, y: y + 1 }
				);
			}
		}
	}

	if (!edges.length) return [];

	// ----- 2) Stitch edges into closed loops -----
	const used = new Array(edges.length).fill(false);
	const loops = [];

	for (let startEi = 0; startEi < edges.length; startEi++) {
		if (used[startEi]) continue;

		const startEdge = edges[startEi];
		used[startEi] = true;

		const loop = [];
		loop.push({ x: startEdge.a.x, y: startEdge.a.y });
		loop.push({ x: startEdge.b.x, y: startEdge.b.y });

		let current = { x: startEdge.b.x, y: startEdge.b.y };
		const startKey = makeKey(startEdge.a);

		let safety = 0;
		const maxSteps = edges.length * 4; // hard cap to avoid infinite loops

		while (makeKey(current) !== startKey && safety++ < maxSteps) {
			const key = makeKey(current);
			const list = adjacency.get(key);
			if (!list || !list.length) break;

			// Find next unused edge incident to "current"
			let nextEi = -1;
			for (let i = 0; i < list.length; i++) {
				const ei = list[i];
				if (used[ei]) continue;
				nextEi = ei;
				break;
			}

			if (nextEi === -1) break; // open chain (shouldn't happen often)

			used[nextEi] = true;
			const e = edges[nextEi];

			// Pick orientation so we continue from "current"
			if (e.a.x === current.x && e.a.y === current.y) {
				// current -> e.b
				loop.push({ x: e.b.x, y: e.b.y });
				current = { x: e.b.x, y: e.b.y };
			} else if (e.b.x === current.x && e.b.y === current.y) {
				// current -> e.a
				loop.push({ x: e.a.x, y: e.a.y });
				current = { x: e.a.x, y: e.a.y };
			} else {
				// Edge doesn't actually touch? Just skip it.
				continue;
			}
		}

		if (loop.length >= 3) {
			// Ensure closed
			const f = loop[0];
			const l = loop[loop.length - 1];
			if (f.x !== l.x || f.y !== l.y)
				loop.push({ x: f.x, y: f.y });

			loops.push(loop);
		}
	}

	return loops;
}

// ---------------------------------------------------------------------------
// Ramer–Douglas–Peucker simplification
// ---------------------------------------------------------------------------

function _simplifyRDP(points, tolerance) {
	if (!points || points.length <= 2)
		return points ? points.slice() : [];

	const sqTol = tolerance * tolerance;

	const sqDist = (a, b) => {
		const dx = a.x - b.x;
		const dy = a.y - b.y;
		return dx * dx + dy * dy;
	};

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
		let idx = -1;

		const a = pts[first];
		const b = pts[last];

		for (let i = first + 1; i < last; i++) {
			const sq = sqSegDist(pts[i], a, b);
			if (sq > maxSq) {
				maxSq = sq;
				idx = i;
			}
		}

		if (maxSq > sqTol && idx !== -1) {
			if (idx - first > 1)
				simplifySection(pts, first, idx, out);
			out.push(pts[idx]);
			if (last - idx > 1)
				simplifySection(pts, idx, last, out);
		}
	};

	const out = [points[0]];
	simplifySection(points, 0, points.length - 1, out);
	out.push(points[points.length - 1]);
	return out;
}

// ---------------------------------------------------------------------------
// Curve smoothing (quadratic) using cx,cy
// ---------------------------------------------------------------------------

function _addQuadraticControls(points) {
	const n = points.length;
	if (n < 4) return points;

	// Closed polygon assumed (last == first)
	const out = points.map(p => ({ x: p.x, y: p.y }));

	for (let i = 1; i < n - 1; i++) {
		const prev = out[i - 1];
		const curr = out[i];
		const next = out[i + 1];

		// Simple Catmull-Rom-ish control: pull a bit towards the average direction
		const dx = next.x - prev.x;
		const dy = next.y - prev.y;

		const t = 0.25; // tension – tweak if you like it curvier/flatter
		curr.cx = curr.x - dx * t;
		curr.cy = curr.y - dy * t;
	}

	// Leave first/last without cx/cy; close segment will be straight.
	return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _rgbToHex8(r, g, b, a = 255) {
	const rr = (r & 0xff).toString(16).padStart(2, '0');
	const gg = (g & 0xff).toString(16).padStart(2, '0');
	const bb = (b & 0xff).toString(16).padStart(2, '0');
	const aa = (a & 0xff).toString(16).padStart(2, '0');
	return `#${rr}${gg}${bb}${aa}`;
}

function _copyTransform2D(src, dst) {
	if (!src || !dst) return;

	if (src.position && dst.position) {
		dst.position.x = src.position.x;
		dst.position.y = src.position.y;
		dst.position.z = src.position.z;
	}
	if (src.rotation && dst.rotation) {
		dst.rotation.x = src.rotation.x;
		dst.rotation.y = src.rotation.y;
		dst.rotation.z = src.rotation.z;
	}
	if (src.scale && dst.scale) {
		dst.scale.x = src.scale.x;
		dst.scale.y = src.scale.y;
		dst.scale.z = src.scale.z;
	}
}