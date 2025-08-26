const { RenderPass } = require('three/examples/jsm/postprocessing/RenderPass.js');

export default class D3DTransformGizmo {
	get busy() {
		return this._dragging;
	}
	
	constructor(params) {
		this.scene = params.scene;
		this.camera = params.camera;
		this.dom = params.dom;
		this.getSelected = params.getSelected || (() => null); // () => object3d
	
		this.object = null;
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

	attach(object3d) {
		this.object = object3d || null;
		this._group.visible = !!object3d;
		if (object3d) this._syncPose();
	}

	detach() {
		this.object = null;
		this._group.visible = false;
	}

	setMode(mode) {
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
		const sel = this.getSelected ? this.getSelected() : this.object;
		if (sel !== this.object) this.attach(sel);

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
		this._handles = {}; // id -> mesh
		const g = this._group;
	
		// ----- Materials -----
		const matX = new THREE.MeshBasicMaterial({ color: 0xff5555 });
		const matY = new THREE.MeshBasicMaterial({ color: 0x55ff55 });
		const matZ = new THREE.MeshBasicMaterial({ color: 0x5599ff });
		const matPlane = new THREE.MeshBasicMaterial({ color: 0xffff55, opacity: 0.15, transparent: true });
		const matHot = new THREE.MeshBasicMaterial({ color: 0xffffff });
	
		this._mat = { X: matX, Y: matY, Z: matZ, P: matPlane, HOT: matHot };
	
		// ----- Common geometries -----
		const shaftLen = 1.0, shaftRad = 0.03;
		const headLen  = 0.2, headRad  = 0.12;
	
		const cyl   = new THREE.CylinderGeometry(shaftRad, shaftRad, shaftLen, 16);
		const cone  = new THREE.ConeGeometry(headRad, headLen, 24);
		const box   = new THREE.BoxGeometry(0.14, 0.14, 0.14);
		const torus = new THREE.TorusGeometry(0.9, 0.02, 16, 64); // rotation ring
		const quad  = new THREE.PlaneGeometry(0.4, 0.4);
	
		// ----- Helpers -----
		const cloneMat = (m) => (m ? m.clone() : m);
	
		function buildAxisArrow(axis, baseMat) {
			const grp = new THREE.Group();
	
			const shaft = new THREE.Mesh(cyl,  cloneMat(baseMat));
			const head  = new THREE.Mesh(cone, cloneMat(baseMat));
	
			// invisible fatter collider for easy picking
			const pick = new THREE.Mesh(
				new THREE.CylinderGeometry(0.15, 0.15, shaftLen + headLen, 8),
				new THREE.MeshBasicMaterial({ visible: false })
			);
	
			if (axis === 'x') {
				shaft.rotation.z = -Math.PI / 2;
				head.rotation.z  = -Math.PI / 2;
				pick.rotation.z  = -Math.PI / 2;
	
				shaft.position.x = shaftLen * 0.5;
				head.position.x  = shaftLen + headLen * 0.5;
				pick.position.x  = (shaftLen + headLen) * 0.5;
			}
			else if (axis === 'y') {
				shaft.position.y = shaftLen * 0.5;
				head.position.y  = shaftLen + headLen * 0.5;
				pick.position.y  = (shaftLen + headLen) * 0.5;
			}
			else if (axis === 'z') {
				shaft.rotation.x =  Math.PI / 2;
				head.rotation.x  =  Math.PI / 2;
				pick.rotation.x  =  Math.PI / 2;
	
				shaft.position.z = shaftLen * 0.5;
				head.position.z  = shaftLen + headLen * 0.5;
				pick.position.z  = (shaftLen + headLen) * 0.5;
			}
	
			// give collider same handle id
			pick.userData.handle = 't' + axis.toUpperCase();
	
			grp.add(shaft, head, pick);
			return grp;
		}
	
		// ----- Translate (arrows + planes) -----
		const tx = buildAxisArrow('x', this._mat.X); tx.name = 'tX';
		const ty = buildAxisArrow('y', this._mat.Y); ty.name = 'tY';
		const tz = buildAxisArrow('z', this._mat.Z); tz.name = 'tZ';
	
		const txy = new THREE.Mesh(quad, cloneMat(this._mat.P)); txy.name = 'tXY'; txy.position.set(0.25, 0.25, 0.0);
		const txz = new THREE.Mesh(quad, cloneMat(this._mat.P)); txz.name = 'tXZ'; txz.rotation.x = -Math.PI / 2; txz.position.set(0.25, 0.0, 0.25);
		const tyz = new THREE.Mesh(quad, cloneMat(this._mat.P)); tyz.name = 'tYZ'; tyz.rotation.y =  Math.PI / 2; tyz.position.set(0.0, 0.25, 0.25);
	
		// ----- Rotate (rings) -----
		const rx = new THREE.Mesh(torus, cloneMat(this._mat.X)); rx.name = 'rX'; rx.rotation.z =  Math.PI / 2;
		const ry = new THREE.Mesh(torus, cloneMat(this._mat.Y)); ry.name = 'rY';
		const rz = new THREE.Mesh(torus, cloneMat(this._mat.Z)); rz.name = 'rZ'; rz.rotation.x =  Math.PI / 2;
	
		// ----- Scale (axis + uniform) -----
		const sx = new THREE.Mesh(box, cloneMat(this._mat.X)); sx.name = 'sX'; sx.position.x = 1.0;
		const sy = new THREE.Mesh(box, cloneMat(this._mat.Y)); sy.name = 'sY'; sy.position.y = 1.0;
		const sz = new THREE.Mesh(box, cloneMat(this._mat.Z)); sz.name = 'sZ'; sz.position.z = 1.0;
		const su = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), new THREE.MeshBasicMaterial({ color: 0xffffff })); su.name = 'sU';
	
