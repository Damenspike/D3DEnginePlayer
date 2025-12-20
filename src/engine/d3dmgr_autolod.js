import D3DConsole from './d3dconsole.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import {
	getObjectsCenter,
	getMeshSignature
} from './d3dutility.js';
import {
	loadTexture
} from './d2dutility.js';

const minimumVertexCount = 20;

export default class AutoLODManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		
		if(!this.d3dobject.root.__lodGeoms)
			this.d3dobject.root.__lodGeoms = {};
		
		this.levelStore = [];
		this.sigsInUse = [];
	}
	
	get GEOM_SHARED() {
		return this.d3dobject.root.__lodGeoms;
	}
	get center() {
		const type = this.centerType;
		
		if(type == 'pivot')
			return this.d3dobject.worldPosition;
		else
		if(type == 'center')
			return this.centerBBox;
		else
			throw new Error(`Invalid center type ${type}`);
	}
	
	get centerType() {
		return this.component.properties.centerType;
	}
	set centerType(v) {
		this.component.properties.centerType = v;
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
	
	get billboardWhenCulled() {
		return !!this.component.properties.billboardWhenCulled;
	}
	set billboardWhenCulled(v) {
		this.component.properties.billboardWhenCulled = !!v;
	}
	
	get billboardTexture() {
		return this.component.properties.billboardTexture;
	}
	set billboardTexture(v) {
		this.component.properties.billboardTexture = v ? String(v) : '';
	}
	
	get billboardOffset() {
		return this.component.properties.billboardOffset ?? {x: 0, y: 0, z: 0};
	}
	set billboardOffset(v) {
		if(v?.x === undefined || v?.y === undefined || v?.z === undefined)
			v = {x: 0, y: 0, z: 0};
		
		this.component.properties.billboardOffset = v;
	}
	
	get billboardScale() {
		return this.component.properties.billboardScale ?? {x: 0, y: 0, z: 0};
	}
	set billboardScale(v) {
		if(v?.x === undefined || v?.y === undefined || v?.z === undefined)
			v = {x: 0, y: 0, z: 0};
		
		this.component.properties.billboardScale = v;
	}
	
	generateLevels() {
		const modifier = new SimplifyModifier();
		const levels = this.levels;
		const simplification = this.simplification;
		
		this.levelStore = [];
		this.sigsInUse = [];
		
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
				const meshSig = getMeshSignature(mesh);
				const sig = `${meshSig}_${removeVerts}`;
				
				let lodGeom = this.GEOM_SHARED[sig];
				
				if(!lodGeom) {
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
					
					this.GEOM_SHARED[sig] = lodGeom;
				}
				
				geometries.push(lodGeom);
				this.sigsInUse.push(sig);
			}
		});
	}
	async generateBillboard() {
		if(this.billboardLoading)
			return;
		
		const parent3d = this.d3dobject.object3d;
		
		if(!parent3d) {
			D3DConsole.error('No parent available to put the billboard sprite');
			return;
		}
		
		if(!this.billboardTexture)
			return;
		
		if(this.billboardMesh) {
			parent3d.remove(this.billboardMesh);
			if(this.billboardMesh.geometry)
				this.billboardMesh.geometry.dispose();
			if(this.billboardMesh.material)
				this.billboardMesh.material.dispose();
			this.billboardMesh = null;
		}
			
		const zip = this.d3dobject.root.zip;
		const rel = this.d3dobject.root.resolvePath(this.billboardTexture);
		
		if(!rel)
			return;
			
		this.billboardLoading = true;
		
		const texture = await loadTexture(rel, zip);
		
		const geo = new THREE.PlaneGeometry(1, 1);
		const mat = new THREE.MeshStandardMaterial({
			map: texture,
			transparent: true,
			alphaTest: 0.05,
			side: THREE.DoubleSide
		});
		
		const mesh = new THREE.Mesh(geo, mat);
		mesh.name = `${this.d3dobject.name}_billboard`;
		mesh.visible = false;
		mesh.layers.set(2);
		
		mesh.position.copy(this.billboardOffset);
		mesh.scale.copy(this.billboardScale);
		
		parent3d.add(mesh);
		
		this.billboardMesh = mesh;
		this.billboardLoading = false;
	}
	updateComponent(force = false) {
		this.centerBBox = getObjectsCenter([this.d3dobject]);
		
		if(!this.lastProperties || JSON.stringify(this.component.properties) != JSON.stringify(this.lastProperties) || this.levelStore.length < 1 || force) {
			this.generateLevels();
			
			if(this.billboardWhenCulled)
				this.generateBillboard();
			
			this.currentLODLevel = -1; // force refresh
			this.lastProperties = structuredClone(this.component.properties);
		}
	}
	getCamera() {
		if(window._editor)
			return _editor.cameraD3D;
		
		return this.camera || this.d3dobject.root.find(this.cameraName);
	}
	
	__onInternalBeforeRender() {
		const camera = this.getCamera();
		const levels = this.levels;
		const maxDistance = this.maxDistance;
		
		if(!camera)
			return;
		
		const distToMe = this.center.distanceTo(camera.worldPosition);
		
		if(distToMe > maxDistance) {
			this.makeAllLevelsVisible(false);
			this.d3dobject.__lodCulled = true;
			this.currentLODLevel = -1;
			if(this.billboardMesh) {
				this.billboardMesh.visible = true && this.billboardWhenCulled;
				
				if(this.billboardMesh.visible) {
					const desiredWorld = camera.object3d.getWorldQuaternion(new THREE.Quaternion());
					const parent = this.billboardMesh.parent;
					
					if(parent) {
						const parentWorld = parent.getWorldQuaternion(new THREE.Quaternion());
						parentWorld.invert();
						this.billboardMesh.quaternion.copy(parentWorld.multiply(desiredWorld));
					}
				}
			}
			return;
		}else{
			this.d3dobject.__lodCulled = false;
			
			if(this.billboardMesh)
				this.billboardMesh.visible = false;
		}
		
		let desiredLevel = Math.floor(distToMe / maxDistance * levels);
		
		if (desiredLevel < 0) 
			desiredLevel = 0;
			
		if (desiredLevel >= levels) 
			desiredLevel = levels - 1;
			
		if(this.currentLODLevel == desiredLevel)
			return;
		
		this.setLevel(desiredLevel);
	}
	setLevel(level) {
		let changed = 0;
		
		this.levelStore.forEach(({d3dobj, mesh, geometries}) => {
			let lodGeom = geometries[level] || geometries[level-1] || geometries[level-2] || geometries[level-3] || geometries[0];
			
			if(!lodGeom) {
				console.warn(`LOD geometry for ${d3dobj.name} at quality level ${desiredLevel} is not defined`);
				return;
			}
			
			mesh.visible = true && this.d3dobject.visible;
			mesh.geometry = lodGeom;
			changed++;
		});
		
		this.currentLODLevel = level;
	}
	makeAllLevelsVisible(visible) {
		if(!this.d3dobject.visible)
			visible = false;
		
		this.levelStore.forEach(({d3dobj, mesh, geometries}) => {
			mesh.visible = visible;
		});
	}
	
	onDisabled() {
		this.setLevel(0);
	}
}