export default class D3DAutoLODMaster {
	constructor() {
		this.autoLODs = new Set();
	}
	
	add(autolod) {
		if(!this.autoLODs.has(autolod))
			this.autoLODs.add(autolod);
	}
	remove(autolod) {
		if(this.autoLODs.has(autolod))
			this.autoLODs.delete(autolod);
	}
	
	updateAll() {
		const now = _time.now;
		const maxBillboards = _graphics.maxBillboards;
		const instancesToUpdate = [];
		let billboards = 0;
		
		this.autoLODs.forEach(autoLOD => {
			if(!autoLOD.component.enabled)
				return;
				
			const camera = autoLOD.camera || autoLOD.getCamera();
			const levels = autoLOD.levels;
			const maxDistance = autoLOD.maxDistance;
			
			if(!camera)
				return;
			
			autoLOD.camera = camera;
			
			const camPos = camera.worldPosition;
			const c = autoLOD.center;
			const dx = c.x - camPos.x;
			const dy = c.y - camPos.y;
			const dz = c.z - camPos.z;
			const distSq = dx*dx + dy*dy + dz*dz;
			const maxDistSq = maxDistance * maxDistance;
			
			if(!autoLOD.lastDistanceCalculate || now - autoLOD.lastDistanceCalculate > 0.5) {
				autoLOD.distanceFromCamera = distSq;
				autoLOD.lastDistanceCalculate = now;
			}
			
			autoLOD.maxDistSq = maxDistSq;
			
			if(distSq > maxDistSq) {
				autoLOD.makeAllLevelsVisible(false);
				autoLOD.d3dobject.__lodCulled = true;
				autoLOD.currentLODLevel = -1;
				autoLOD._instancedCulled = true;
				
				if(autoLOD.billboardWhenCulled && billboards < maxBillboards) {
					if(autoLOD.billboardInstancing) {
						
						// Always hide mesh billboard if we're instancing
						if(autoLOD.billboardMesh && autoLOD.billboardMesh.visible)
							autoLOD.billboardMesh.visible = false;
						
						if(autoLOD.billboardInstanceId)
							_instancing.setInstanceDirty(autoLOD.billboardInstanceId, autoLOD.billboardSubmeshMock);
						
					}else
					if(autoLOD.billboardMesh) {
						if(!autoLOD.billboardMesh.visible)
							autoLOD.billboardMesh.visible = true;
					}
					
					if(autoLOD.billboardMesh) {
						if(!autoLOD.lastSyncBB || now - autoLOD.lastSyncBB > 0.1) {
							const mesh = autoLOD.billboardMesh;
							const parent = mesh.parent;
							
							mesh.getWorldPosition(autoLOD._bbWP || (autoLOD._bbWP = new THREE.Vector3()));
							camera.object3d.getWorldPosition(autoLOD._bbCP || (autoLOD._bbCP = new THREE.Vector3()));
							
							const wp = autoLOD._bbWP;
							const cp = autoLOD._bbCP;
							
							const dx = cp.x - wp.x;
							const dz = cp.z - wp.z;
							
							const yaw = Math.atan2(dx, dz);
							
							if(parent) {
								parent.getWorldQuaternion(autoLOD.tmpQ2).invert();
								autoLOD.tmpQ1.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
								mesh.quaternion.copy(autoLOD.tmpQ1).premultiply(autoLOD.tmpQ2);
							}else{
								mesh.rotation.set(0, yaw, 0);
							}
							
							if(autoLOD.billboardInstancing) {
								_instancing.updateSubmeshMatrix(autoLOD.billboardInstanceId, autoLOD.billboardSubmeshMock);
								if(!instancesToUpdate.includes(autoLOD.billboardInstanceId))
									instancesToUpdate.push(autoLOD.billboardInstanceId);
							}
							
							autoLOD.lastSyncBB = now;
						}
						
						billboards++;
					}
				}
				return;
			}else{
				if(autoLOD.billboardInstancing) {
					// Always hide mesh billboard if we're instancing
					if(autoLOD.billboardMesh && autoLOD.billboardMesh.visible)
						autoLOD.billboardMesh.visible = false;
					
					if(autoLOD.billboardInstanceId)
						_instancing.removeFromInstance(autoLOD.billboardInstanceId, autoLOD.billboardSubmeshMock);
				}else
				if(autoLOD.billboardMesh && autoLOD.billboardMesh.visible) {
					autoLOD.billboardMesh.visible = false;
				}
				
				autoLOD.d3dobject.__lodCulled = false;
				autoLOD._instancedCulled = false;
			}
			
			let desiredLevel = Math.floor(distSq / (maxDistSq / levels));
			
			if (desiredLevel < 0) 
				desiredLevel = 0;
			else
			if (desiredLevel >= levels) 
				desiredLevel = levels - 1;
				
			if(autoLOD.currentLODLevel == desiredLevel) 
				return;
			
			autoLOD.setLevel(desiredLevel);
		});
		
		instancesToUpdate.forEach(instanceId => _instancing.markAsNeedsUpdate(instanceId));
		
		_graphics.billboards = billboards;
	}
}