		// ----- Grouping by mode -----
		this._grpT = new THREE.Group(); this._grpT.name = 'translate';
		this._grpR = new THREE.Group(); this._grpR.name = 'rotate';
		this._grpS = new THREE.Group(); this._grpS.name = 'scale';
	
		this._grpT.add(tx, ty, tz, txy, txz, tyz);
		this._grpR.add(rx, ry, rz);
		this._grpS.add(sx, sy, sz, su);
	
		g.add(this._grpT, this._grpR, this._grpS);
	
		// ----- Register pickable handles -----
		[tx, ty, tz, txy, txz, tyz, rx, ry, rz, sx, sy, sz, su].forEach(h => this._registerHandle(h));
	
		this._refreshVisibility();
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
		if (!_input.getLeftMouseButtonDown()) {
			const mouse = _input.getMousePosition();
			const rect = this.dom.getBoundingClientRect();
			const nx = ((mouse.x - rect.left) / rect.width) * 2 - 1;
			const ny = -((mouse.y - rect.top) / rect.height) * 2 + 1;
			this._raycaster.setFromCamera({ x: nx, y: ny }, this.camera);

			const pickables = [];
			if (this.mode === 'translate') this._grpT.traverseVisible(o => { if (o.userData.handle) pickables.push(o); });
			if (this.mode === 'rotate') this._grpR.traverseVisible(o => { if (o.userData.handle) pickables.push(o); });
			if (this.mode === 'scale') this._grpS.traverseVisible(o => { if (o.userData.handle) pickables.push(o); });

			const hit = this._raycaster.intersectObjects(pickables, true)[0];
			this._setHover(hit ? hit.object.userData.handle : null);
		}
	}

	_setHover(id) {
		if (id === this._hover) return;
		// restore previous materials
		if (this._hover && this._handles[this._hover]) this._setHandleHot(this._handles[this._hover], false);
		this._hover = id;
		if (id && this._handles[id]) this._setHandleHot(this._handles[id], true);
	}

	_setHandleHot(handle, hot) {
		const apply = (m, def) => {
			if (!m) return;
			if (hot) {
				m._oldColor = m.color?.clone?.();
				if (m.color) m.color.set(0xffffff);
			} else if (m._oldColor) {
				if (m.color) m.color.copy(m._oldColor);
				m._oldColor = null;
			}
		};
		handle.traverse(o => apply(o.material));
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
	
		// --- Rotate axis (rings) ---
		else if (id === 'rX' || id === 'rY' || id === 'rZ') {
			kind = 'rotate-axis';
			axis = (id === 'rX') ? axX : (id === 'rY') ? axY : axZ;
			plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis.clone(), worldPos);
			startPoint = this._raycastToPlane(plane);
		}
	
		// --- Scale axis (boxes) ---
		else if (id === 'sX' || id === 'sY' || id === 'sZ') {
			kind = 'scale-axis';
			axis = (id === 'sX') ? axX : (id === 'sY') ? axY : axZ;
			plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this._viewNormal(worldPos), worldPos);
			t0 = this._projectRayToAxis(this._raycaster.ray, worldPos, axis);
		}
	
		// --- Scale uniform (white box) ---
		else if (id === 'sU') {
			kind = 'scale-uniform';
			plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this._viewNormal(worldPos), worldPos);
			startPoint = this._raycastToPlane(plane);
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
	
		// --- Rotate axis ---
		else if (d.kind === 'rotate-axis') {
			const hit = this._raycastToPlane(d.plane);
			if (!hit || !d.startPoint) return;
			const from = d.startPoint.clone().sub(d.worldPos).projectOnPlane(d.axis).normalize();
			const to   = hit.clone().sub(d.worldPos).projectOnPlane(d.axis).normalize();
			let angle = Math.atan2(from.clone().cross(to).dot(d.axis), from.dot(to));
			if (this.snap.rotate) {
				const step = THREE.MathUtils.degToRad(this.snap.rotate);
				angle = Math.round(angle / step) * step;
			}
			const q = new THREE.Quaternion().setFromAxisAngle(d.axis, angle);
			this.object.quaternion.copy(d.startObjQuat).premultiply(q);
			this.object.updateMatrixWorld();
		}
	
		// --- Scale axis ---
		else if (d.kind === 'scale-axis') {
			const tNow = this._projectRayToAxis(ray, d.worldPos, d.axis);
			if (tNow == null || d.t0 == null) return;
			const delta = tNow - d.t0;
			let s = 1 + delta;
			if (this.snap.scale) {
				const step = this.snap.scale;
				s = Math.round(s / step) * step;
			}
			const scale = d.startObjScale.clone();
			if (Math.abs(d.axis.x) > 0.5) scale.x *= s;
			if (Math.abs(d.axis.y) > 0.5) scale.y *= s;
			if (Math.abs(d.axis.z) > 0.5) scale.z *= s;
			this.object.scale.copy(scale);
			this.object.updateMatrixWorld();
		}
	
		// --- Scale uniform ---
		else if (d.kind === 'scale-uniform') {
			const hit = this._raycastToPlane(d.plane);
			if (!hit || !d.startPoint) return;
			const delta = hit.clone().sub(d.startPoint);
			let s = 1 + delta.length() * Math.sign(delta.dot(this._viewNormal(d.worldPos)));
			if (this.snap.scale) {
				const step = this.snap.scale;
				s = Math.round(s / step) * step;
			}
			this.object.scale.copy(d.startObjScale.clone().multiplyScalar(s));
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
	
	_getMouseNDC() {
		const rect = this.dom.getBoundingClientRect();
		const mouse = _input.getMousePosition();
		return {
			x: ((mouse.x - rect.left) / rect.width) * 2 - 1,
			y: -((mouse.y - rect.top) / rect.height) * 2 + 1
		};
	}
}