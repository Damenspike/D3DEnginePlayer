// d3dobject.js
const fs = require('fs').promises;
const axios = require('axios');
const JSZip = require('jszip');
const path = require('path');
const vm = require('vm');
const { v4: uuidv4 } = require('uuid');
const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');
const protectedNames = [
	'_root', 'Input', 'position', 'rotation', 'scale', 'name', 'parent', 'children', 'threeObj', 'scenes', 'zip', 'forward', 'right', 'up', 'quaternion', 'beforeRenderFrame', 'onAddedToScene'
]

export default class D3DObject {
	///////////////////////////////
	// Getters and setters only
	///////////////////////////////
	get position() {
		return this.object3d.position;
	}
	set position({x, y, z}) {
		this.object3d.position.set(x, y, z);
	}
	
	get rotation() {
		return this.object3d.rotation;
	}
	set rotation({x, y, z}) {
		this.object3d.rotation.set(x, y, z);
	}
	
	get scale() {
		return this.object3d.scale;
	}
	set scale({x, y, z}) {
		this.object3d.scale.set(x, y, z);
	}
	
	get visible() {
		return this.object3d.visible;
	}
	set visible(value) {
		this.object3d.visible = !!value;
		this.onVisibilityChanged?.();
		this._onVisibilityChanged?.();
	}
	
	///////////////////////////////
	// Getters only
	///////////////////////////////
	get forward() {
		const fwd = THREE.Vector3.forward.clone();
		fwd.applyQuaternion(this.quaternion);
		return fwd;
	}
	get right() {
		const right = THREE.Vector3.right.clone();
		right.applyQuaternion(this.quaternion);
		return right;
	}
	get up() {
		const up = THREE.Vector3.up.clone();
		up.applyQuaternion(this.quaternion);
		return up;
	}
	get quaternion() {
		return this.object3d.quaternion;
	}
	
	constructor(name = 'object', parent = null) {
		if(!this.isValidName(name))
			name = `object${(parent?.children?.length ?? Math.floor(Math.random() * 10000000000))}`;
		
		if(protectedNames.includes(name) && global._root)
			name += '_unsafe';
		
		if (!global._root) global._root = this; // root is not defined so this must be root
		
		this.uuid = global._root != this ? uuidv4() : '';
		this.name = name;
		this.parent = parent; // D3DObject or null for root
		this.children = [];
		this.object3d = this.parent ? new THREE.Object3D() : new THREE.Scene();
		this.scenes = [];
		
		if(this.parent)
			this.parent[name] = this;
	}
	
	async createObject(objData, executeScripts = true) {
		const child = new D3DObject(objData.name, this);
		
		// Apply transforms
		child.zip = this.zip;
		child.position = objData.position;
		child.rotation = objData.rotation;
		child.scale = objData.scale;
		child.uuid = objData.uuid ?? child.uuid;
		child.editorOnly = !!objData.editorOnly || false;
		
		if(objData.engineScript)
			child.engineScript = objData.engineScript;
		
		if(_root) {
			if(!_root.superIndex)
				_root.superIndex = {};
				
			_root.superIndex[child.uuid] = child;
		}
		
		// Handle components with switch case
		for (const component of objData.components || []) {
			switch (component.type) {
				case 'HTML': {
					const elementId = `plate-html-${child.name}`; // no # in id
					const htmlSource = path.join('assets', component.properties.source);
					const htmlContent = await this.zip.file(htmlSource)?.async('string') ?? '';
					
					// Remove old container if exists
					let htmlContainer = document.getElementById(elementId);
					if (htmlContainer) htmlContainer.remove();
					
					// Create new container
					htmlContainer = document.createElement('div');
					htmlContainer.id = elementId;
					htmlContainer.classList.add('container', 'container--ui');
					htmlContainer.innerHTML = htmlContent;
					
					// Assign reference
					child.htmlContainer = htmlContainer;
					
					if(!window._editor) {
						// Append to 3D container or defer
						if (!_container3d) {
							child._onStart = () => {
								const container3dDeferred = document.getElementById('game-container');
								container3dDeferred.appendChild(htmlContainer);
							}
						} else {
							_container3d.appendChild(htmlContainer);
						}
						
						// Visibility toggle
						child._onVisibilityChanged = () => {
							child.htmlContainer.style.display = child.visible ? 'block' : 'none';
						}
					}
					break;
				}
				case 'Camera': {
					const camera = new THREE.PerspectiveCamera(
						component.properties.fieldOfView || 75, 
						this.manifest.width / this.manifest.height,
						component.properties.clipNear || 0.1, 
						component.properties.clipFar || 1000
					);
					child.object3d = camera;
					break;
				}
				case 'Light': {
					if (component.properties.type === 'AmbientLight') {
						const light = new THREE.AmbientLight(
							parseInt(component.properties.color || '0xffffff', 16),
							component.properties.intensity || 0.5
						);
						child.object3d.add(light);
					}else 
					if (component.properties.type === 'DirectionalLight') {
						const light = new THREE.DirectionalLight(
							parseInt(component.properties.color || '0xffffff', 16),
							component.properties.intensity || 1
						);
						if (component.properties.position) {
							light.position.set(
								component.properties.position.x, 
								component.properties.position.y, 
								component.properties.position.z
							);
						}
						child.object3d.add(light);
					}
					break;
				}
				case 'Mesh': {
					if (component.properties.mesh) {
						const modelPath = path.join('assets', component.properties.mesh);
						const modelData = await this.zip.file(modelPath)?.async('arraybuffer');
						if (!modelData) {
							console.warn(`Model file not found: ${modelPath}`);
							break;
						}
						const loader = new GLTFLoader();
						const gltf = await loader.parseAsync(modelData, '');
						child.object3d.add(gltf.scene);
					}
					if (component.properties.materials && component.properties.materials.length > 0) {
						const matPath = path.join('assets', component.properties.materials[0]);
						const matStr = await this.zip.file(matPath)?.async('string');
						
						if (!matStr) {
							console.warn(`Material file not found: ${matPath}`);
							break;
						}
						const matParams = JSON.parse(matStr);
						if (!THREE[matParams.type]) {
							console.warn(`Unknown material type: ${matParams.type}`);
							break;
						}
						const material = new THREE[matParams.type](matParams);
						if (child.object3d.children.length > 0) {
							child.object3d.children[0].material = material;
						} else {
							child.object3d.add(
								new THREE.Mesh(
									new THREE.BoxGeometry(1, 1, 1), material
								)
							);
						}
					}
					break;
				}
				default:
					console.warn(`Unknown component type: ${component.type}`);
			}
		}
		
		this.object3d.add(child.object3d);
		this.children.push(child);
		
		child.visible = true; // invoke visibility events
		
		// Recurse for nested objects if any
		if (objData.children && objData.children.length > 0)
			await child.buildScene({ objects: objData.children });
			
		if(executeScripts)
			await child.executeScripts();
			
		return child;
	}
	
