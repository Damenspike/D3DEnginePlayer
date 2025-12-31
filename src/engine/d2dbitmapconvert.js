// d2dbitmapconvert.js

import {
	objBoundsCanvas,
	canvasToLocal,
	childScreenMatrix
} from './d2dutility.js';

export async function convertToBitmap2D(d3dobjects, options = {}) {
	const objs = Array.isArray(d3dobjects) ? d3dobjects : [d3dobjects].filter(Boolean);
	const results = [];

	const zip = _root.zip;
	if (!zip)
		throw new Error('convertToBitmap2D: No project zip loaded');

	const renderer = _editor.renderer2d;
	if (!renderer)
		throw new Error('convertToBitmap2D: No 2D renderer available');

	for (const obj of objs) {
		if(!obj) 
			continue;
		
		if(!obj.is2D && !obj.graphic2d) 
			continue;

		const raster = await _rasteriseObjectToBitmap(obj, renderer);
		
		if(!raster) 
			continue;

		const { pngData, rectLocal } = raster;
		
		if(!rectLocal || rectLocal.w <= 0 || rectLocal.h <= 0) 
			continue;

		const newObj = await createImageFromData({
			baseName: obj.name || 'Object',
			bitmapName: `Bitmap ${obj.name}`,
			pngData,
			parent: obj.parent,
			rectLocal
		});
		
		if(!newObj) 
			continue;

		_copyTransform2D(obj, newObj);
		newObj.depth = obj.depth;
		newObj.invalidateGraphic2D();
		newObj.checkSymbols();
		
		results.push(newObj);
	}

	return results;
}

export async function exportAsPNG(d3dobjects, options = {}) {
	const objs = Array.isArray(d3dobjects) ? d3dobjects : [d3dobjects].filter(Boolean);
	const files = [];

	const renderer = _editor.renderer2d;
	if (!renderer)
		throw new Error('exportAsPNG: No 2D renderer available');

	let index = 1;
	for (const obj of objs) {
		if (!obj) continue;
		if (!obj.is2D && !obj.graphic2d) continue;

		const raster = await _rasteriseObjectToBitmap(obj, renderer);
		if (!raster) continue;

		const { pngData } = raster;

		const base = options.fileName || obj.name || 'graphic';
		const safeBase = String(base).replace(/[\\/:*?"<>|]+/g, '_');
		const fileName = (objs.length > 1)
			? `${safeBase}_${index++}.png`
			: `${safeBase}.png`;

		files.push({
			name: fileName,
			data: pngData
		});
	}

	if (!files.length) return;

	await D3D.exportMultipleFiles(files);
}

export async function createImageFromData({ baseName, bitmapName, pngData, parent, zip, rectLocal }) {
	const z = zip ?? _root.zip;
	if (!z)
		throw new Error('createImageFromData: No project zip loaded');
	if (!baseName || !pngData)
		return null;

	// ----- unique filename -----
	let bname = bitmapName || baseName;
	let i = 2;
	while (z.file(`assets/${bname}.png`)) {
		bname = `${baseName}_${i}`;
		i++;
	}
	const rel = `assets/${bname}.png`;

	// write file to project
	await _editor.writeFile({ path: rel, data: pngData });

	const uuid = _root.resolveAssetId(rel);
	const name = baseName;
	
	let rect;
	if (rectLocal && isFinite(rectLocal.w) && isFinite(rectLocal.h) && rectLocal.w > 0 && rectLocal.h > 0) {
		rect = rectLocal;
	} else {
		const size = await _pngSizeFromUint8(pngData);
		if (!size) 
			return null;
		
		rect = { x: 0, y: 0, w: size.w, h: size.h };
	}
	
	const rectGraphicProps = _buildGraphicForBitmapRectFromSize(rect);

	const bitmapProps = {
		source: uuid,
		fit: 'stretch',
		alignX: 'center',
		alignY: 'center',
		imageSmoothing: true
	};

	const parentObj = parent ?? _editor.focus ?? _root;
	const newObj = await parentObj.createObject({
		name,
		components: [
			{ type: 'Graphic2D', properties: rectGraphicProps },
			{ type: 'Bitmap2D',  properties: bitmapProps }
		]
	});
	
	// Clear out of image cache
	const cachedImage = _editor.renderer2d._imageCache?.get(rel);
	if(cachedImage)
		_editor.renderer2d._imageCache.delete(rel);

	return newObj;
}

export default {
	convertToBitmap2D,
	exportAsPNG,
	createImageFromData
};

async function _rasteriseObjectToBitmap(rootObj, renderer) {
	try {
		// 1) Neutral view for bounds (no editor pan/zoom)
		renderer.__viewScaleOverride  = 1;
		renderer.__viewOffsetOverride = { x: 0, y: 0 };

		const cb = objBoundsCanvas(renderer, rootObj);
		if (!cb) return null;

		const stroke = _maxStrokeRadiusCanvas(renderer, rootObj) || 0;

		let x0 = Math.floor(cb.l - stroke);
		let y0 = Math.floor(cb.t - stroke);
		let x1 = Math.ceil(cb.r + stroke);
		let y1 = Math.ceil(cb.b + stroke);

		const w = x1 - x0;
		const h = y1 - y0;
		if (w <= 0 || h <= 0) return null;

		// 2) Own temp canvas exactly the size of the bbox
		const canvas = document.createElement('canvas');
		canvas.width  = w;
		canvas.height = h;

		const ctx = canvas.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, w, h);

		// 3) Shift view so that (x0,y0) → (0,0)
		//    (everything is drawn into [0..w]x[0..h], no offscreen bits)
		renderer.enabled = false;
		renderer.__viewScaleOverride  = 1;
		renderer.__viewOffsetOverride = { x: -x0, y: -y0 };

		const oldCtx = renderer.ctx;
		renderer.ctx = ctx;
		renderer.renderParent(rootObj, ctx);
		renderer.ctx = oldCtx;

		// 4) Encode PNG directly from this canvas
		const pngData = await _canvasToPNGUint8(canvas);
		if (!pngData) return null;

		// 5) Map the bitmap corners back into local space
		//    (use the same transform we just used to render)
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		const cornersCanvas = [
			{ x: 0, y: 0 },
			{ x: w, y: 0 },
			{ x: w, y: h },
			{ x: 0, y: h }
		];

		for (const cp of cornersCanvas) {
			const lp = canvasToLocal(renderer, rootObj, cp);
			if (lp.x < minX) minX = lp.x;
			if (lp.y < minY) minY = lp.y;
			if (lp.x > maxX) maxX = lp.x;
			if (lp.y > maxY) maxY = lp.y;
		}

		if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY))
			return null;

		const rectLocal = {
			x: minX,
			y: minY,
			w: maxX - minX,
			h: maxY - minY
		};

		return { pngData, rectLocal };
	}
	finally {
		renderer.enabled = true;
		delete renderer.__viewScaleOverride;
		delete renderer.__viewOffsetOverride;
	}
}

