import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

export default class D3DTransformGizmo {
	get busy() {
		return this._dragging;
	}
	get object() {
		return this.d3dobject?.object3d;
	}
	
	constructor(params) {
		this.scene = params.scene;
		this.camera = params.camera;
		this.dom = params.dom;
		this.getSelected = params.getSelected || (() => null); // () => object3d
	
		this.d3dobject = null;
		this.mode = 'translate';				// 'translate' | 'rotate' | 'scale'
		this.space = 'local';					// 'local' | 'world'
		this.snap = { translate: 0, rotate: 0, scale: 0 }; // 0 = off
		this.mouseOver = false;
	
		// --- gizmo scene (overlay) ---
		this._gizmoScene = new THREE.Scene();
	
		this._group = new THREE.Group();
		this._group.renderOrder = 99999;		// draw last
		this._group.visible = false;
		this._gizmoScene.add(this._group);		// add to overlay scene (NOT main scene)
	
		this._raycaster = new THREE.Raycaster();
		this._hover = null;						// hovered handle id
		this._active = null;					// active handle id while dragging
		this._dragging = false;
		this._dragData = null;
	
		this._scaleWithDistance = true;			// keep gizmo readable
		this._baseSize = 1;
		this.uniformScaleSensitivity = 0.01;
		this.rotatePixelSensitivity = 0.012;
		this.rotateInvert = false;
	
		this._tmpV = new THREE.Vector3();
		this._tmpV2 = new THREE.Vector3();
		this._tmpQ = new THREE.Quaternion();
		this._tmpM = new THREE.Matrix4();
	
		// put gizmo on its own layer (optional but nice)
		this._group.layers.set(2);
		this.camera.layers.enable(2);
	
		this._buildHandles();
		
		this._group.traverse(o => {
			if (!o.isMesh) return;
		
			// If a mesh opts into depth (occluder/rings), DON'T override its material.
			if (o.userData?.useDepth) {
				o.renderOrder = o.renderOrder ?? 99999;
				o.frustumCulled = false;
				return;
			}
		
			// clone and set overlay defaults
			if (o.material) {
				o.material = Array.isArray(o.material)
					? o.material.map(m => m && m.clone())
					: o.material.clone();
				if (o.material && o.material.color) {
					o.userData.baseColor = o.material.color.clone();
				}
				o.material.depthTest = false;
				o.material.depthWrite = false;
				o.material.transparent = true;
				o.material.fog = false;
				o.material.toneMapped = false;
			}
			o.renderOrder = 99999;
			o.frustumCulled = false;
		});
	
		const setMat = (m) => {
			if (!m) return;
			m.depthTest = false;
			m.depthWrite = false;
			m.transparent = true;
			m.fog = false;
			m.toneMapped = false;
		};
		this._group.traverse((o) => {
			o.renderOrder = 99999;
			o.frustumCulled = false;
			if (o.material) {
				if (Array.isArray(o.material)) o.material.forEach(setMat);
				else setMat(o.material);
			}
		});
		
		if (_editor.composer) {
			const gizmoPass = new RenderPass(this._gizmoScene, this.camera);
			gizmoPass.clear = false;			// don't clear color/depth; draw over previous passes
			_editor.composer.addPass(gizmoPass);	// add LAST
		} else {
			console.warn('[D3DTransformGizmo] composer not provided; gizmo will share main scene render path. Consider rendering overlay manually:\nrenderer.clearDepth(); renderer.render(gizmoScene, camera);');
		}
	}

	// Public API ------------------------------------------------------

	attach(d3dobject) {
		this.d3dobject = d3dobject || null;
		this._group.visible = !!d3dobject;
		if (d3dobject) this._syncPose();
	}

	detach() {
		this.d3dobject = null;
		this._group.visible = false;
		this._endDrag();
	}

	setMode(mode) {
		if(mode != 'translate' && mode != 'rotate' && mode != 'scale')
			return;
		
		if (mode !== this.mode) {
			this.mode = mode;
			this._refreshVisibility();
		}
	}

	setSpace(space) {
		this.space = (space === 'world') ? 'world' : 'local';
	}

	setSnap({ translate, rotate, scale }) {
		if (translate != null) this.snap.translate = Math.max(0, translate);
		if (rotate != null) this.snap.rotate = Math.max(0, rotate);
		if (scale != null) this.snap.scale = Math.max(0, scale);
	}

	update() {
		const sel = this.getSelected();
		if (sel !== this.d3dobject) {
			if(!sel) {
				this.detach();
			}else{
				this.attach(sel);
			}
		}
		
		if (!this.object) return;

		this._syncPose();
		this._scaleToCamera();
		
		if (this.mode == 'rotate') {
			this._updateRotateArcs();
			this._updateViewRing();
		}

		if (!this._dragging) {
			this._updateHover();
			if (this._shouldBeginDrag()) this._beginDrag();
		} else {
			if (this._shouldEndDrag()) this._endDrag();
			else this._updateDrag();
		}
	}

	dispose() {
		this.scene.remove(this._group);
		this._group.traverse(o => {
			if (o.geometry) o.geometry.dispose?.();
			if (o.material) o.material.dispose?.();
		});
	}

