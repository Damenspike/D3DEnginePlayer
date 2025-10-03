// RigidbodyManager.js
export default function RigidbodyManager(d3dobject, component) {
	// cache last applied settings to know when to rebuild
	component._cache = null;
	component._rb = null;

	this.updateComponent = () => {
		const next = readComponent();
		if (!component.bodySetup) {
			setupBody(next);
			component.bodySetup = true;
			component._cache = next;
			return;
		}

		// if any editable field changed, rebuild (simplest + robust)
		if (changed(component._cache, next)) {
			teardownBody();
			setupBody(next);
			component._cache = next;
		} else {
			// (future) light updates could go here (e.g., friction tweak)
		}
	};

	this.dispose = () => {
		teardownBody();
		component.bodySetup = false;
		component._cache = null;
	};

	/* ----------------------- helpers ----------------------- */

	function readComponent() {
		// Read current editor fields
		const kind        = component.kind || 'dynamic';
		const shapeType   = component.shape || 'trimesh';
		const friction    = Number(component.friction ?? 0.5);
		const restitution = Number(component.bounciness ?? 0.5);
		const density     = Number(component.density ?? 1.0);

		// Build shape descriptor from object3d geometry
		const shape = buildShapeFromObject(d3dobject, shapeType);

		return { kind, shapeType, shape, friction, restitution, density };
	}

	function changed(prev, next) {
		if (!prev) return true;
		// Compare primitives
		if (prev.kind !== next.kind) return true;
		if (prev.shapeType !== next.shapeType) return true;
		if (prev.friction !== next.friction) return true;
		if (prev.restitution !== next.restitution) return true;
		if (prev.density !== next.density) return true;

		// For shapes, compare key params
		return shapeChanged(prev.shape, next.shape);
	}

	function shapeChanged(a, b) {
		if (a.type !== b.type) return true;
		switch (a.type) {
			case 'box':     return a.hx !== b.hx || a.hy !== b.hy || a.hz !== b.hz;
			case 'sphere':  return a.r !== b.r;
			case 'capsule': return a.halfHeight !== b.halfHeight || a.radius !== b.radius;
			case 'trimesh': return a.vertices !== b.vertices || a.indices !== b.indices;
			case 'convex':  return a.vertices !== b.vertices;
			default: return true;
		}
	}

	function setupBody(opts) {
		// Expect global _physics: class instance with addRigidBody(...) as we built
		const rb = _physics.addRigidBody(d3dobject, {
			kind: opts.kind,
			shape: opts.shape,
			friction: clamp01(opts.friction),
			restitution: clamp01(opts.restitution),
			density: Math.max(0.000001, opts.density)
		});

		component._rb = rb;

		// If your _physics.addRigidBody didn’t set density/rest after creation,
		// you can optionally reach colliders and set them here:
		// const pack = _physics._bodies?.get(d3dobject.uuid); // if exposed
		// pack?.colliders?.forEach(c => {
		// 	c.setFriction(clamp01(opts.friction));
		// 	c.setRestitution(clamp01(opts.restitution));
		// 	c.setDensity(Math.max(0.000001, opts.density));
		// });
	}

	function teardownBody() {
		if (component._rb) {
			_physics.remove(d3dobject);
			component._rb = null;
		}
	}

	function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

	/* ------------ shape builders from geometry ------------- */

	function buildShapeFromObject(obj, shapeType) {
		const geom = obj.object3d.geometry;

		switch (shapeType) {
			case 'box': {
				geom.computeBoundingBox();
				const bb = geom.boundingBox;
				const hx = (bb.max.x - bb.min.x) * 0.5;
				const hy = (bb.max.y - bb.min.y) * 0.5;
				const hz = (bb.max.z - bb.min.z) * 0.5;
				return { type: 'box', hx, hy, hz };
			}

			case 'sphere': {
				geom.computeBoundingSphere();
				const r = geom.boundingSphere.radius;
				return { type: 'sphere', r };
			}

			case 'capsule': {
				// Approximate from bounding box: radius from XZ, height from Y
				geom.computeBoundingBox();
				const bb = geom.boundingBox;
				const hx = (bb.max.x - bb.min.x) * 0.5;
				const hy = (bb.max.y - bb.min.y) * 0.5;
				const hz = (bb.max.z - bb.min.z) * 0.5;

				const radius = Math.max(hx, hz);
				const halfHeight = Math.max(0, hy - radius);
				return { type: 'capsule', halfHeight, radius };
			}

			case 'convex': {
				// Use mesh vertices (world transform NOT applied; physics body starts at current transform)
				const verts = getVerticesFloat32(geom);
				return { type: 'convex', vertices: verts };
			}

			case 'trimesh':
			default: {
				const { vertices, indices } = getTriMeshBuffers(geom);
				return { type: 'trimesh', vertices, indices };
			}
		}
	}

	function getVerticesFloat32(geom) {
		const pa = geom.attributes.position;
		// Ensure Float32Array (Rapier expects typed arrays)
		return (pa.array instanceof Float32Array) ? pa.array : new Float32Array(pa.array);
	}

	function getTriMeshBuffers(geom) {
		const vertices = getVerticesFloat32(geom);
		let indices;
		if (geom.index && geom.index.array) {
			const src = geom.index.array;
			indices = (src instanceof Uint32Array) ? src
				: (src instanceof Uint16Array ? new Uint32Array(src) : new Uint32Array(src));
		} else {
			// generate a trivial index buffer [0..N-1]
			const triCount = vertices.length / 3;
			indices = new Uint32Array(triCount);
			for (let i = 0; i < triCount; i++) indices[i] = i;
		}
		return { vertices, indices };
	}
}