function _maxStrokeRadiusCanvas(renderer, rootObj) {
	let maxR = 0;

	const visit = (obj) => {
		if (!obj) return;

		const g = obj.graphic2d;
		if (g) {
			const gLineEnabled = g.line !== false;
			const gLineWidth   = Number(g.lineWidth ?? 1);
			const outlineOn    = g.outline === true;
			const outlineWidth = Number(g.outlineWidth ?? gLineWidth);

			let rLocal = 0;

			if (gLineEnabled && gLineWidth > 0)
				rLocal = Math.max(rLocal, gLineWidth * 0.5);

			if (outlineOn && outlineWidth > 0)
				rLocal = Math.max(rLocal, outlineWidth); // outlineWidth*2 stroke → ~outlineWidth outside

			if (rLocal > 0) {
				const M = childScreenMatrix(renderer, obj);
				const p0 = new DOMPoint(0, 0).matrixTransform(M);
				const p1 = new DOMPoint(rLocal, 0).matrixTransform(M);
				const rPx = Math.hypot(p1.x - p0.x, p1.y - p0.y);
				if (rPx > maxR) maxR = rPx;
			}
		}

		const children = obj.children || [];
		for (const ch of children) {
			if (!ch) continue;
			if (!ch.graphic2d && !ch.is2D) continue;
			visit(ch);
		}
	};

	visit(rootObj);
	return maxR;
}

function _canvasToPNGUint8(canvas) {
	return new Promise((resolve) => {
		canvas.toBlob(async (blob) => {
			if (!blob) { resolve(null); return; }
			const buf = await blob.arrayBuffer();
			resolve(new Uint8Array(buf));
		}, 'image/png');
	});
}

function _buildGraphicForBitmapRect(srcObj, rect) {
	const src = srcObj.graphic2d || {};

	const x = rect.x;
	const y = rect.y;
	const w = rect.w;
	const h = rect.h;

	const paths = [[
		{ x: x,     y: y      },
		{ x: x + w, y: y      },
		{ x: x + w, y: y + h  },
		{ x: x,     y: y + h  },
		{ x: x,     y: y      }
	]];

	const dst = {
		...src,
		_paths: paths
	};

	dst.fill = false;
	dst.line = false;

	return dst;
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
function _buildGraphicForBitmapRectFromSize(rect) {
	const x = rect.x;
	const y = rect.y;
	const w = rect.w;
	const h = rect.h;

	const paths = [[
		{ x: x,     y: y      },
		{ x: x + w, y: y      },
		{ x: x + w, y: y + h  },
		{ x: x,     y: y + h  },
		{ x: x,     y: y      }
	]];

	const props = {
		_paths: paths,
		fill:  false,
		line:  false
	};

	return props;
}
async function _pngSizeFromUint8(uint8) {
	try {
		const blob = new Blob([uint8], { type: 'image/png' });
		const url  = URL.createObjectURL(blob);

		try {
			const img = new Image();
			await new Promise((resolve, reject) => {
				img.onload  = () => resolve();
				img.onerror = (e) => reject(e);
				img.src = url;
			});

			const w = img.naturalWidth  || img.width  || 0;
			const h = img.naturalHeight || img.height || 0;
			if (!w || !h) return null;

			return { w, h };
		}
		finally {
			URL.revokeObjectURL(url);
		}
	} catch {
		return null;
	}
}