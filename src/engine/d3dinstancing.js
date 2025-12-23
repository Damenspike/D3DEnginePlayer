import * as THREE from 'three';

const MAX_PER_BATCH = 1024;

export default class D3DInstancing {
	constructor() {
		this.instances = {};
		this.submeshes = {};
		this.dirtyInstances = [];
	}
	
	setInstanceDirty(instanceId, submesh) {
		if(!this.submeshes[instanceId])
			this.submeshes[instanceId] = [];
		
		if(!this.submeshes[instanceId].includes(submesh)) {
			this.submeshes[instanceId].push(submesh);
			
			// Only make dirty if needed
			if(!this.dirtyInstances.includes(instanceId))
				this.dirtyInstances.push(instanceId);
		}
	}
	buildDirtyInstances() {
		if(this.dirtyInstances.length < 1)
			return;
		
		this.dirtyInstances.forEach(instanceId => this.buildInstance(instanceId));
		this.dirtyInstances.length = 0;
	}
	buildInstance(instanceId) {
		if(!instanceId)
			throw new Error('Invalid instance ID passed to rebuild');
		
		const scene = _root.object3d;
		const submeshes = this.submeshes[instanceId] || [];
		
		let instance = this.instances[instanceId];
		
		if(instance && submeshes.length < 1) {
			console.warn(`No submeshes to build as part of ${instanceId}. Deleting instance...`);
			
			instance.batches.forEach(b => {
				scene.remove(b.instancedMesh);
				b.instancedMesh.dispose?.();
			});
			
			delete this.instances[instanceId];
			delete this.submeshes[instanceId];
			return;
		}
		if(!instance) {
			const geometry = submeshes[0].d3dobject.object3d.geometry;
			const material = submeshes[0].d3dobject.object3d.material;
			
			instance = {
				geometry,
				material,
				submeshes: [],
				indexBySubmesh: new WeakMap(),
				batches: []
			};
			
			this.instances[instanceId] = instance;
		}
		
		[...instance.submeshes].forEach(submesh => {
			if(!submeshes.includes(submesh))
				this.removeFromInstance(instanceId, submesh);
		});
		submeshes.forEach(submesh => {
			if(!instance.submeshes.includes(submesh))
				this.addToInstance(instanceId, submesh);
		});
	}
	createBatch(instanceId) {
		const instance = this.instances[instanceId];
		const scene = _root.object3d;
		
		const batch = {
			submeshes: [],
			indexBySubmesh: new WeakMap(),
			instancedMesh: new THREE.InstancedMesh(
				instance.geometry,
				instance.material,
				MAX_PER_BATCH
			)
		};
		
		batch.instancedMesh.count = 0;
		scene.add(batch.instancedMesh);
		
		instance.batches.push(batch);
		
		return batch;
	}
	removeFromInstance(instanceId, submesh) {
		const instance = this.instances[instanceId];
		
		if(!instance)
			return;
		
		const batch = instance.indexBySubmesh.get(submesh);
		if(!batch)
			return;
		
		const im = batch.instancedMesh;
		const idx = batch.indexBySubmesh.get(submesh);
		if(idx === undefined)
			return;
		
		const lastIdx = batch.submeshes.length - 1;
		const lastSubmesh = batch.submeshes[lastIdx];
		
		if(idx !== lastIdx) {
			batch.submeshes[idx] = lastSubmesh;
			
			const tmp = batch._tmpMatrix || (batch._tmpMatrix = new THREE.Matrix4());
			im.getMatrixAt(lastIdx, tmp);
			im.setMatrixAt(idx, tmp);
			
			batch.indexBySubmesh.set(lastSubmesh, idx);
		}
		
		batch.submeshes.pop();
		batch.indexBySubmesh.delete(submesh);
		instance.indexBySubmesh.delete(submesh);
		
		const submeshes = this.submeshes[instanceId];
		if(Array.isArray(submeshes)) {
			const i = submeshes.indexOf(submesh);
			
			if(i > -1)
				submeshes.splice(i, 1);
			
			if(submeshes.length < 1)
				delete this.submeshes[instanceId];
		}
		
		const allIdx = instance.submeshes.indexOf(submesh);
		if(allIdx !== -1)
			instance.submeshes.splice(allIdx, 1);
		
		im.count = batch.submeshes.length;
		im.instanceMatrix.needsUpdate = true;
		im.computeBoundingSphere();
		im.computeBoundingBox?.();
		
		if(batch.submeshes.length < 1) {
			const scene = _root.object3d;
			scene.remove(im);
			im.dispose?.();
			
			instance.batches.splice(instance.batches.indexOf(batch), 1);
		}
	}
	addToInstance(instanceId, submesh) {
		const instance = this.instances[instanceId];
		
		if(!instance)
			return;
		
		let batch = null;
		
		for(let i = 0; i < instance.batches.length; i++) {
			if(instance.batches[i].submeshes.length < MAX_PER_BATCH) {
				batch = instance.batches[i];
				break;
			}
		}
		
		if(!batch)
			batch = this.createBatch(instanceId);
		
		const im = batch.instancedMesh;
		const idx = batch.submeshes.length;
		
		batch.submeshes.push(submesh);
		batch.indexBySubmesh.set(submesh, idx);
		
		instance.submeshes.push(submesh);
		instance.indexBySubmesh.set(submesh, batch);
		
		submesh.d3dobject.object3d.updateWorldMatrix(true, false);
		im.setMatrixAt(idx, submesh.d3dobject.object3d.matrixWorld);
		
		im.count = batch.submeshes.length;
		im.instanceMatrix.needsUpdate = true;
		im.computeBoundingSphere();
		im.computeBoundingBox?.();
	}
	updateSubmeshMatrix(instanceId, submesh, markUpdate = false) {
		const instance = this.instances[instanceId];
		if(!instance)
			return;
	
		const batch = instance.indexBySubmesh.get(submesh);
		if(!batch)
			return;
	
		const idx = batch.indexBySubmesh.get(submesh);
		if(idx === undefined)
			return;
	
		const im = batch.instancedMesh;
	
		submesh.d3dobject.object3d.updateWorldMatrix(true, false);
		im.setMatrixAt(idx, submesh.d3dobject.object3d.matrixWorld);
		
		if(markUpdate)
			this.markAsNeedsUpdate(instanceId);
	}
	markAsNeedsUpdate(instanceId) {
		const instance = this.instances[instanceId];
		if(!instance)
			return;
		
		instance.batches.forEach(batch => {
			const im = batch.instancedMesh;
			
			im.instanceMatrix.needsUpdate = true;
			im.computeBoundingSphere();
			im.computeBoundingBox?.();
		});
	}
}