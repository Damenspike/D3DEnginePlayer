import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

const minimumVertexCount = 20;

export default class AutoLODManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		
		this.levelStore = [];
		
	}
	
	get levels() {
		return this.component.properties.levels;
	}
	set levels(v) {
		this.component.properties.levels = Number(v) || 1;
	}
	
	get maxDistance() {
		return this.component.properties.maxDistance;
	}
	set maxDistance(v) {
		this.component.properties.maxDistance = Number(v) || 1;
	}
	
	get cameraName() {
		return this.component.properties.cameraName;
	}
	set cameraName(v) {
		this.component.properties.cameraName = v;
	}
	
	get simplification() {
		return this.component.properties.simplification || 0.25;
	}
	set simplification(v) {
		this.component.properties.simplification = Number(v) || 0.25;
	}
	
	get applyToChildren() {
		return !!this.component.properties.applyToChildren;
	}
	set applyToChildren(v) {
		this.component.properties.applyToChildren = !!v;
	}
	
	generateLevels() {
		const modifier = new SimplifyModifier();
		const levels = this.levels;
		const simplification = this.simplification;
		
		this.levelStore = [];
		
		const addToLevelStore = (d3dobj) => {
			if(d3dobj?.object3d?.isMesh && !d3dobj?.object3d?.isSkinnedMesh) {
				const mesh = d3dobj.object3d;
				const lod0geom = d3dobj.__lod0geom || mesh.geometry;
				
				d3dobj.__lod0geom = lod0geom;
				
				this.levelStore.push({ d3dobj, mesh, geometries: [lod0geom] });
			}
		}
		
		if(this.applyToChildren)
			this.d3dobject.traverse(d3dobj => addToLevelStore(d3dobj));
		else
			addToLevelStore(this.d3dobject);
		
		this.levelStore.forEach(({ d3dobj, mesh, geometries }) => {
			const baseGeometry = geometries[0];
			if (!baseGeometry) return;
		
			// Normalize for SimplifyModifier: non-indexed clone
			const source = baseGeometry.index
				? baseGeometry.toNonIndexed()
				: baseGeometry.clone();
		
			const posAttr = source.attributes?.position;
			const vertexCount = posAttr?.count || 0;
		
			if (!vertexCount || vertexCount < minimumVertexCount || !Number.isFinite(vertexCount)) {
				console.warn('Skipping LOD gen (bad vertexCount)', {
					obj: d3dobj.name,
					vertexCount
				});
				return;
			}
		
			// Optional: ensure triangles (count % 3 === 0)
			if (vertexCount % 3 !== 0) {
				console.warn('Non-triangular geometry, skipping simplify for', d3dobj.name, vertexCount);
				return;
			}
		
			for (let i = 1; i < levels; i++) {
				const removeVerts = Math.floor((vertexCount / levels) * i * simplification);
		
				if (!Number.isFinite(removeVerts) || removeVerts <= 0) {
					console.warn('Skipping LOD level (bad removeVerts)', {
						obj: d3dobj.name,
						vertexCount,
						levels,
						i,
						removeVerts
					});
					break;
				}
				if (removeVerts >= vertexCount) {
					// No point simplifying to >= original vertex count
					continue;
				}
		
				let lodGeom;
				try {
					lodGeom = modifier.modify(source, removeVerts);
				} catch (e) {
					console.warn('SimplifyModifier.modify failed for', d3dobj.name, {
						removeVerts,
						vertexCount
					}, e);
					break;
				}
		
				if (!lodGeom || !lodGeom.attributes?.position) {
					console.warn('SimplifyModifier produced invalid geometry for', d3dobj.name);
					break;
				}
		
				geometries.push(lodGeom);
			}
		});
	}
	updateComponent() {
		if(!this.lastProperties || JSON.stringify(this.component.properties) != JSON.stringify(this.lastProperties)) {
			this.generateLevels();
			this.currentLODLevel = -1; // force refresh
			this.lastProperties = {...this.component.properties};
		}
	}
	
	__onInternalEnterFrame() {
		if(window._editor)
			this.camera = _editor.cameraD3D;
		
		const camera = this.camera || this.d3dobject.root.find(this.cameraName);
		const levels = this.levels;
		const maxDistance = this.maxDistance;
		
		if(!camera)
			return;
		
		const distToMe = this.d3dobject.worldPosition.distanceTo(camera.worldPosition);
		
		if(distToMe > maxDistance) {
			this.d3dobject.visible = false;
			return;
		}else{
			this.d3dobject.visible = true;
		}
		
		let desiredLevel = Math.floor(distToMe / maxDistance * levels);
		
		if (desiredLevel < 0) 
			desiredLevel = 0;
			
		if (desiredLevel >= levels) 
			desiredLevel = levels - 1;
			
		if(this.currentLODLevel == desiredLevel)
			return;
			
		let changed = 0;
		
		this.levelStore.forEach(({d3dobj, mesh, geometries}) => {
			let lodGeom = geometries[desiredLevel] || geometries[desiredLevel-1] || geometries[desiredLevel-2] || geometries[desiredLevel-3] || geometries[0];
			
			if(!lodGeom) {
				console.warn(`LOD geometry for ${d3dobj.name} at quality level ${desiredLevel} is not defined`);
				return;
			}
			
			mesh.geometry = lodGeom;
			changed++;
		});
		
		console.log(`Changed ${changed} meshes to LOD level ${desiredLevel}`);
		
		this.currentLODLevel = desiredLevel;
	}
}