	// Private: gizmo construction ------------------------------------
	_buildHandles() {
		this._handles = {};
		const g = this._group;
	
		this._mat = {
			X: new THREE.MeshBasicMaterial({ color: 0xff5555 }),
			Y: new THREE.MeshBasicMaterial({ color: 0x55ff55 }),
			Z: new THREE.MeshBasicMaterial({ color: 0x5599ff }),
			P: new THREE.MeshBasicMaterial({ color: 0xffff55, opacity: 0.15, transparent: true })
		};
	
		this._grpT = new THREE.Group(); this._grpT.name = 'translate';
		this._grpR = new THREE.Group(); this._grpR.name = 'rotate';
		this._grpS = new THREE.Group(); this._grpS.name = 'scale';
	
		this._buildTranslateHandles(this._grpT);
		this._buildRotateHandles(this._grpR);
		this._buildScaleHandles(this._grpS);
	
		g.add(this._grpT, this._grpR, this._grpS);
		[...this._grpT.children, ...this._grpR.children, ...this._grpS.children].forEach(h => this._registerHandle(h));
	
		this._refreshVisibility();
	}
	
	_buildTranslateHandles(group) {
		const shaftLen = 1.0, shaftRad = 0.02, headLen = 0.2, headRad = 0.12;
		const cyl = new THREE.CylinderGeometry(shaftRad, shaftRad, shaftLen, 16);
		const cone = new THREE.ConeGeometry(headRad, headLen, 24);
		const quad = new THREE.PlaneGeometry(0.4, 0.4);
	
		const cloneMat = (m) => (m ? m.clone() : m);
	
		const buildAxisArrow = (axis, baseMat, name) => {
			const grp = new THREE.Group(); grp.name = name;
	
			const shaft = new THREE.Mesh(cyl, cloneMat(baseMat));
			const head = new THREE.Mesh(cone, cloneMat(baseMat));
			const pick = new THREE.Mesh(
				new THREE.CylinderGeometry(0.15, 0.15, shaftLen + headLen, 8),
				new THREE.MeshBasicMaterial({ visible: false })
			);
			pick.userData.handle = name;
	
			if (axis === 'x') {
				shaft.rotation.z = -Math.PI / 2; head.rotation.z = -Math.PI / 2; pick.rotation.z = -Math.PI / 2;
				shaft.position.x = shaftLen * 0.5; head.position.x = shaftLen + headLen * 0.5; pick.position.x = (shaftLen + headLen) * 0.5;
			} else if (axis === 'y') {
				shaft.position.y = shaftLen * 0.5; head.position.y = shaftLen + headLen * 0.5; pick.position.y = (shaftLen + headLen) * 0.5;
			} else {
				shaft.rotation.x = Math.PI / 2; head.rotation.x = Math.PI / 2; pick.rotation.x = Math.PI / 2;
				shaft.position.z = shaftLen * 0.5; head.position.z = shaftLen + headLen * 0.5; pick.position.z = (shaftLen + headLen) * 0.5;
			}
	
			[shaft, head].forEach(m => {
				m.material.depthTest = false; m.material.depthWrite = false; m.material.transparent = true;
				m.material.fog = false; m.material.toneMapped = false;
			});
	
			grp.add(shaft, head, pick);
			return grp;
		};
	
		const tx = buildAxisArrow('x', this._mat.X, 'tX');
		const ty = buildAxisArrow('y', this._mat.Y, 'tY');
		const tz = buildAxisArrow('z', this._mat.Z, 'tZ');
	
		const txy = new THREE.Mesh(quad, this._mat.P.clone()); txy.name = 'tXY'; txy.position.set(0.25, 0.25, 0.0);
		const txz = new THREE.Mesh(quad, this._mat.P.clone()); txz.name = 'tXZ'; txz.rotation.x = -Math.PI / 2; txz.position.set(0.25, 0.0, 0.25);
		const tyz = new THREE.Mesh(quad, this._mat.P.clone()); tyz.name = 'tYZ'; tyz.rotation.y =  Math.PI / 2; tyz.position.set(0.0, 0.25, 0.25);
	
		group.add(tx, ty, tz, txy, txz, tyz);
	}
	
