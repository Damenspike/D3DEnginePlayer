// rig-binding.js
// Create-or-rebind D3D "Rig" to the live THREE.Bone skeleton.
// - If no Rig exists: builds it from the skeleton (all bones).
// - If Rig exists: rebinds nodes hierarchically (handles duplicate names).
// - Ensures complete coverage: any missing bones get created & bound.
// - Preserves D3D-authored local TRS on rebind.

export async function ensureRigAndBind(hostD3DObject, modelScene) {
	if (!hostD3DObject || !modelScene) return;

	// Give the scene a beat to materialize saved children (Rig, etc.)
	await _twoFrames();

	// Index the live skeleton once
	const skel = _indexSkeleton(modelScene);
	if (!skel.rootBones.length) return; // no skeleton present

	// Find or create Rig root
	let rig = _findDirectChildByName(hostD3DObject, 'Rig');
	if (!rig) {
		rig = await hostD3DObject.createObject({
			name: 'Rig',
			position: { x: 0, y: 0, z: 0 },
			rotation: { x: 0, y: 0, z: 0 },
			scale:    { x: 1, y: 1, z: 1 }
		});
	}

	// Parent-guided pass: rebind any existing D3D bone children under Rig,
	// then create/bind any skeleton bones that weren't covered.
	await _rebindOrCreateChildren(rig, /*parentBone*/ null, skel);

	// Done: every bone is either rebound or created & bound.
}

/* =================== internals =================== */

function _twoFrames() {
	return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function _findDirectChildByName(d3d, name) {
	if (!d3d?.children?.length) return null;
	for (const c of d3d.children) if (c?.name === name) return c;
	return null;
}

/** Build per-parent bone index for hierarchical matching and full coverage. */
function _indexSkeleton(scene) {
	const byParentNameBuckets = new Map(); // parentBone -> Map(name -> Bone[])
	const byParentAll = new Map();         // parentBone -> Bone[] (all children, any name)
	const rootSet = new Set();

	scene.traverse(o => {
		if (!o?.isBone) return;

		const parent = (o.parent && o.parent.isBone) ? o.parent : null;

		// bucket by name
		if (!byParentNameBuckets.has(parent)) byParentNameBuckets.set(parent, new Map());
		const map = byParentNameBuckets.get(parent);
		const list = map.get(o.name) || [];
		list.push(o);
		map.set(o.name, list);

		// bucket all children
		if (!byParentAll.has(parent)) byParentAll.set(parent, []);
		byParentAll.get(parent).push(o);

		// collect roots
		if (!parent) rootSet.add(o);
	});

	// keep original order (Three preserves child order) — nothing to sort here.
	return {
		rootBones: Array.from(rootSet),
		childrenByParentByName: byParentNameBuckets,
		childrenByParentAll: byParentAll,
		used: new Set()
	};
}

/** Depth-first: for the given D3D parent (Rig or a D3D bone), bind its children under the matching parentBone. */
async function _rebindOrCreateChildren(parentD3D, parentBone, skel) {
	// 1) Rebind existing D3D children hierarchically (parent-guided)
	for (const d3dChild of parentD3D.children || []) {
		const chosen = _selectBoneForD3DChild(d3dChild, parentBone, skel);
		if (chosen) {
			_bindD3DToBonePreserveLocal(d3dChild, chosen);
			skel.used.add(chosen);
			// Recurse with this chosen bone as new parent
			await _rebindOrCreateChildren(d3dChild, chosen, skel);
		} else {
			// No match now — still recurse without advancing parentBone;
			// later coverage pass will create any missing ones.
			await _rebindOrCreateChildren(d3dChild, parentBone, skel);
		}
	}

	// 2) Coverage: create any skeleton child bones that were not rebound above
	const remaining = _remainingChildren(parentBone, skel);
	for (const bone of remaining) {
		const d3d = await parentD3D.createObject({ name: bone.name || 'Bone' });

		// Preload local TRS so replaceObject3D preserves pose relative to the new parent
		d3d.object3d.position.copy(bone.position);
		d3d.object3d.quaternion.copy(bone.quaternion);
		d3d.object3d.scale.copy(bone.scale);
		d3d.object3d.updateMatrix();

		// Bind
		d3d.replaceObject3D(bone, { keepChildren: true });

		// Belt & suspenders: re-apply local
		bone.position.copy(d3d.object3d.position);
		bone.quaternion.copy(d3d.object3d.quaternion);
		bone.scale.copy(d3d.object3d.scale);
		bone.updateMatrix();
		bone.updateMatrixWorld(true);

		skel.used.add(bone);

		// Recurse to ensure full subtree
		await _rebindOrCreateChildren(d3d, bone, skel);
	}
}

/** Choose a bone under parentBone that matches this D3D child (by name + sibling index, unused). */
function _selectBoneForD3DChild(d3dChild, parentBone, skel) {
	const name = d3dChild?.name || '';
	const occ = _d3dSiblingIndex(d3dChild);

	// Candidate set under the correct parent:
	if (!parentBone) {
		// At skeleton roots: filter by name, then pick occ-th unused
		const candidates = skel.rootBones.filter(b => (b.name || '') === name);
		if (candidates.length) {
			const chosen = _pickByOccurrence(candidates, occ, skel.used);
			if (chosen) return chosen;
		}
		// fallback: any root with same name that's unused
		for (const b of skel.rootBones) if ((b.name || '') === name && !skel.used.has(b)) return b;
		return null;
	}

	// Under a parentBone: look at its children with matching name
	const byName = skel.childrenByParentByName.get(parentBone) || new Map();
	const list = byName.get(name) || [];

	if (list.length) {
		const chosen = _pickByOccurrence(list, occ, skel.used);
		if (chosen) return chosen;
		// fallback: first unused with same name
		for (const b of list) if (!skel.used.has(b)) return b;
	}

	return null;
}

/** Return the children of parentBone that are not yet used. For roots, “children” = root bones. */
function _remainingChildren(parentBone, skel) {
	const out = [];
	if (!parentBone) {
		for (const b of skel.rootBones) if (!skel.used.has(b)) out.push(b);
		return out;
	}
	const all = skel.childrenByParentAll.get(parentBone) || [];
	for (const b of all) if (!skel.used.has(b)) out.push(b);
	return out;
}

/** 0-based sibling index of this D3D among same-named siblings (for disambiguation). */
function _d3dSiblingIndex(d3d) {
	const name = d3d?.name || '';
	const parent = d3d?.parent || null;
	if (!parent?.children) return 0;
	let occ = 0;
	for (const sib of parent.children) {
		if (sib === d3d) break;
		if ((sib?.name || '') === name) occ++;
	}
	return occ;
}

/** Pick the occ-th unused item from list; if that’s taken, next unused after it. */
function _pickByOccurrence(list, occ, usedSet) {
	// exact occ-th unused
	let seen = 0;
	for (const b of list) {
		if (usedSet.has(b)) continue;
		if (seen === occ) return b;
		seen++;
	}
	// else first unused
	for (const b of list) if (!usedSet.has(b)) return b;
	return null;
}

/** Bind: swap D3D’s backing object to Bone, preserving current D3D local TRS. */
function _bindD3DToBonePreserveLocal(d3d, bone) {
	const pos  = d3d.object3d.position.clone();
	const quat = d3d.object3d.quaternion.clone();
	const scl  = d3d.object3d.scale.clone();

	d3d.replaceObject3D(bone, { keepChildren: true });

	bone.position.copy(pos);
	bone.quaternion.copy(quat);
	bone.scale.copy(scl);
	bone.updateMatrix();
	bone.updateMatrixWorld(true);
}