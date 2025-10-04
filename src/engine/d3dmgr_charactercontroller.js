export default function CharacterControllerManager(d3dobject, component) {
	let inited = false;

	// per-controller state (lives with the component so hot-reload is safer)
	component._state = component._state || {
		yaw: 0,          // facing (radians, Y-axis only)
		vy: 0,           // vertical velocity
		air: true,       // airborne flag
		kcc: null,       // Rapier CharacterController
		collider: null,  // our collider handle (first on the RB)
	};

	this.updateComponent = () => {
		if (!_physics?.ready) return;
		if (!inited) setup();
		drive(); // Call drive directly each frame
	};

	this.dispose = () => {
		// stop driving each frame
		if (d3dobject.__onEnterFrame === drive) {
			d3dobject.__onEnterFrame = null;
		}
		// keep kcc instance; Rapier owns it, no explicit dispose
		// clear local references
		component._state.kcc = null;
		component._state.collider = null;
		inited = false;
	};

	/* -------------------- setup -------------------- */

	function setup() {
		d3dobject.__onEnterFrame = drive; // Use single underscore
		inited = true;
	}

	/* -------------------- frame logic -------------------- */

	function drive() {
		if (!_physics?.ready) return;

		// --- read schema properties with sensible defaults ---
		const props = component.properties || {};
		const moveSpeed       = Number(props.moveSpeed ?? 2);
		const turnSpeed       = Number(props.turnSpeed ?? 8);
		const jumpHeight      = Number(props.jumpHeight ?? 6);
		const gravityStrength = Number(props.gravityStrength ?? 1); // scales world gravity

		const state = component._state;
		const camera = _root.camera;

		// ensure controller + collider
		ensureController(state);
		
		if(!d3dobject.getComponent('Rigidbody')) {
			// Add a kinematic rigidbody
			d3dobject.addComponent('Rigidbody', {
				kind: 'kinematicPosition'
			});
		}

		const rbMgr = d3dobject.getComponent('Rigidbody');
		const rb = _physics.getBody(d3dobject);

		if (!rbMgr || !rb || !state.kcc || !state.collider) return;

		const dt = _time.delta;

		// ---------- 1) build flat camera basis (ignore pitch) ----------
		let fx = camera.forward.x, fz = camera.forward.z;
		const fl = Math.hypot(fx, fz) || 1;
		fx /= fl; fz /= fl;
		const rx = fz;
		const rz = -fx;

		// ---------- 2) input in camera space ----------
		const input = _input.getControllerAxis(); // x: right/left, y: forward/back
		let mx = fx * input.y + rx * input.x;
		let mz = fz * input.y + rz * input.x;
		const ml = Math.hypot(mx, mz);
		if (ml > 1e-6) { mx /= ml; mz /= ml; }

		// ---------- 3) turn smoothly toward move direction ----------
		if (ml > 1e-6) {
			const targetYaw = Math.atan2(mx, mz);
			let delta = wrapAngle(targetYaw - state.yaw);
			const maxTurn = turnSpeed * dt;
			if (delta > maxTurn) delta = maxTurn;
			if (delta < -maxTurn) delta = -maxTurn;
			state.yaw = wrapAngle(state.yaw + delta);
		}

		// ---------- 4) vertical integration (jump + gravity) ----------
		const worldG = (_physics.world?.gravity?.y ?? -9.81);
		const g = worldG * gravityStrength;

		if (!state.air && _input.getKeyDown('Space')) {
			const v0 = Math.sqrt(Math.max(0, -2 * g * Math.max(0, jumpHeight)));
			state.vy = v0;
			state.air = true;
		} else {
			state.vy += g * dt;
		}

		// ---------- 5) desired displacement this frame ----------
		const dx = (ml > 1e-6 ? mx * moveSpeed * dt : 0);
		const dz = (ml > 1e-6 ? mz * moveSpeed * dt : 0);
		const dy = state.vy * dt;

		// ---------- 6) query-based clamp: CharacterController ----------
		const currentPos = rb.translation();
		const mv = _physics.kccMove(state.kcc, state.collider, { x: dx, y: dy, z: dz }, rb);
		const nextPos = {
			x: currentPos.x + mv.x,
			y: currentPos.y + mv.y,
			z: currentPos.z + mv.z
		};

		// ---------- 7) grounded / ceiling detection ----------
		if (dy < 0 && Math.abs(mv.y - dy) > 0.001) { // Increased threshold
			state.air = false;
			state.vy = 0;
		} else if (dy > 0 && Math.abs(mv.y - dy) > 0.001) {
			state.vy = 0;
		}

		// ---------- 8) apply transform ----------
		rbMgr.setTransform(nextPos, quatFromYaw(state.yaw));

		// ---------- 9) update visual state (optional for prediction) ----------
		d3dobject.position = nextPos;
		d3dobject.rotation = { x: 0, y: state.yaw, z: 0 };
	}

	/* -------------------- utils -------------------- */

	function ensureController(state) {
		// cache our first collider from physics pack
		if (!state.collider) {
			const pack = _physics._bodies?.get?.(d3dobject.uuid);
			if (pack && pack.colliders && pack.colliders.length) {
				state.collider = pack.colliders[0];
			}
		}
		// create one KCC (Rapier character controller)
		if (!state.kcc) {
			state.kcc = _physics.createKCC(0.02, 50, 50); // snap=2cm, slope limits
			state.kcc.enableAutostep(0.35, 0.35, true); // Allow climbing small steps
			state.kcc.enableSnapToGround(0.1); // Ensure grounding
		}
	}

	function wrapAngle(a) {
		while (a > Math.PI) a -= Math.PI * 2;
		while (a < -Math.PI) a += Math.PI * 2;
		return a;
	}

	function quatFromYaw(y) {
		const h = y * 0.5;
		return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
	}
}