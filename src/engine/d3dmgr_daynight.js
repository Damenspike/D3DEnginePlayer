import * as THREE from 'three';
import D3DConsole from './d3dconsole.js';
import {
	loadTexture
} from './d2dutility.js';

export default class DayNightManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		
		this._dirLight = null;
		this._ambLight = null;
		this._skyDomes = null;
	}
	
	get dirLight() {
		return this._dirLight || this.d3dobject.root.find('directional light');
	}
	set dirLight(v) {
		this._dirLight = v;
	}
	
	get ambLight() {
		return this._ambLight || this.d3dobject.root.find('ambient light');
	}
	set ambLight(v) {
		this._ambLight = v;
	}
	
	// 0-24
	get hour() {
		return this.component.properties.hour;
	}
	set hour(v) {
		if(v > 24)
			v = 24;
			
		if(v < 0)
			v = 0;
		
		this.component.properties.hour = Number(v);
	}
	
	// Hour that the sun rises
	get sunrise() {
		return this.component.properties.sunrise;
	}
	set sunrise(v) {
		if(v > 24)
			v = 24;
			
		if(v < 0)
			v = 0;
		
		this.component.properties.sunrise = Number(v);
	}
	
	// Hour that the sun sets
	get sunset() {
		return this.component.properties.sunset;
	}
	set sunset(v) {
		if(v > 24)
			v = 24;
			
		if(v < 0)
			v = 0;
		
		this.component.properties.sunset = Number(v);
	}
	
	get sunriseTexture() {
		return this.component.properties.sunriseTexture;
	}
	set sunriseTexture(v) {
		this.component.properties.sunriseTexture = v;
	}
	
	get dayTexture() {
		return this.component.properties.dayTexture;
	}
	set dayTexture(v) {
		this.component.properties.dayTexture = v;
	}
	
	get sunsetTexture() {
		return this.component.properties.sunsetTexture;
	}
	set sunsetTexture(v) {
		this.component.properties.sunsetTexture = v;
	}
	
	get nightTexture() {
		return this.component.properties.nightTexture;
	}
	set nightTexture(v) {
		this.component.properties.nightTexture = v;
	}
	
	get sunriseTint() {
		return this.component.properties.sunriseTint;
	}
	set sunriseTint(v) {
		this.component.properties.sunriseTint = v;
	}
	
	get dayTint() {
		return this.component.properties.dayTint;
	}
	set dayTint(v) {
		this.component.properties.dayTint = v;
	}
	
	get sunsetTint() {
		return this.component.properties.sunsetTint;
	}
	set sunsetTint(v) {
		this.component.properties.sunsetTint = v;
	}
	
	get nightTint() {
		return this.component.properties.nightTint;
	}
	set nightTint(v) {
		this.component.properties.nightTint = v;
	}
	
	get skyDomeRadius() {
		return this.component.properties.skyDomeRadius || 1000;
	}
	set skyDomeRadius(v) {
		this.component.properties.skyDomeRadius = Number(v);
	}
	
	get skyDomeOffset() {
		const o = this.component.properties.skyDomeOffset;
		
		return new THREE.Vector3(
			(o?.x || 0) * THREE.MathUtils.DEG2RAD,
			(o?.y || 0) * THREE.MathUtils.DEG2RAD,
			(o?.z || 0) * THREE.MathUtils.DEG2RAD
		);
	}
	set skyDomeOffset(v) {
		this.component.properties.skyDomeOffset = v;
	}
	
	get sunOffset() {
		const o = this.component.properties.sunOffset;
		
		return new THREE.Vector3(
			(o?.x || 0) * THREE.MathUtils.DEG2RAD,
			(o?.y || 0) * THREE.MathUtils.DEG2RAD,
			(o?.z || 0) * THREE.MathUtils.DEG2RAD
		);
	}
	set sunOffset(v) {
		this.component.properties.sunOffset = v;
	}
	
	async updateComponent() {
		if(!this.dirLight) {
			this.dirLight = await this.d3dobject.root.createObject({
				name: 'directional light',
				components: [
					{ 
						type: 'DirectionalLight',
						properties: { color: '#ffffff', intensity: 1, castShadow: true } 
					}
				]
			});
		}
		if(!this.ambLight) {
			this.ambLight = await this.d3dobject.root.createObject({
				name: 'ambient light',
				components: [
					{ 
						type: 'AmbientLight',
						properties: { color: '#ffffff', intensity: 1 } 
					}
				]
			});
		}
		
		if(!this.lastProperties || JSON.stringify(this.component.properties) != JSON.stringify(this.lastProperties) || !this._skyDomes) {
			if(
				(this.lastProperties?.sunriseTexture != this.sunriseTexture) || 
				(this.lastProperties?.dayTexture != this.dayTexture) || 
				(this.lastProperties?.sunsetTexture != this.sunsetTexture) || 
				(this.lastProperties?.nightTexture != this.nightTexture)
			)
				await this.createSkyDomes();
			
			this.lastProperties = structuredClone(this.component.properties);
		}
	}
	
	async createSkyDomes() {
		const root = this.d3dobject.root;
		const zip = root.zip;
		const scene = root.object3d;
		const geometry = new THREE.SphereGeometry(this.skyDomeRadius, 32, 16);
		
		const makeMesh = (texture) => {
			if(!texture)
				return;
				
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.encoding = THREE.sRGBEncoding;
			
			const material = new THREE.MeshBasicMaterial({
				map: texture,
				side: THREE.BackSide,
				depthWrite: false,
				fog: false,
				transparent: true,
				opacity: 0
			});
			
			const mesh = new THREE.Mesh(geometry, material);
			mesh.renderOrder = -1000;
			
			return mesh;
		};
		
		let sunriseTexture;
		let dayTexture;
		let sunsetTexture;
		let nightTexture;
		
		this.dispose();
		
		this._skyDomes = {
			geometry,
			group: new THREE.Group(),
			meshes: {}
		};
		const skyDomes = this._skyDomes;
		
		try {
			sunriseTexture = await loadTexture(root.resolvePath(this.sunriseTexture), zip);
		}catch(e) { console.warn(e); }
		
		try {
			dayTexture = await loadTexture(root.resolvePath(this.dayTexture), zip);
		}catch(e) { console.warn(e); }
		
		try {
			sunsetTexture = await loadTexture(root.resolvePath(this.sunsetTexture), zip);
		}catch(e) { console.warn(e); }
		
		try {
			nightTexture = await loadTexture(root.resolvePath(this.nightTexture), zip);
		}catch(e) { console.warn(e); }
		
		if(sunriseTexture) {
			skyDomes.meshes.sunrise = makeMesh(sunriseTexture);
			skyDomes.group.add(skyDomes.meshes.sunrise);
		}
		
		if(dayTexture) {
			skyDomes.meshes.day = makeMesh(dayTexture);
			skyDomes.group.add(skyDomes.meshes.day);
		}
			
		if(sunsetTexture) {
			skyDomes.meshes.sunset = makeMesh(sunsetTexture);
			skyDomes.group.add(skyDomes.meshes.sunset);
		}
			
		if(nightTexture) {
			skyDomes.meshes.night = makeMesh(nightTexture);
			skyDomes.group.add(skyDomes.meshes.night);
		}
		
		scene.add(skyDomes.group);
	}
	
	__onEditorEnterFrame() {
		this.updateSky();
	}
	
	__onInternalEnterFrame() {
		this.updateSky();
	}
	
	updateSky() {
		this.updateLightIntensity();
		this.updateLightAngle();
		this.updateSkyBlend();
		this.updateSkyRotation();
		this.updateFogAndLightColor();
	}
	
	updateLightIntensity() {
		const dirObj = this.dirLight;
		const ambObj = this.ambLight;
		
		const dir = dirObj.getComponent('DirectionalLight');
		const amb = ambObj.getComponent('AmbientLight');
		
		if(!dir && !amb)
			return;
		
		let h = this.hour;
		let sr = this.sunrise;
		let ss = this.sunset;
		
		let dayLength = ss - sr;
		if(dayLength <= 0)
			dayLength = 12;
		
		let f = 0;
		
		if(h >= sr && h <= ss) {
			const x = (h - sr) / dayLength; // 0..1
			let s = Math.sin(x * Math.PI);  // 0..1..0
			if(s < 0)
				s = 0;
			f = Math.pow(s, 0.6); // fat daylight curve
		}
		
		if(dir)
			dir.intensity = 0.1 + 1.9 * f;
		
		if(amb) {
			const ambientNight = 0.02;  // << night is darker
			const ambientDay   = 0.8;   // << midday brightness
			amb.intensity = ambientNight + (ambientDay - ambientNight) * f;
		}
	}
	
	updateLightAngle() {
		const dirObj = this.dirLight;
		const dir = dirObj?.object3d;
			
		if(!dir)
			return;
			
		let h = this.hour;
		let sr = this.sunrise;
		let ss = this.sunset;
			
		let dayLength = ss - sr;
		if(dayLength <= 0)
			dayLength = 12;
			
		let x;
			
		if(h <= sr)
			x = 0;
		else
		if(h >= ss)
			x = 1;
		else
			x = (h - sr) / dayLength;
			
		const theta = x * Math.PI;
		const r = this.skyDomeRadius;
		
		const pos = new THREE.Vector3(
			Math.cos(theta) * r,
			Math.sin(theta) * r,
			0
		);
		
		const off = this.sunOffset;
		if(off.x || off.y || off.z) {
			const e = new THREE.Euler(off.x, off.y, off.z, 'XYZ');
			pos.applyEuler(e);
		}
		
		dir.position.copy(pos);
			
		if(dir.target) {
			dir.target.position.set(0, 0, 0);
			dir.target.updateMatrixWorld();
		}
	}
	
	updateSkyBlend() {
		const sky = this._skyDomes?.meshes;
		if(!sky)
			return;
		
		const sunrise = sky.sunrise;
		const day     = sky.day;
		const sunset  = sky.sunset;
		const night   = sky.night;
		
		const setOp = (m, v) => {
			if(m?.material)
				m.material.opacity = v;
		};
		
		// Reset
		setOp(sunrise, 0);
		setOp(day, 0);
		setOp(sunset, 0);
		setOp(night, 0);
		
		let h = this.hour;
		if(h < 0)   h = 0;
		if(h >= 24) h = 23.9999;
		
		// ---- SIMPLE PHASE TIMES ----
		const sunriseStart = 5;
		const sunriseEnd   = 7;
		const sunsetStart  = 17;
		const sunsetEnd    = 19;
		
		// ---- SUNRISE FADE (night → sunrise → day) ----
		if(h >= sunriseStart && h < sunriseEnd) {
			let f = (h - sunriseStart) / (sunriseEnd - sunriseStart); // 0..1
			
			// First half: night → sunrise
			if(f < 0.5) {
				let ff = f / 0.5;
				setOp(night, 1 - ff);
				setOp(sunrise, ff);
				return;
			}
			
			// Second half: sunrise → day
			let ff = (f - 0.5) / 0.5;
			setOp(sunrise, 1 - ff);
			setOp(day, ff);
			return;
		}
		
		// ---- SUNSET FADE (day → sunset → night) ----
		if(h >= sunsetStart && h < sunsetEnd) {
			let f = (h - sunsetStart) / (sunsetEnd - sunsetStart); // 0..1
			
			// First half: day → sunset
			if(f < 0.5) {
				let ff = f / 0.5;
				setOp(day, 1 - ff);
				setOp(sunset, ff);
				return;
			}
			
			// Second half: sunset → night
			let ff = (f - 0.5) / 0.5;
			setOp(sunset, 1 - ff);
			setOp(night, ff);
			return;
		}
	
		// ---- FULL DAY ----
		if(h >= sunriseEnd && h < sunsetStart) {
			setOp(day, 1);
			return;
		}
		
		// ---- FULL NIGHT ----
		setOp(night, 1);
	}
	updateSkyRotation() {
		const sky = this._skyDomes;
		if(!sky)
			return;
		
		let h = this.hour;
		if(h < 0) h = 0;
		if(h >= 24) h = 23.9999;
		
		// 0–24 maps to 0–2π rotation
		const rot = (h / 24) * Math.PI * 2;
	
		sky.group.rotation.set(
			this.skyDomeOffset.x,
			rot + this.skyDomeOffset.y,
			this.skyDomeOffset.z
		);
	}
	updateFogAndLightColor() {
		const scene = _root.object3d;
		if(!scene)
			return;
		
		const tint = this.getTintForHour();
		const hex  = '0x' + tint.getHexString();
		
		if(scene.fog)
			scene.fog.color.copy(tint);
		
		const dirObj = this.dirLight;
		const ambObj = this.ambLight;
		
		const dir = dirObj?.getComponent('DirectionalLight');
		const amb = ambObj?.getComponent('AmbientLight');
		
		if(dir)
			dir.color = hex;
		
		if(amb)
			amb.skyColor = hex;
	}
	
	getTintForHour() {
		let h = this.hour;
		if(h < 0)   h = 0;
		if(h >= 24) h = 23.9999;
		
		const sunriseStart = 5.1;
		const sunriseEnd   = 7;
		const sunsetStart  = 17;
		const sunsetEnd    = 18.75;
		
		const nightCol   = new THREE.Color(Number(this.nightTint   || 0x050510));
		const sunriseCol = new THREE.Color(Number(this.sunriseTint || this.nightTint   || 0xffaa66));
		const dayCol     = new THREE.Color(Number(this.dayTint     || this.sunriseTint || 0xffffff));
		const sunsetCol  = new THREE.Color(Number(this.sunsetTint  || this.dayTint     || 0xff8844));
		
		// SUNRISE: night → sunrise → day (5–7)
		if(h >= sunriseStart && h < sunriseEnd) {
			let f = (h - sunriseStart) / (sunriseEnd - sunriseStart); // 0..1
			
			if(f < 0.5) {
				const ff = f / 0.5;          // 0..1
				return nightCol.clone().lerp(sunriseCol, ff);
			}
			
			const ff = (f - 0.5) / 0.5;       // 0..1
			return sunriseCol.clone().lerp(dayCol, ff);
		}
		
		// SUNSET: day → sunset → night (17–19)
		if(h >= sunsetStart && h < sunsetEnd) {
			let f = (h - sunsetStart) / (sunsetEnd - sunsetStart); // 0..1
			
			if(f < 0.5) {
				const ff = f / 0.5;
				return dayCol.clone().lerp(sunsetCol, ff);
			}
			
			const ff = (f - 0.5) / 0.5;
			return sunsetCol.clone().lerp(nightCol, ff);
		}
		
		// FULL DAY
		if(h >= sunriseEnd && h < sunsetStart)
			return dayCol.clone();
		
		// FULL NIGHT
		return nightCol.clone();
	}
	
	dispose() {
		const scene = this.d3dobject.root.object3d;
		const skyDomes = this._skyDomes;
		
		if(skyDomes) {
			scene.remove(skyDomes.group);
			
			skyDomes.meshes.sunrise?.material?.dispose();
			skyDomes.meshes.day?.material?.dispose();
			skyDomes.meshes.sunset?.material?.dispose();
			skyDomes.meshes.night?.material?.dispose();
			
			skyDomes.geometry?.dispose();
			
			this._skyDomes = null;
		}
	}
}