	_buildRotateHandles(group) {
		const RX = 0.88, RY = 0.90, RZ = 0.92; // axis ring radii
		const VIEW_R = 1.06;                    // master (view) ring radius
		const SEG = 128;
	
		// -------- Gray shell (Unity vibe) --------
		// Soft, semi-transparent, no depth write so it never “hides” the arcs.
		this._rotShell = new THREE.Mesh(
			new THREE.SphereGeometry(Math.max(RX, RY, RZ) * 0.98, 48, 36),
			new THREE.MeshBasicMaterial({
				color: 0x909090,
				opacity: 0.12,
				transparent: true,
				depthTest: false,
				depthWrite: false,
				toneMapped: false,
				fog: false
			})
		);
		this._rotShell.name = 'rShell';
		this._rotShell.renderOrder = 1;
		group.add(this._rotShell);
	
		// -------- Line2 material factory --------
		const mkMat = (hex, alpha = 1) => new LineMaterial({
			color: hex,
			linewidth: 3.0,
			worldUnits: false,
			transparent: alpha < 1,
			opacity: alpha,
			depthTest: false,   // overlay look for the colored rings (we already compute front-half)
			depthWrite: false,
			toneMapped: false,
			fog: false
		});
	
		// -------- Unit circle geometry (XY plane) --------
		const unitCircleGeom = (() => {
			const pts = [];
			for (let i = 0; i <= SEG; i++) {
				const a = (i / SEG) * Math.PI * 2;
				pts.push(Math.cos(a), Math.sin(a), 0);
			}
			const g = new LineGeometry();
			g.setPositions(pts);
			return g;
		})();
	
		// Helper: make a ring group with unit circle line + pick torus; scale gives radius
		const makeAxisRing = (name, radius, color, plane) => {
			const g = new THREE.Group(); g.name = name; g.scale.setScalar(radius);
	
			// visible line (will be rewritten to half circle in _updateRotateArcs)
			const line = new Line2(unitCircleGeom.clone(), mkMat(color));
			line.userData.handle = name;
			line.computeLineDistances();
			// orient XY → plane
			if (plane === 'YZ')      line.rotation.y =  Math.PI / 2;
			else if (plane === 'XZ') line.rotation.x = -Math.PI / 2;
			g.add(line);
	
			// invisible pick torus (always full, easy picking)
			const pick = new THREE.Mesh(
				new THREE.TorusGeometry(1, 0.10, 8, 48),
				new THREE.MeshBasicMaterial({ visible: false })
			);
			pick.userData.handle = name;
			if (plane === 'YZ')      pick.rotation.y =  Math.PI / 2;
			else if (plane === 'XZ') pick.rotation.x = -Math.PI / 2;
			g.add(pick);
	
			return g;
		};
	
		// X (red), Y (green), Z (blue)
		const rX = makeAxisRing('rX', RX, 0xff5555, 'YZ');
		const rY = makeAxisRing('rY', RY, 0x55ff55, 'XZ');
		const rZ = makeAxisRing('rZ', RZ, 0x5599ff, 'XY');
		group.add(rX, rY, rZ);
		this._rotGroups = [rX, rY, rZ];
	
		// -------- View-aligned master ring (white) --------
		this._viewRing = new THREE.Group(); this._viewRing.name = 'rV';
		this._viewRing.scale.setScalar(VIEW_R);
	
		const vLine = new Line2(unitCircleGeom.clone(), mkMat(0xffffff, 0.5));
		vLine.userData.handle = 'rV';
		vLine.computeLineDistances();
		this._viewRing.add(vLine);
		
		this._viewRingLine = vLine;
	
		const vPick = new THREE.Mesh(
			new THREE.TorusGeometry(1, 0.10, 8, 48),
			new THREE.MeshBasicMaterial({ visible: false })
		);
		vPick.userData.handle = 'rV';
		this._viewRing.add(vPick);
	
		group.add(this._viewRing);
	
		// cache materials for resolution updates
		this._rotLineMats = [
			...this._rotGroups.map(grp => grp.children.find(o => o && o.isLine2)?.material),
			vLine.material
		].filter(Boolean);
	}
	
	_buildScaleHandles(group) {
		const box = new THREE.BoxGeometry(0.14, 0.14, 0.14);
		const shaftGeom = new THREE.CylinderGeometry(0.02, 0.02, 1.0, 12);
		const pickCapsule = (len = 1.2, r = 0.18) => new THREE.CylinderGeometry(r, r, len, 8);
		const mkMat = (m) => {
			const x = m.clone();
			x.depthTest = false; x.depthWrite = false; x.transparent = true;
			x.fog = false; x.toneMapped = false;
			return x;
		};
	
		const makeAxis = (name, axis, mat) => {
			const g = new THREE.Group(); g.name = name;
	
			const shaft = new THREE.Mesh(shaftGeom, mkMat(mat));
			if (axis === 'x') { shaft.rotation.z = -Math.PI / 2; shaft.position.x = 0.5; }
			else if (axis === 'y') { shaft.position.y = 0.5; }
			else { shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.5; }
	
			const end = new THREE.Mesh(box, mkMat(mat));
			if (axis === 'x') end.position.x = 1.0;
			if (axis === 'y') end.position.y = 1.0;
			if (axis === 'z') end.position.z = 1.0;
	
			const pick = new THREE.Mesh(pickCapsule(1.2, 0.18), new THREE.MeshBasicMaterial({ visible: false }));
			if (axis === 'x') { pick.rotation.z = -Math.PI / 2; pick.position.x = 0.6; }
			if (axis === 'y') { pick.position.y = 0.6; }
			if (axis === 'z') { pick.rotation.x =  Math.PI / 2; pick.position.z = 0.6; }
			pick.userData.handle = name;
			pick.userData.pickPriority = 1;
	
			g.add(shaft, end, pick);
			return g;
		};
	
		const sx = makeAxis('sX', 'x', this._mat.X);
		const sy = makeAxis('sY', 'y', this._mat.Y);
		const sz = makeAxis('sZ', 'z', this._mat.Z);
	
		const su = new THREE.Mesh(
			new THREE.IcosahedronGeometry(0.12, 1),
			new THREE.MeshBasicMaterial({ color: 0xffffff })
		);
		su.name = 'sU';
		su.material.depthTest = false;
		su.material.depthWrite = false;
		su.material.transparent = true;
		su.material.fog = false;
		su.material.toneMapped = false;
	
		const suPick = new THREE.Mesh(
			new THREE.SphereGeometry(0.6, 16, 12),
			new THREE.MeshBasicMaterial({ visible: false })
		);
		suPick.userData.handle = 'sU';
		suPick.userData.pickPriority = 10;
	
		group.add(sx, sy, sz, su, suPick);
	}
	
	_setHandleHot(handle, hot) {
		const apply = (m) => {
			if (!m || !m.color) return;
			if (hot) {
				m._oldColor = m._oldColor || m.color.clone();
				m.color.set(0xffffff);
			} else if (m._oldColor) {
				m.color.copy(m._oldColor);
				m._oldColor = null;
			}
		};
	
		handle.traverse(o => {
			if (o.material) {
				if (Array.isArray(o.material)) o.material.forEach(apply);
				else apply(o.material);
			}
		});
	}

	_registerHandle(obj) {
		this._handles[obj.name] = obj;
		obj.userData.handle = obj.name;
		obj.userData.isGizmo = true; 
		obj.traverse(o => { 
			o.userData.handle = obj.name; 
			o.userData.isGizmo = true;
		});
		obj.raycast = THREE.Mesh.prototype.raycast;
	}

