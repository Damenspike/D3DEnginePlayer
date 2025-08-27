const { RenderPass } = require('three/examples/jsm/postprocessing/RenderPass.js');

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
			if (o.material) {
				o.material = Array.isArray(o.material)
					? o.material.map(m => m && m.clone())
					: o.material.clone();
				// remember the base color per-mesh
				if (o.material && o.material.color) {
					o.userData.baseColor = o.material.color.clone();
				}
				// overlay flags
				o.material.depthTest = false;
				o.material.depthWrite = false;
				o.material.transparent = true;
				o.material.fog = false;
				o.material.toneMapped = false;
			}
			o.renderOrder = 99999;
			o.frustumCulled = false;
		});
	
		// ensure overlay-friendly materials + flags on all children
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
		// keep attached to selected if a getter is provided
		const sel = this.getSelected();
		if (sel !== this.d3dobject) this.attach(sel);
		
		if (!this.object) return;

		// position at target & face camera scale
		this._syncPose();
		this._scaleToCamera();

		// hover + drag
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
	
		// materials (kept simple)
		this._mat = {
			X: new THREE.MeshBasicMaterial({ color: 0xff5555 }),
			Y: new THREE.MeshBasicMaterial({ color: 0x55ff55 }),
			Z: new THREE.MeshBasicMaterial({ color: 0x5599ff }),
			P: new THREE.MeshBasicMaterial({ color: 0xffff55, opacity: 0.15, transparent: true })
		};
	
		// groups by mode
		this._grpT = new THREE.Group(); this._grpT.name = 'translate';
		this._grpR = new THREE.Group(); this._grpR.name = 'rotate';
		this._grpS = new THREE.Group(); this._grpS.name = 'scale';
	
		// build handles
		this._buildTranslateHandles(this._grpT);
		this._buildRotateHandles(this._grpR);
		this._buildScaleHandles(this._grpS);
	
		// add and register
		g.add(this._grpT, this._grpR, this._grpS);
		[...this._grpT.children, ...this._grpR.children, ...this._grpS.children].forEach(h => this._registerHandle(h));
	
		this._refreshVisibility();
	}
	
	_buildTranslateHandles(group) {
		// common geoms
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
	
		// arrows
		const tx = buildAxisArrow('x', this._mat.X, 'tX');
		const ty = buildAxisArrow('y', this._mat.Y, 'tY');
		const tz = buildAxisArrow('z', this._mat.Z, 'tZ');
	
		// planes
		const txy = new THREE.Mesh(quad, this._mat.P.clone()); txy.name = 'tXY'; txy.position.set(0.25, 0.25, 0.0);
		const txz = new THREE.Mesh(quad, this._mat.P.clone()); txz.name = 'tXZ'; txz.rotation.x = -Math.PI / 2; txz.position.set(0.25, 0.0, 0.25);
		const tyz = new THREE.Mesh(quad, this._mat.P.clone()); tyz.name = 'tYZ'; tyz.rotation.y =  Math.PI / 2; tyz.position.set(0.0, 0.25, 0.25);
	
		[txy, txz, tyz].forEach(m => {
			m.material.depthTest = false; m.material.depthWrite = false; m.material.transparent = true;
			m.material.fog = false; m.material.toneMapped = false;
		});
	
		group.add(tx, ty, tz, txy, txz, tyz);
	}
	
	_buildRotateHandles(group) {
		const cloneMat = (m) => (m ? m.clone() : m);
		const makeRing = (r) => new THREE.TorusGeometry(r, 0.02, 16, 64);
		const makePick = (r) => new THREE.TorusGeometry(r, 0.10, 8, 48); // fat invisible hit area
	
		const orientToAxis = (mesh, axis) => {
			const q = new THREE.Quaternion().setFromUnitVectors(
				new THREE.Vector3(0, 0, 1),
				axis.clone().normalize()
			);
			mesh.quaternion.copy(q);
		};
	
		const addRingWithCollider = (name, visMat, radius, axis) => {
			const g = new THREE.Group(); g.name = name;
	
			const vis = new THREE.Mesh(makeRing(radius), cloneMat(visMat));
			vis.material.side = THREE.DoubleSide;
			vis.material.depthTest = false;
			vis.material.depthWrite = false;
			vis.material.transparent = true;
			vis.material.fog = false;
			vis.material.toneMapped = false;
	
			const pick = new THREE.Mesh(
				makePick(radius),
				new THREE.MeshBasicMaterial({ visible: false })
			);
			pick.userData.handle = name;
	
			g.add(vis, pick);
			orientToAxis(g, axis);
			group.add(g);
		};
	
		// stagger radii so they don't fully overpaint each other with depthTest=false
		addRingWithCollider('rX', this._mat.X, 0.88, new THREE.Vector3(1, 0, 0)); // plane YZ
		addRingWithCollider('rY', this._mat.Y, 0.90, new THREE.Vector3(0, 1, 0)); // plane XZ
		addRingWithCollider('rZ', this._mat.Z, 0.92, new THREE.Vector3(0, 0, 1)); // plane XY
	}
	
	_buildScaleHandles(group) {
		// ----- shared geometry -----
		const box = new THREE.BoxGeometry(0.14, 0.14, 0.14);           // end cubes
		const shaftGeom = new THREE.CylinderGeometry(0.02, 0.02, 1.0, 12); // center→end shaft
		const pickCapsule = (len = 1.2, r = 0.18) => new THREE.CylinderGeometry(r, r, len, 8);
		const mkMat = (m) => {
			const x = m.clone();
			x.depthTest = false; x.depthWrite = false; x.transparent = true;
			x.fog = false; x.toneMapped = false;
			return x;
		};
	
		// ----- axis builder (sX / sY / sZ) -----
		const makeAxis = (name, axis, mat) => {
			const g = new THREE.Group(); g.name = name;
	
			// visible shaft (from center to the end cube)
			const shaft = new THREE.Mesh(shaftGeom, mkMat(mat));
			if (axis === 'x') { shaft.rotation.z = -Math.PI / 2; shaft.position.x = 0.5; }
			else if (axis === 'y') { shaft.position.y = 0.5; }
			else { shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.5; }
	
			// end cube
			const end = new THREE.Mesh(box, mkMat(mat));
			if (axis === 'x') end.position.x = 1.0;
			if (axis === 'y') end.position.y = 1.0;
			if (axis === 'z') end.position.z = 1.0;
	
			// big invisible collider (easy picking)
			const pick = new THREE.Mesh(pickCapsule(1.2, 0.18), new THREE.MeshBasicMaterial({ visible: false }));
			if (axis === 'x') { pick.rotation.z = -Math.PI / 2; pick.position.x = 0.6; }
			if (axis === 'y') { pick.position.y = 0.6; }
			if (axis === 'z') { pick.rotation.x =  Math.PI / 2; pick.position.z = 0.6; }
			pick.userData.handle = name;          // 'sX' / 'sY' / 'sZ'
			pick.userData.pickPriority = 1;       // lower than center
	
			g.add(shaft, end, pick);
			return g;
		};
	
		// build axis handles
		const sx = makeAxis('sX', 'x', this._mat.X);
		const sy = makeAxis('sY', 'y', this._mat.Y);
		const sz = makeAxis('sZ', 'z', this._mat.Z);
	
		// ----- uniform scale in center -----
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
	
		// large invisible sphere collider so clicks prefer center
		const suPick = new THREE.Mesh(
			new THREE.SphereGeometry(0.6, 16, 12),
			new THREE.MeshBasicMaterial({ visible: false })
		);
		suPick.userData.handle = 'sU';
		suPick.userData.pickPriority = 10; // dominates over arm colliders
	
		// add to group
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
		obj.traverse(o => { o.userData.handle = obj.name; }); // children inherit
		obj.raycast = THREE.Mesh.prototype.raycast; // ensure raycast works for groups’ children
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
		const scale = Math.max(0.001, dist * 0.15); // tune scalar for your FOV
		this._group.scale.setScalar(scale);
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
	
		// collect pickables by current mode
		const pickables = [];
		if (this.mode === 'translate') this._grpT.traverseVisible(o => { if (o.userData.handle) pickables.push(o); });
		if (this.mode === 'rotate') this._grpR.traverseVisible(o => { if (o.userData.handle) pickables.push(o); });
		if (this.mode === 'scale') this._grpS.traverseVisible(o => { if (o.userData.handle) pickables.push(o); });
	
		const hits = this._raycaster.intersectObjects(pickables, true);
		if (!hits.length) { this._setHover(null); return; }
	
		// center preference + dead-zone around center for scale arms
		const gizCenter = this._group.getWorldPosition(new THREE.Vector3());
		const centerRadius = 0.32; // must be ≤ suPick radius 0.35
	
		// filter: if close to center, ignore arm hits (sX/sY/sZ), let sU win
		const filtered = hits.filter(h => {
			const handle = h.object.userData.handle || '';
			if (this.mode === 'scale' && /^s[XYZ]$/.test(handle)) {
				if (h.point.distanceTo(gizCenter) < centerRadius) return false; // dead-zone near center
			}
			return true;
		});
	
		// choose by highest pickPriority, then by ray distance
		let best = null, bestPrio = -1;
		for (const h of filtered.length ? filtered : hits) {
			const prio = h.object.userData.pickPriority ?? 0;
			if (prio > bestPrio) { best = h; bestPrio = prio; }
		}
		this._setHover(best ? (best.object.userData.handle || null) : null);
	}

	_setHover(id) {
		if (id === this._hover) return;
		// restore previous materials
		if (this._hover && this._handles[this._hover]) this._setHandleHot(this._handles[this._hover], false);
		this._hover = id;
		if (id && this._handles[id]) this._setHandleHot(this._handles[id], true);
	}

	_shouldBeginDrag() {
		return this._hover && _input.getLeftMouseButtonDown();
	}

	_shouldEndDrag() {
		return !_input.getLeftMouseButtonDown();
	}

	_beginDrag() {
		this._active = this._hover;
		this._dragging = true;
		this._setActiveVisibility();
	
		const id = this._active;
		const worldPos = this._group.getWorldPosition(new THREE.Vector3());
		const worldQuat = this._group.getWorldQuaternion(new THREE.Quaternion());
	
		// World-space axes
		const axX = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat);
		const axY = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
		const axZ = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat);
	
		let kind = null, axis = null, plane = null, startPoint = null, t0 = null;
	
		// --- Translate axis (arrows) ---
		if (id === 'tX' || id === 'tY' || id === 'tZ') {
			kind = 'translate-axis';
			axis = (id === 'tX') ? axX : (id === 'tY') ? axY : axZ;
			plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this._viewNormal(worldPos), worldPos);
	
			// Project ray to axis → scalar t0
			this._raycaster.setFromCamera(this._getMouseNDC(), this.camera);
			t0 = this._projectRayToAxis(this._raycaster.ray, worldPos, axis);
		}
	
		// --- Translate plane (squares) ---
		else if (id === 'tXY' || id === 'tXZ' || id === 'tYZ') {
			kind = 'translate-plane';
			if (id === 'tXY') plane = new THREE.Plane(axZ.clone(), -worldPos.dot(axZ));
			if (id === 'tXZ') plane = new THREE.Plane(axY.clone(), -worldPos.dot(axY));
			if (id === 'tYZ') plane = new THREE.Plane(axX.clone(), -worldPos.dot(axX));
	
			startPoint = this._raycastToPlane(plane);
		}
	
		// --- Rotate axis (pixel-driven like uniform scale) ---
		else if (id === 'rX' || id === 'rY' || id === 'rZ') {
			const worldPos = this._group.getWorldPosition(new THREE.Vector3());
			const worldQuat = this._group.getWorldQuaternion(new THREE.Quaternion());
			const axX = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat);
			const axY = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
			const axZ = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat);
			const axisWorld = (id === 'rX') ? axX : (id === 'rY') ? axY : axZ;
		
			// screen-space “natural” spin direction for this axis: axis × viewDir
			const viewDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).normalize();
			let tangent3D = new THREE.Vector3().crossVectors(axisWorld, viewDir);
			if (tangent3D.lengthSq() < 1e-10) {
				// fallback if axis ≈ view
				const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
				tangent3D.copy(camRight.sub(axisWorld.clone().multiplyScalar(camRight.dot(axisWorld)))).normalize();
			}
			const p0 = this._worldToScreenPx(worldPos);
			const p1 = this._worldToScreenPx(worldPos.clone().add(tangent3D.clone().multiplyScalar(0.5)));
			const tan2D = new THREE.Vector2(p1.x - p0.x, p1.y - p0.y).normalize(); // natural 2D spin
		
			this._dragData = {
				kind: 'rotate-axis-px-locked',
				axisWorld,
				startMouse: this._mousePx(),		// where the drag started
				dir2D: null,						// will lock to your initial motion (unit 2D)
				natural2D: tan2D,					// for initial sign alignment only
				startObjQuat: this.object.getWorldQuaternion(new THREE.Quaternion()),
				sensitivity: this.rotatePixelSensitivity
			};
			return;
		}
	
		// --- Scale axis (boxes) ---
		else if (id === 'sX' || id === 'sY' || id === 'sZ') {
			kind = 'scale-axis';
			axis = (id === 'sX') ? axX : (id === 'sY') ? axY : axZ; // world axis for ray math
			plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this._viewNormal(worldPos), worldPos);
			this._raycaster.setFromCamera(this._getMouseNDC(), this.camera);
			t0 = this._projectRayToAxis(this._raycaster.ray, worldPos, axis);
		
			// store which local component to scale
			const axisIndex = (id === 'sX') ? 0 : (id === 'sY') ? 1 : 2;
		
			this._dragData = {
				kind, axis, plane, worldPos,
				startPoint: null, t0,
				startObjPos: this.object.getWorldPosition(new THREE.Vector3()),
				startObjQuat: this.object.getWorldQuaternion(new THREE.Quaternion()),
				startObjScale: this.object.getWorldScale(new THREE.Vector3()), // world, for ref if you need
				startLocalScale: this.object.scale.clone(), // <-- local scale we will modify
				axisIndex
			};
			return;
		}
	
		// --- Scale uniform (center ball) ---
		else if (id === 'sU') {
			kind = 'scale-uniform';
			this._dragData = {
				kind,
				startMouse: this._mousePx(),          // starting mouse (px)
				startLocalScale: this.object.scale.clone(),
				dir2D: null,                          // unit 2D direction set after a small move
				activated: false                      // becomes true after deadband
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
	}

	_updateDrag() {
		if (!this._dragData) return;
		const d = this._dragData;
	
		this._raycaster.setFromCamera(this._getMouseNDC(), this.camera);
		const ray = this._raycaster.ray;
	
		// --- Translate axis ---
		if (d.kind === 'translate-axis') {
			const tNow = this._projectRayToAxis(ray, d.worldPos, d.axis);
			if (tNow == null || d.t0 == null) return;
			const delta = d.t0 - tNow;
			const offset = d.axis.clone().multiplyScalar(delta);
			this.object.position.copy(d.startObjPos.clone().add(offset));
			this.object.updateMatrixWorld();
		}
	
		// --- Translate plane ---
		else if (d.kind === 'translate-plane') {
			const hit = this._raycastToPlane(d.plane);
			if (!hit || !d.startPoint) return;
			const delta = hit.clone().sub(d.startPoint);
			this.object.position.copy(d.startObjPos.clone().add(delta));
			this.object.updateMatrixWorld();
		}
	
		// --- Rotate axis (pixel-driven with locked direction) ---
		else if (d.kind === 'rotate-axis-px-locked') {
			const cur = this._mousePx();
			const dx = cur.x - d.startMouse.x;
			const dy = cur.y - d.startMouse.y;
		
			// lock direction after a tiny deadband so we follow *your* initial motion
			if (!d.dir2D) {
				const dead = 3; // px
				if (Math.hypot(dx, dy) < dead) return;
		
				// initial movement vector in screen space (y inverted so up is +)
				let mv = new THREE.Vector2(dx, -dy).normalize();
		
				// align sign to the axis’ natural screen spin so it doesn’t feel backwards
				if (mv.dot(d.natural2D) < 0) mv.multiplyScalar(-1);
		
				d.dir2D = mv;
			}
		
			// signed pixels along locked direction (works for any drag path)
			let along = dx * d.dir2D.x + (-dy) * d.dir2D.y;
		
			// global invert toggle
			if (this.rotateInvert) along = -along;
		
			// absolute mapping from start → angle (no re-clicks needed)
			let angle = along * (d.sensitivity ?? 0.006);
		
			// optional snapping
			if (this.snap?.rotate) {
				const step = THREE.MathUtils.degToRad(this.snap.rotate);
				angle = Math.round(angle / step) * step;
			}
		
			// flip sign for Y and Z to match expected drag direction
			const flip =
				Math.abs(d.axisWorld.x) > 0.9 ? 1 :   // X (red) → normal
				-1;                                    // Y (green) & Z (blue) → flipped
			
			const q = new THREE.Quaternion().setFromAxisAngle(d.axisWorld, angle * flip);
			this.object.quaternion.copy(d.startObjQuat).premultiply(q);
			this.object.updateMatrixWorld();
		}
	
		// --- Scale axis ---
		else if (d.kind === 'scale-axis') {
			const tNow = this._projectRayToAxis(ray, d.worldPos, d.axis);
			if (tNow == null || d.t0 == null) return;
		
			// factor from movement along axis (1 unit drag → 2× size feels too strong; keep 1+Δ)
			let s = 1 + (d.t0 - tNow);
		
			// optional snapping
			if (this.snap.scale) {
				const step = this.snap.scale;
				s = Math.max(1e-4, Math.round(s / step) * step);
			}
		
			// apply on a SINGLE local component, no cross-axis bleed
			const newScale = d.startLocalScale.clone();
			const i = d.axisIndex;
			newScale.setComponent(i, Math.max(1e-4, d.startLocalScale.getComponent(i) * s));
			this.object.scale.copy(newScale);
			this.object.updateMatrixWorld();
		}
		
		// --- Scale uniform ---
		else if (d.kind === 'scale-uniform') {
			const cur = this._mousePx();
			let dx = cur.x - d.startMouse.x;
			let dy = cur.y - d.startMouse.y;
		
			// deadband to avoid tiny jitter choosing a bad direction
			const deadband = 3; // pixels
			const dist = Math.hypot(dx, dy);
		
			// pick a fixed 2D direction from the initial movement, once
			if (!d.dir2D) {
				if (dist <= deadband) return; // not enough motion yet
				// use screen-space up as positive scale; include horizontal too
				// we want "up/right = grow" and "down/left = shrink"
				const vx = dx, vy = -dy; // invert y so up is positive
				const len = Math.hypot(vx, vy) || 1;
				d.dir2D = { x: vx / len, y: vy / len }; // unit vector
				d.activated = true;
				// recompute along-axis delta after activation so we don't jump
				dx = cur.x - d.startMouse.x;
				dy = cur.y - d.startMouse.y;
			}
		
			// signed pixels along fixed direction (continuous, no axis flip)
			const along = (dx * d.dir2D.x) + ((-dy) * d.dir2D.y); // -dy so up is positive
			const sens = this.uniformScaleSensitivity ?? 0.0015;
			let s = Math.exp(along * sens);
		
			// optional geometric snapping (comment out if you don’t want any snap)
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
		// move object in world, respecting space (local/world)
		const obj = this.object;
		if (this.space === 'local') {
			// convert world delta into object parent space
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
			// convert axis to local
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
		// camera forward in world space
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
	
	// return scalar t along axis for closest point to ray
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
		if (Math.abs(denom) < 1e-6) return 0; // ray almost parallel
	
		return (d * c - b * e) / denom;
	}
	
	_setActiveVisibility() {
		if (this.mode !== 'rotate') return;
	
		// If no active ring → show all
		if (!this._active) {
			this._grpR.children.forEach(r => r.visible = true);
			return;
		}
	
		// Only show the active ring
		this._grpR.children.forEach(r => {
			r.visible = (r.name === this._active);
		});
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
}