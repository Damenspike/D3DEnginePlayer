// d2drenderer.js
import {
	approx,
	hexToRgba
} from './d3dutility.js';

export default class D2DRenderer {
	constructor({width, height, pixelRatio, root} = {}) {
		this.pixelRatio = pixelRatio ?? (window.devicePixelRatio || 1);
		this.width = width ?? 760;
		this.height = height ?? 480;
		this.root = root;
		
		this.domElement = document.createElement('canvas');
		this.domElement.style.display = 'block';
		this.domElement.style.width = '100%';
		this.domElement.style.height = '100%';
		this.ctx = this.domElement.getContext('2d');
		
		this.setSize(this.width, this.height);
	}
	
	refreshSize() {
		this.setSize(this.width, this.height);
	}
	setSize(width, height) {
		const projectWidth = _editor.project?.width || 760;
		const projectHeight = _editor.project?.height || 480;
		
		// Calculate scale to fit canvas within parent while preserving aspect ratio
		const scale = Math.min(width / Math.max(projectWidth, 1), height / Math.max(projectHeight, 1)) || 1;
		const displayWidth = Math.round(projectWidth * scale);
		const displayHeight = Math.round(projectHeight * scale);
	
		// Ensure canvas is positioned absolutely relative to the absolute parent
		this.domElement.style.position = 'absolute';
		this.domElement.style.width = `${displayWidth}px`;
		this.domElement.style.height = `${displayHeight}px`;
		this.domElement.style.left = `${(width - displayWidth) / 2}px`;
		this.domElement.style.top = `${(height - displayHeight) / 2}px`;
	
		// Set canvas backing store size (accounting for device pixel ratio)
		this.domElement.width = displayWidth * this.pixelRatio;
		this.domElement.height = displayHeight * this.pixelRatio;
		
		this.viewScale = scale;
		this.width = width;
		this.height = height;
	
		// Apply transform to context for proper scaling
		this.ctx.setTransform(
			this.pixelRatio * scale, 0,
			0, this.pixelRatio * scale,
			0, 0
		);
	}
	setPixelRatio(pixelRatio) {
		this.pixelRatio = Number(pixelRatio) || 1;
		this.setSize(this.width, this.height);
	}
	clear() {
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.clearRect(0, 0, this.domElement.width, this.domElement.height);
		
		this.ctx.setTransform(
			this.pixelRatio * this.viewScale, 0,
			0, this.pixelRatio * this.viewScale,
			0, 0
		);
	}
	render() {
		this.clear();
		
		const d3dobjects = 	this.gather(this.root)
							.sort((a, b) => a.position.z - b.position.z);
		
		for (const d3dobject of d3dobjects) 
			this.draw(d3dobject);
	}
	gather(root) {
		const objects = [];
		root.traverse(d3dobject => {
			if(!d3dobject.is2D)
				return;
			
			objects.push(d3dobject);
		});
		return objects;
	}
	draw(d3dobject) {
		const graphic2d = d3dobject.graphic2d;
		
		if(!graphic2d) 
			return;
			
		// TESTING ONLY
		graphic2d._graphics = [
			{
				_points: [
					{x: 0, y: -40},
					{x: 30, y: -80},
					{x: 70, y: -60},
					{x: 70, y: -10},
					{x: 0, y: 60}
				],
				line: true,
				lineWidth: 2,
				lineColor: '#0099ff',
				fill: true,
				fillColor: '#FF0000'
			}
		]
		
		graphic2d._graphics.forEach(graphic => {
			if(graphic._bitmap)
				return; // TODO: drawBitmap
			else
				this.drawVector(graphic, d3dobject);
		});
	}
	drawVector(graphic, d3dobject) {
		const ctx = this.ctx;
		const points = graphic._points || [];
		if (points.length < 1) 
			return;
	
		const lineEnabled = graphic.line !== false;
		const lineWidth = Number(graphic.lineWidth ?? 1);
		const lineColor = graphic.lineColor ?? '#ffffff';
		const fillEnabled = graphic.fill !== false;
		const fillColor = graphic.fillColor ?? '#ffffffff';
		const borderRadius = Math.max(0, Number(graphic.borderRadius ?? 0));
	
		let worldX = 0;
		let worldY = 0;
		let worldScaleX = 1;
		let worldScaleY = 1;
		let worldRotationZ = 0;
	
		let n = d3dobject;
		while (n) {
			worldX += Number(n.position.x) || 0;
			worldY += Number(n.position.y) || 0;
			worldScaleX *= (Number(n.scale?.x) || 1);
			worldScaleY *= (Number(n.scale?.y) || 1);
			worldRotationZ += (Number(n.rotation?.z) || 0);
			n = n.parent;
		}
	
		const firstPoint = points[0];
		const lastPoint = points[points.length - 1];
		const isClosed = points.length >= 3 && approx(firstPoint.x, lastPoint.x) && approx(firstPoint.y, lastPoint.y);
	
		const buildPath = () => {
			if (!isClosed || borderRadius <= 0 || points.length < 3) {
				ctx.beginPath();
				ctx.moveTo(points[0].x, points[0].y);
				for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
				if (isClosed) ctx.closePath();
				return;
			}
	
			const base = points.slice(0, -1);
			const count = base.length;
			const get = i => base[(i + count) % count];
	
			ctx.beginPath();
			for (let i = 0; i < count; i++) {
				const p0 = get(i - 1);
				const p1 = get(i);
				const p2 = get(i + 1);
	
				const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
				const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
	
				const len1 = Math.hypot(v1x, v1y) || 1;
				const len2 = Math.hypot(v2x, v2y) || 1;
	
				const r = Math.min(borderRadius, len1 / 2, len2 / 2);
	
				const inX = p1.x - (v1x / len1) * r;
				const inY = p1.y - (v1y / len1) * r;
				const outX = p1.x + (v2x / len2) * r;
				const outY = p1.y + (v2y / len2) * r;
	
				if (i === 0) ctx.moveTo(inX, inY);
				else ctx.lineTo(inX, inY);
	
				ctx.quadraticCurveTo(p1.x, p1.y, outX, outY);
			}
			ctx.closePath();
		};
	
		ctx.save();
		ctx.translate(worldX, worldY);
		if (worldRotationZ) ctx.rotate(worldRotationZ);
		if (worldScaleX !== 1 || worldScaleY !== 1) ctx.scale(worldScaleX, worldScaleY);
	
		buildPath();
	
		if (fillEnabled) {
			ctx.fillStyle = hexToRgba(fillColor);
			ctx.fill();
		}
		if (lineEnabled) {
			ctx.lineWidth = Math.max(0.001, lineWidth);
			ctx.strokeStyle = hexToRgba(lineColor);
			ctx.lineJoin = borderRadius > 0 ? 'round' : 'miter';
			ctx.lineCap = 'round';
			ctx.stroke();
		}
	
		ctx.restore();
	}
}