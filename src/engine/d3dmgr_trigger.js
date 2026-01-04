import * as THREE from 'three';
import D3DConsole from './d3dconsole.js';

export default class D3DTrigger {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;

		this.box = new THREE.Box3();
		this.startTime = _time.now;
	}

	get targetName() {
		return this.component.properties.targetName;
	}
	set targetName(v) {
		this.component.properties.targetName = v;
	}

	get label() {
		return this.component.properties.label;
	}
	set label(v) {
		this.component.properties.label = v;
	}

	updateComponent() {
		// Always invisible
		if(window._player)
			this.d3dobject.visible2 = false;
		
		this.d3dobject.object3d.updateWorldMatrix(true, true);
		this.box.setFromObject(this.d3dobject.object3d);
	}

	dispose() {
		if(this.inside) {
			this.inside = false;
			this.onTriggerExit?.();
		}
	}
	
	__onInternalEnterFrame() {
		if(!this.component.enabled)
			return;
		
		const root = this.d3dobject.root;
		const target = root.triggerTarget ?? this.target ?? this.d3dobject.root.find(this.targetName);
		
		if(!target) {
			if(!this._notargetWarning && window._player && _time.now - this.startTime > 5) {
				D3DConsole.warn(`[${this.d3dobject.name}] No target assigned to D3DTrigger`);
				this._notargetWarning = true;
			}
			return;
		}
		
		const targetPos = target.worldPosition.clone();
		const inside = this.box.containsPoint(targetPos);
		
		if(inside !== this.inside) {
			this.inside = inside;
			
			if(inside) {
				this.onTriggerEnter?.();
				
				root.onWorldTriggerEnter?.(this, target);
				root != _root && _root.onWorldTriggerEnter?.(this, target);
			}else{
				this.onTriggerExit?.();
				
				root.onWorldTriggerExit?.(this, target);
				root != _root && _root.onWorldTriggerExit?.(this, target);
			}
		}
		
		this.target = target;
	}
}