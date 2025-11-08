import * as THREE from 'three';

export default class D3DInfiniteGrid extends THREE.Object3D {
	constructor({
		size = 500,
		divisions = 500,
		color1 = 0x888888,
		color2 = 0x444444,
		fadeDistance = 5,  // start fading out here
		fadeStrength = 2.0   // higher = fades faster
	} = {}) {
		super();

		const grid = new THREE.GridHelper(size, divisions, color1, color2);
		grid.position.y = 0;
		grid.material = grid.material.clone();
		grid.material.transparent = true;
		grid.material.depthWrite = false;
		grid.renderOrder = -1000;

		// convert the existing grid material to a ShaderMaterial-like effect
		grid.onBeforeRender = (renderer, scene, camera) => {
			const camPos = camera.position;
			const fadeStart = fadeDistance;
			const fadeEnd = fadeDistance * fadeStrength;
			const fadeRange = fadeEnd - fadeStart;

			// update the material opacity dynamically based on camera height/distance
			const gridPos = new THREE.Vector3();
			grid.getWorldPosition(gridPos);
			const dist = camPos.distanceTo(gridPos);
			let fade = 1.0 - Math.max(0, Math.min(1, (dist - fadeStart) / fadeRange));
			grid.material.opacity = fade * 0.75; // max opacity 0.75 for subtle effect
		};

		this.add(grid);
		this.grid = grid;
	}
}