	_refreshVisibility() {
		this._grpT.visible = (this.mode === 'translate');
		this._grpR.visible = (this.mode === 'rotate');
		this._grpS.visible = (this.mode === 'scale');
	}

	// Pose & sizing ---------------------------------------------------

	_syncPose() {
		if (!this.object) return;
		this.object.getWorldPosition(this._group.position);
		if (this.space === 'local') {
			this.object.getWorldQuaternion(this._group.quaternion);
		} else {
			this._group.quaternion.identity();
		}
	}

	_scaleToCamera() {
		if (!this._scaleWithDistance) return;
		const cam = this.camera;
		this._tmpV.copy(this._group.position).project(cam);
		const dist = this.camera.getWorldPosition(this._tmpV2).distanceTo(this._group.position);
		const scale = Math.max(0.001, dist * 0.15);
		this._group.scale.setScalar(scale);
	}
	
	_updateRotateArcs() {
		if (!this.object || !this._rotGroups) return;
	
		// keep Line2 thickness correct
		if (this._rotLineMats) {
			const v = new THREE.Vector2();
			if (_editor?.renderer?.getDrawingBufferSize) _editor.renderer3d.getDrawingBufferSize(v);
			else _editor.renderer3d.getSize(v);
			for (const m of this._rotLineMats) m.resolution.set(v.x, v.y);
		}
	
		const camPosW = this.camera.getWorldPosition(new THREE.Vector3());
	
		const SEG = 128;
		const FULL_STEPS = SEG;
		const HALF_STEPS = SEG >> 1;
	
		// Face-on threshold: if |z| of the view ray (in line-local) is high, it's a circle on screen
		const FACE_ON_Z = 0.95; // 0.90..0.98; higher = stricter (needs to be more face-on)
	
		for (const g of this._rotGroups) {
			const line = g.children.find(o => o && o.isLine2);
			if (!line) continue;
	
			// --- view ray from camera to this ring, in the LINE'S LOCAL frame ---
			const ringPosW = line.getWorldPosition(new THREE.Vector3());
			const toRingW  = ringPosW.clone().sub(camPosW).normalize();
			const invQ     = line.getWorldQuaternion(new THREE.Quaternion()).invert();
			const toRingL  = toRingW.clone().applyQuaternion(invQ); // normalized
	
			if (Math.abs(toRingL.z) >= FACE_ON_Z) {
				// ---- FACE-ON → FULL CIRCLE ----
				const pts = [];
				for (let i = 0; i <= FULL_STEPS; i++) {
					const th = (i / FULL_STEPS) * Math.PI * 2;
					pts.push(Math.cos(th), Math.sin(th), 0);
				}
				line.geometry.setPositions(pts);
				line.computeLineDistances();
				line.visible = true;
				continue;
			}
	
			// ---- NOT FACE-ON → FRONT HALF ONLY ----
			// Use camera position in line-local to orient the half
			const camL = line.worldToLocal(camPosW.clone());
			let vx = camL.x, vy = camL.y;
			const len2 = vx*vx + vy*vy;
	
			if (len2 < 1e-10) {
				// degenerate: fall back to full circle
				const pts = [];
				for (let i = 0; i <= FULL_STEPS; i++) {
					const th = (i / FULL_STEPS) * Math.PI * 2;
					pts.push(Math.cos(th), Math.sin(th), 0);
				}
				line.geometry.setPositions(pts);
				line.computeLineDistances();
				line.visible = true;
				continue;
			}
	
			const invLen = 1 / Math.sqrt(len2);
			vx *= invLen; vy *= invLen;
	
			// center angle (in line-local XY). Add +Math.PI if you prefer the opposite hemisphere.
			const phi = Math.atan2(vy, vx);
			const a0  = phi - Math.PI * 0.5;
			const a1  = phi + Math.PI * 0.5;
	
			const pts = [];
			for (let s = 0; s <= HALF_STEPS; s++) {
				const t  = s / HALF_STEPS;
				const th = a0 + (a1 - a0) * t;
				pts.push(Math.cos(th), Math.sin(th), 0);
			}
			line.geometry.setPositions(pts);
			line.computeLineDistances();
			line.visible = true;
		}
	}
	_updateViewRing() {
		if (!this._viewRing) return;
	
		// Orient ring so its normal = camera forward in GIZMO-LOCAL space
		const camQ = this.camera.getWorldQuaternion(new THREE.Quaternion());
		const camFwdW = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ);
	
		// Convert that direction to gizmo-local
		const centerW = this._group.getWorldPosition(new THREE.Vector3());
		const tipW = centerW.clone().add(camFwdW);
		const tipL = this._group.worldToLocal(tipW.clone());
		const centerL = this._group.worldToLocal(centerW.clone());
		const fwdL = tipL.sub(centerL).normalize();
	