	async load(uri) {
		let buffer;
		
		if (uri.startsWith('http://') || uri.startsWith('https://')) {
			// Remote URL
			console.log('Fetching remote .d3d from URL...');
			const response = await axios.get(uri, { responseType: 'arraybuffer' });
			buffer = Buffer.from(response.data);
		} else {
			// Local file
			console.log('Reading local .d3d file...');
			buffer = await fs.readFile(uri);
		}
		
		if(buffer) {
			// Pass buffer to your next step
			await this.loadFromBuffer(buffer);
			
			console.log('File loaded, size:', buffer.length, 'bytes');
		}
		
		return buffer;
	}
	
	async loadFromBuffer(buffer) {
		// No need for await import, using required modules
		const zip = await new JSZip().loadAsync(buffer);
		this.zip = zip;
		
		// Parse manifest.json for metadata
		const manifestStr = await zip.file('manifest.json')?.async('string');
		if (!manifestStr) {
			throw new Error('manifest.json not found in .d3d file');
		}
		this.manifest = JSON.parse(manifestStr);
		console.log('Manifest loaded:', this.manifest);
	
		// Configure Electron window based on manifest only for root
		if (this === global._root) {
			const { ipcRenderer } = require('electron');
			ipcRenderer.send('update-window', {
				width: this.manifest.width,
				height: this.manifest.height,
				title: this.manifest.name
			});
		}

		// Parse scenes.json for scene graph
		const scenesStr = await zip.file('scenes.json')?.async('string');
		if (!scenesStr) {
			throw new Error('scenes.json not found in .d3d file');
		}
		this.scenes = JSON.parse(scenesStr);
		
		// The starting scene
		const startScene = this.scenes[this.manifest.startScene];
		
		await this.buildScene(startScene);
	}
	
	async buildScene(scene) {
		if (!scene || !scene.objects) {
			console.warn('Invalid scene data or no objects found');
			return;
		}
	
		// Create all objects
		for (const objData of scene.objects) {
			await this.createObject(objData, false);
		}
		
		// When building scene, wait for all objects to be made first, then execute scripts
		await this.executeScripts();
	}
	
	async executeScripts() {
		let script;
		let scriptName = path.join('scripts', `object_${this.name}_${this.uuid}.js`);
		
		if(this.engineScript) {
			scriptName = path.join(__dirname, '../../', `engine/${this.engineScript}`);
			script = await fs.readFile(scriptName, 'utf8');
		}else{
			script = await this.zip.file(scriptName)?.async('string');
		}
		
		if (script && (!window._editor || this.editorOnly)) {
			this.runInSandbox(script);
			console.log(`${scriptName} executed in sandbox`);
		}
		
		if (this.children && this.children.length > 0) {
			for (const child of this.children) {
				await child.executeScripts();
			}
		}
	}
	runInSandbox(script) {
		const sandbox = {
			console,
			THREE,
			_root,
			_input,
			_time,
			_editor,
			self: this,
			Vector3: THREE.Vector3,
			Quaternion: THREE.Quaternion
		};
		
		const wrappedScript = `(function() { ${script} }).call(self)`;
		vm.runInNewContext(wrappedScript, sandbox);
	}
	
	find(name) {
		return this.children.find(child => child.name == name);
	}
	
	isValidName(str) {
		return /^[A-Za-z0-9_-]+$/.test(str);
	}
}