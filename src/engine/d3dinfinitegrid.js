const THREE = require('three');

export default class D3DInfiniteGrid extends THREE.Object3D {
	constructor({
		size = 500,        // size of the grid
		color1 = 0x444444, // fine lines
		color2 = 0x222222  // coarse lines
	} = {}) {
		super();

		// Create the grid helper
		const grid = new THREE.GridHelper(size, size, color1, color2);
		grid.position.y = 0;
		grid.material.transparent = true;
		grid.material.depthWrite = false; // so objects appear over the grid

		this.add(grid);

		this.grid = grid;
	}
}