		// Build quaternion that rotates +Z to fwdL
		const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), fwdL);
		this._viewRing.quaternion.copy(q);
	}
	_ensureLineResolution() {
		// Use renderer drawing-buffer size (accounts for devicePixelRatio)
		let w = 0, h = 0;
		if (_editor?.renderer?.getDrawingBufferSize) {
			const v = new THREE.Vector2();
			_editor.renderer3d.getDrawingBufferSize(v);
			w = v.x; h = v.y;
		} else {
			const r = this.dom.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			w = Math.max(1, Math.round(r.width  * dpr));
			h = Math.max(1, Math.round(r.height * dpr));
		}
		if (this._rotLineMats) {
			for (const m of this._rotLineMats) m.resolution.set(w, h);
		}
	}

	// Picking ---------------------------------------------------------

	_updateHover() {
		if (!_input.getIsGameInFocus()) { this._setHover(null); return; }
		if (_input.getLeftMouseButtonDown()) return;
	
		const mouse = _input.getMousePosition();
		const rect = this.dom.getBoundingClientRect();
		const nx = ((mouse.x - rect.left) / rect.width) * 2 - 1;
		const ny = -((mouse.y - rect.top) / rect.height) * 2 + 1;
		this._raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
	
		const pickables = [];
		if (this.mode === 'translate') this._grpT.traverseVisible(o => { if (o.userData.handle) pickables.push(o); });
		if (this.mode === 'rotate') this._grpR.traverseVisible(o => { if (o.userData.handle) pickables.push(o); });
		if (this.mode === 'scale') this._grpS.traverseVisible(o => { if (o.userData.handle) pickables.push(o); });
	
		const hits = this._raycaster.intersectObjects(pickables, true);
		if (!hits.length) { this._setHover(null); return; }
	
		const gizCenter = this._group.getWorldPosition(new THREE.Vector3());
		const centerRadius = 0.32;
	
		const filtered = hits.filter(h => {
			const handle = h.object.userData.handle || '';
			if (this.mode === 'scale' && /^s[XYZ]$/.test(handle)) {
				if (h.point.distanceTo(gizCenter) < centerRadius) return false;
			}
			return true;
		});
	
		let best = null, bestPrio = -1;
		for (const h of filtered.length ? filtered : hits) {
			const prio = h.object.userData.pickPriority ?? 0;
			if (prio > bestPrio) { best = h; bestPrio = prio; }
		}
		this._setHover(best ? (best.object.userData.handle || null) : null);
	}

	_setHover(id) {
		if (id === this._hover) return;
		if (this._hover && this._handles[this._hover]) this._setHandleHot(this._handles[this._hover], false);
		this._hover = id;
		if (id && this._handles[id]) this._setHandleHot(this._handles[id], true);
		this.mouseOver = !!id;
		this._setActiveVisibility(); // <--- keep view ring updated
	}

	_shouldBeginDrag() {
		return this._hover && _input.getLeftMouseButtonDown() && !_input.getKeyDown('alt') && !_input.getRightMouseButtonDown();
	}

	_shouldEndDrag() {
		return !_input.getLeftMouseButtonDown();
	}

	_beginDrag() {
		this._active = this._hover;
		this._dragging = true;
		this._setActiveVisibility();
		
		this.beginMatrixWorld = this.object.matrixWorld.clone();
		this.beginPos = this.object.position.clone();
		this.beginRot3 = this.object.rotation.clone();
		this.beginRot = this.object.quaternion.clone();
		this.beginScl = this.object.scale.clone();
		
		const id = this._active;
		const worldPos = this._group.getWorldPosition(new THREE.Vector3());
		const worldQuat = this._group.getWorldQuaternion(new THREE.Quaternion());
	
		const axX = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat);
		const axY = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
		const axZ = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat);
	
		let kind = null, axis = null, plane = null, startPoint = null, t0 = null;
	
		if (id === 'tX' || id === 'tY' || id === 'tZ') {
			kind = 'translate-axis';
			axis = (id === 'tX') ? axX : (id === 'tY') ? axY : axZ;
			plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this._viewNormal(worldPos), worldPos);
			this._raycaster.setFromCamera(this._getMouseNDC(), this.camera);
			t0 = this._projectRayToAxis(this._raycaster.ray, worldPos, axis);
		}
		else if (id === 'tXY' || id === 'tXZ' || id === 'tYZ') {
			kind = 'translate-plane';
			if (id === 'tXY') plane = new THREE.Plane(axZ.clone(), -worldPos.dot(axZ));
			if (id === 'tXZ') plane = new THREE.Plane(axY.clone(), -worldPos.dot(axY));
			if (id === 'tYZ') plane = new THREE.Plane(axX.clone(), -worldPos.dot(axX));
			startPoint = this._raycastToPlane(plane);
		}
		else if (id === 'rX' || id === 'rY' || id === 'rZ') {
			const axisWorld = (id === 'rX') ? axX : (id === 'rY') ? axY : axZ;
			const centerW = worldPos.clone();
			const { u, w } = this._ringBasis(axisWorld);
			const a0 = this._mouseAngleOnRing(centerW, axisWorld, u, w);
			this._dragData = {
				kind: 'rotate-axis-angle',
				axisWorld,
				centerW,
				uW: u, wW: w,
				theta0: a0.ok ? a0.theta : 0,
				haveTheta0: a0.ok,
				startObjPos: this.object.getWorldPosition(new THREE.Vector3()),
				startObjQuat: this.object.getWorldQuaternion(new THREE.Quaternion()),
				startObjScale: this.object.getWorldScale(new THREE.Vector3())
			};
			return;
		}
		else if (id === 'rV') {
			// View-aligned ring: axis = camera forward (world -Z)
			const axisWorld = new THREE.Vector3();
			this.camera.getWorldDirection(axisWorld).negate();
			const centerW = this._group.getWorldPosition(new THREE.Vector3());
			const { u, w } = this._ringBasis(axisWorld);
			const a0 = this._mouseAngleOnRing(centerW, axisWorld, u, w);
			this._dragData = {
				kind: 'rotate-axis-angle',
				axisWorld,
				centerW,
				uW: u, wW: w,
				theta0: a0.ok ? a0.theta : 0,
				haveTheta0: a0.ok,
				startObjPos: this.object.getWorldPosition(new THREE.Vector3()),
				startObjQuat: this.object.getWorldQuaternion(new THREE.Quaternion()),
				startObjScale: this.object.getWorldScale(new THREE.Vector3())
			};
			return;
		}
		else if (id === 'sX' || id === 'sY' || id === 'sZ') {
			kind = 'scale-axis';
			axis = (id === 'sX') ? axX : (id === 'sY') ? axY : axZ;
			plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this._viewNormal(worldPos), worldPos);
			this._raycaster.setFromCamera(this._getMouseNDC(), this.camera);
			t0 = this._projectRayToAxis(this._raycaster.ray, worldPos, axis);
			const axisIndex = (id === 'sX') ? 0 : (id === 'sY') ? 1 : 2;
		
			this._dragData = {
				kind, axis, plane, worldPos,
				startPoint: null, t0,
				startObjPos: this.object.getWorldPosition(new THREE.Vector3()),
				startObjQuat: this.object.getWorldQuaternion(new THREE.Quaternion()),
				startObjScale: this.object.getWorldScale(new THREE.Vector3()),
				startLocalScale: this.object.scale.clone(),
				axisIndex
			};
			return;
		}
		else if (id === 'sU') {
			kind = 'scale-uniform';
			this._dragData = {
				kind,
				startMouse: this._mousePx(),
				startLocalScale: this.object.scale.clone(),
				dir2D: null,
				activated: false
			};
			return;
		}
	
		this._dragData = {
			kind, axis, plane, worldPos,
			startPoint, t0,
			startObjPos: this.object.getWorldPosition(new THREE.Vector3()),
			startObjQuat: this.object.getWorldQuaternion(new THREE.Quaternion()),
			startObjScale: this.object.getWorldScale(new THREE.Vector3())
		};
	}

	_endDrag() {
		this._dragging = false;
		this._active = null;
		this._dragData = null;
		this._setActiveVisibility();
		
		if(this.beginMatrixWorld) {
			if(this.object) {
				const oldMatrixWorld = this.beginMatrixWorld.clone();
				const newMatrixWorld = this.object.matrixWorld.clone();
				const object = this.object;
				
				const changed = [];
				if (this.beginPos && !object.position.equals(this.beginPos))
					changed.push('pos');
				
				if (this.beginRot && !object.quaternion.equals(this.beginRot))
					changed.push('rot');
				
				if (this.beginScl && !object.scale.equals(this.beginScl))
					changed.push('scl');
				
				_events.invoke('transform-changed', this.d3dobject, changed, {
					position: this.beginPos,
					rotation: this.beginRot3,
					quaternion: this.beginRot,
					scale: this.beginScl
				});
				
				if (!oldMatrixWorld.equals(newMatrixWorld)) {
					_editor.addStep({
						name: 'Transformation',
						undo: () => applyWorld(object, oldMatrixWorld),
						redo: () => applyWorld(object, newMatrixWorld),
					});
				}
			}
			
			this.beginMatrixWorld = null;
		}
	}

	_updateDrag() {
		if (!this._dragData) return;
		const d = this._dragData;
	
		this._raycaster.setFromCamera(this._getMouseNDC(), this.camera);
		const ray = this._raycaster.ray;
	
		if (d.kind === 'translate-axis') {
			const tNow = this._projectRayToAxis(ray, d.worldPos, d.axis);
			if (tNow == null || d.t0 == null) return;
			const delta = d.t0 - tNow;
			const offset = d.axis.clone().multiplyScalar(delta);
			const targetPosW = d.startObjPos.clone().add(offset);
			_applyWorldTRS(this.object, targetPosW, d.startObjQuat, d.startObjScale);
		}
		else if (d.kind === 'translate-plane') {
			const hit = this._raycastToPlane(d.plane);
			if (!hit || !d.startPoint) return;
			const delta = hit.clone().sub(d.startPoint);
			const targetPosW = d.startObjPos.clone().add(delta);
			_applyWorldTRS(this.object, targetPosW, d.startObjQuat, d.startObjScale);
		}
		else if (d.kind === 'rotate-axis-angle') {
			// Lazily grab initial angle once the mouse is actually on the plane
			if (!d.haveTheta0) {
				const a0 = this._mouseAngleOnRing(d.centerW, d.axisWorld, d.uW, d.wW);
				if (!a0.ok) return;
				d.theta0 = a0.theta;
				d.haveTheta0 = true;
				return; // wait for next frame to get a delta
			}
		
			const a1 = this._mouseAngleOnRing(d.centerW, d.axisWorld, d.uW, d.wW);
			if (!a1.ok) return;
		
			let delta = this._shortestAngle(a1.theta - d.theta0);
		
			// Optional global invert switch
			if (this.rotateInvert) delta = -delta;
		
			// Snap if requested
			if (this.snap?.rotate) {
				const step = THREE.MathUtils.degToRad(this.snap.rotate);
				delta = Math.round(delta / step) * step;
			}
		
			const qDelta = new THREE.Quaternion().setFromAxisAngle(d.axisWorld, delta);
			const quatW  = qDelta.clone().multiply(d.startObjQuat);
			_applyWorldTRS(this.object, d.startObjPos, quatW, d.startObjScale);
		}
		else if (d.kind === 'scale-axis') {
			const tNow = this._projectRayToAxis(ray, d.worldPos, d.axis);
			if (tNow == null || d.t0 == null) return;
			let s = 1 + (d.t0 - tNow);
			if (this.snap.scale) {
				const step = this.snap.scale;
				s = Math.max(1e-4, Math.round(s / step) * step);
			}
			const newScale = d.startLocalScale.clone();
			const i = d.axisIndex;
			newScale.setComponent(i, Math.max(1e-4, d.startLocalScale.getComponent(i) * s));
			this.object.scale.copy(newScale);
			this.object.updateMatrixWorld();
		}
		else if (d.kind === 'scale-uniform') {
			const cur = this._mousePx();
			let dx = cur.x - d.startMouse.x;
			let dy = cur.y - d.startMouse.y;
			const deadband = 3;
			const dist = Math.hypot(dx, dy);
			if (!d.dir2D) {
				if (dist <= deadband) return;
				const vx = dx, vy = -dy;
				const len = Math.hypot(vx, vy) || 1;
				d.dir2D = { x: vx / len, y: vy / len };
				dx = cur.x - d.startMouse.x;
				dy = cur.y - d.startMouse.y;
			}
			const along = (dx * d.dir2D.x) + ((-dy) * d.dir2D.y);
			const sens = this.uniformScaleSensitivity ?? 0.0015;
			let s = Math.exp(along * sens);
			if (this.snap?.scale) {
				const step = this.snap.scale;
				const k = (step > 0 && step < 1) ? (1 + step) : Math.max(step, 1e-6);
				s = Math.exp(Math.round(Math.log(Math.max(1e-6, s)) / Math.log(k)) * Math.log(k));
			}
			this.object.scale.copy(d.startLocalScale.clone().multiplyScalar(Math.max(1e-4, s)));
			this.object.updateMatrixWorld();
		}
	}

	// Apply ops -------------------------------------------------------

	_applyTranslation(d, vWorld) {
		const obj = this.object;
		if (this.space === 'local') {
			const parent = obj.parent || this.scene;
			parent.worldToLocal(this._tmpV.copy(d.startObjPos).add(vWorld));
			obj.position.copy(parent.worldToLocal(this._tmpV2.copy(obj.getWorldPosition(new THREE.Vector3())).add(vWorld)));
		} else {
			obj.position.add(vWorld.applyMatrix4(this._invParentMatrix(obj)));
		}
		obj.updateMatrixWorld();
	}

	_applyRotation(d, axisWorld, angle) {
		const obj = this.object;
		if (this.space === 'local') {
			obj.worldToLocal(this._tmpV.copy(obj.getWorldPosition(new THREE.Vector3())).add(axisWorld)).sub(obj.position).normalize();
			const q = new THREE.Quaternion().setFromAxisAngle(this._tmpV, angle);
			obj.quaternion.copy(d.startObjQuat).premultiply(q);
		} else {
			const q = new THREE.Quaternion().setFromAxisAngle(axisWorld, angle);
			obj.quaternion.copy(d.startObjQuat).premultiply(q);
		}
		obj.updateMatrixWorld();
	}

	_applyScale(d, scaleVec) {
		const obj = this.object;
		obj.scale.copy(d.startObjScale.clone().multiply(scaleVec));
		obj.updateMatrixWorld();
	}

	_invParentMatrix(obj) {
		const p = obj.parent;
		if (!p) return this._tmpM.identity();
		return this._tmpM.copy(p.matrixWorld).invert();
	}

	// Utils -----------------------------------------------------------

	_viewNormal(pointWorld) {
		const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
		return f.normalize();
	}

	_raycastToPlane(plane) {
		const mouse = _input.getMousePosition();
		const rect = this.dom.getBoundingClientRect();
		const nx = ((mouse.x - rect.left) / rect.width) * 2 - 1;
		const ny = -((mouse.y - rect.top) / rect.height) * 2 + 1;
		this._raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
		const out = new THREE.Vector3();
		return plane.intersectLine(new THREE.Line3(
			this._raycaster.ray.origin,
			this._raycaster.ray.origin.clone().add(this._raycaster.ray.direction.clone().multiplyScalar(10_000))
		), out) ? out : null;
	}

	_snapT(v) {
		const s = this.snap.translate || 0;
		return s ? Math.round(v / s) * s : v;
	}

	_snapR(a) {
		const s = this.snap.rotate || 0;
		return s ? Math.round(a / s) * s : a;
	}

	_snapS(v) {
		const s = this.snap.scale || 0;
		return s ? Math.round(v / s) * s : v;
	}
	
	_projectRayToAxis(ray, linePoint, lineDir) {
		const v = linePoint.clone().sub(ray.origin);
		const d1 = lineDir.clone();
		const d2 = ray.direction.clone();
	
		const a = d1.dot(d1);
		const b = d1.dot(d2);
		const c = d2.dot(d2);
		const d = d1.dot(v);
		const e = d2.dot(v);
	
		const denom = a * c - b * b;
		if (Math.abs(denom) < 1e-6) return 0;
	
		return (d * c - b * e) / denom;
	}
	
	_setActiveVisibility() {
		if (!this._viewRingLine) return;
	
		const mat = this._viewRingLine.material;
		if (this._active === 'rV') {
			mat.opacity = 0.95;
		} else {
			mat.opacity = 0.5;
		}
		mat.needsUpdate = true;
	}
	
	_worldToScreenPx(pWorld) {
		const v = pWorld.clone().project(this.camera);
		const rect = this.dom.getBoundingClientRect();
		const x = (v.x * 0.5 + 0.5) * rect.width;
		const y = (-v.y * 0.5 + 0.5) * rect.height;
		return { x, y };
	}
	_mousePx() {
		const rect = this.dom.getBoundingClientRect();
		const m = _input.getMousePosition();
		return { x: m.x - rect.left, y: m.y - rect.top };
	}
	
	_getMouseNDC() {
		const rect = this.dom.getBoundingClientRect();
		const mouse = _input.getMousePosition();
		return {
			x: ((mouse.x - rect.left) / rect.width) * 2 - 1,
			y: -((mouse.y - rect.top) / rect.height) * 2 + 1
		};
	}
	
	// Returns a normalized 2D screen direction from A->B (in world)
	_screenDir(aW, bW) {
		const a = this._worldToScreenPx(aW), b = this._worldToScreenPx(bW);
		const v = new THREE.Vector2(b.x - a.x, b.y - a.y);
		if (v.lengthSq() < 1e-12) return new THREE.Vector2(1, 0);
		return v.normalize();
	}
	
	// Project the current mouse ray to the plane of the ring and return the
	// normalized radial direction on that plane (in WORLD), or null.
	_hitRingRadialDirWorld(axisW, centerW) {
		// plane for this ring
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisW.clone().normalize(), centerW);
	
		// mouse ray in world
		const rect = this.dom.getBoundingClientRect();
		const m = _input.getMousePosition();
		const ndc = {
			x: ((m.x - rect.left) / rect.width) * 2 - 1,
			y: -((m.y - rect.top) / rect.height) * 2 + 1
		};
		this._raycaster.setFromCamera(ndc, this.camera);
		const ray = this._raycaster.ray;
	
		// intersect plane
		const hit = new THREE.Vector3();
		if (!plane.intersectLine(new THREE.Line3(
			ray.origin,
			ray.origin.clone().add(ray.direction.clone().multiplyScalar(10000))
		), hit)) return null;
	
		// radial dir = from center to hit, projected to plane and normalized
		const r = hit.clone().sub(centerW);
		// ensure it's on plane numerically
		r.sub(axisW.clone().multiplyScalar(r.dot(axisW)));
		const len = r.length();
		if (len < 1e-6) return null;
		return r.multiplyScalar(1 / len);
	}
	
	// Make a screen-space unit tangent (2D) for +rotation at the cursor hit
	_makeScreenTangent2D(axisW, centerW) {
		// radial dir at cursor
		const rdirW = this._hitRingRadialDirWorld(axisW, centerW);
		if (!rdirW) return new THREE.Vector2(1, 0);
	
		// 3D tangent = axis × radial (direction of +angle around axis)
		const tW = new THREE.Vector3().crossVectors(axisW, rdirW).normalize();
	
		// project a tiny segment along that tangent to screen to get a 2D dir
		const p0 = centerW.clone().add(rdirW.clone().multiplyScalar(1.0));	// on ring
		const p1 = p0.clone().add(tW.clone().multiplyScalar(0.25));			// small step along +tangent
		const a = this._worldToScreenPx(p0);
		const b = this._worldToScreenPx(p1);
		const v = new THREE.Vector2(b.x - a.x, b.y - a.y);
		if (v.lengthSq() < 1e-10) return new THREE.Vector2(1, 0);
		return v.normalize();
	}
	
	// Build a stable orthonormal basis (u,w) on the ring plane in WORLD space.
	// axisW is the plane normal.
	_ringBasis(axisW) {
		const n = axisW.clone().normalize();
		// pick a non-parallel reference
		const ref = Math.abs(n.y) < 0.99 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
		const u = ref.clone().sub(n.clone().multiplyScalar(ref.dot(n))).normalize(); // in-plane
		const w = new THREE.Vector3().crossVectors(n, u).normalize();                // in-plane, orthogonal to u
		return { u, w, n };
	}
	
	// Intersect current mouse ray with the plane (axisW, centerW).
	// Return world hit point or null if parallel.
	_mouseHitOnPlane(centerW, axisW) {
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisW.clone().normalize(), centerW);
		const rect = this.dom.getBoundingClientRect();
		const m = _input.getMousePosition();
		const ndc = { x: ((m.x - rect.left) / rect.width) * 2 - 1, y: -((m.y - rect.top) / rect.height) * 2 + 1 };
		this._raycaster.setFromCamera(ndc, this.camera);
		const A = this._raycaster.ray.origin.clone();
		const B = A.clone().add(this._raycaster.ray.direction.clone().multiplyScalar(10000));
		const out = new THREE.Vector3();
		return plane.intersectLine(new THREE.Line3(A, B), out) ? out : null;
	}
	
	// Compute polar angle θ of (hit-center) in the (u,w) basis on the plane.
	_mouseAngleOnRing(centerW, axisW, uW, wW) {
		const hit = this._mouseHitOnPlane(centerW, axisW);
		if (!hit) return { ok:false, theta:0 };
		const r = hit.sub(centerW);
		// Remove any tiny numerical normal component
		r.sub(axisW.clone().multiplyScalar(r.dot(axisW)));
		const x = r.dot(uW), y = r.dot(wW);
		if (x*x + y*y < 1e-16) return { ok:false, theta:0 };
		return { ok:true, theta: Math.atan2(y, x) };
	}
	
	// Wrap to (-π, π]
	_shortestAngle(a) {
		while (a >  Math.PI) a -= 2*Math.PI;
		while (a <= -Math.PI) a += 2*Math.PI;
		return a;
	}
}

function applyWorld(obj, worldMatrix) {
	const Matrix4 = window.THREE.Matrix4;
	const parentWorldInv = obj.parent
		? new Matrix4().copy(obj.parent.matrixWorld).invert()
		: new Matrix4().identity();
	const local = new Matrix4().multiplyMatrices(parentWorldInv, worldMatrix);
	local.decompose(obj.position, obj.quaternion, obj.scale);
	obj.updateMatrixWorld(true);
}

function _applyWorldTRS(obj, posW, quatW, scaleW) {
	if (!posW) posW = obj.getWorldPosition(new THREE.Vector3());
	if (!quatW) quatW = obj.getWorldQuaternion(new THREE.Quaternion());
	if (!scaleW) scaleW = obj.getWorldScale(new THREE.Vector3());
	const _M = new window.THREE.Matrix4();
	_M.compose(posW, quatW, scaleW);
	applyWorld(obj, _M);
}