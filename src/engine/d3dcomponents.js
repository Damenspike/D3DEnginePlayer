import * as THREE from 'three';

import D2DTextManager from './d2dmgr_text.js';
import D2DBitmapManager from './d2dmgr_bitmap.js';
import D2DGraphic2DManager from './d2dmgr_graphic2d.js';
import D2DLayoutManager from './d2dmgr_layout.js';
import D2DFilterManager from './d2dmgr_filter.js';
import D2DContainerManager from './d2dmgr_container2d.js';
import D3DAnimationManager from './d3dmgr_animation.js';
import D3DMeshManager from './d3dmgr_mesh.js';
import D3DCameraManager from './d3dmgr_camera.js';
import D3DAmbientLightManager from './d3dmgr_ambientlight.js';
import D3DDirectionalLightManger from './d3dmgr_directionallight.js';
import D3DPointLightManager from './d3dmgr_pointlight.js';
import D3DSpotLightManager from './d3dmgr_spotlight.js';
import D3DRigidbodyManager from './d3dmgr_rigidbody.js';
import D3DCharacterControllerManager from './d3dmgr_charactercontroller.js';
import D3DThirdPersonCameraManager from './d3dmgr_thirdpersoncamera.js';
import D3DAudioListenerManager from './d3dmgr_audiolistener.js';
import D3DAudioSourceManager from './d3dmgr_audiosource.js';
import D3DParticleSystemManager from './d3dmgr_particlesystem.js';
import D3DCameraCollisionManager from './d3dmgr_cameracollision.js';
import D3DFirstPersonCameraManager from './d3dmgr_firstpersoncamera.js';
import D3DFirstPersonCharacterController from './d3dmgr_firstpersoncharactercontroller.js';
import D3DAutoLODManager from './d3dmgr_autolod.js';
import D3DDayNightManager from './d3dmgr_daynight.js';
import D3DStamperManager from './d3dmgr_stamper.js';
import D3DTriggerManager from './d3dmgr_trigger.js';

import { WebSafeFonts } from './d3dfonts.js';
import { fileNameNoExt } from './d3dutility.js';

const D3DComponents = {
	Mesh: {
		name: 'Mesh',
		priority: -1,
		fields: {
			'mesh': {
				label: 'Model',
				type: 'file',
				format: 'model',
				def: ''
			},
			'morphTargets': {
				label: '',
				type: 'none',
				def: {}
			},
			'materials': { 
				label: 'Materials', 
				type: 'file[]',
				format: 'material',
				def: []
			}
		},
		persistent: true,
		manager: D3DMeshManager
	},
	SubMesh: {
		name: 'Sub Mesh',
		priority: -1,
		fields: {
			'materials': { 
				label: 'Materials', 
				type: 'file[]',
				format: 'material',
				def: []
			},
			'morphTargets': {
				label: '',
				type: 'none',
				def: {}
			},
			'castShadow': {
				label: 'Cast shadows',
				type: 'boolean',
				def: true
			},
			'receiveShadow': {
				label: 'Receive shadows',
				type: 'boolean',
				def: true
			},
			'ambientOcclusion': {
				label: 'Ambient occlusion',
				type: 'boolean',
				def: true
			},
			'instancing': {
				label: 'Instancing',
				type: 'boolean',
				def: false
			},
			'instancingId': {
				label: 'Instancing ID',
				type: 'string',
				description: 'All meshes with this ID will be batched together. They must share the same geometry and materials.',
				def: '',
				condition: c => c.properties.instancing == true
			}
		},
		manager: D3DMeshManager
	},
	Camera: {
		name: 'Camera',
		sectionsLast: true,
		fields: {
			projection: {
				label: 'Projection',
				type: 'select',
				options: [
					{
						name: 'perspective', 
						label: 'Perspective'
					},
					{
						name: 'orthographic', 
						label: 'Orthographic'
					}
				],
				def: 'Perspective'
			},
			fieldOfView: {
				label: 'Field of view',
				type: 'slider',
				min: 1,
				max: 179,
				def: 75
			},
			orthographicSize: {
				label: 'Orthographic size',
				type: 'number',
				min: 0.01,
				max: 100000,
				def: 10,
				condition: c => c.properties.projection == 'orthographic'
			},
			clipNear: { 
				label: 'Minimum distance', 
				type: 'number',
				min: 0.0001,
				max: 100,
				def: 0.03
			},
			clipFar: { 
				label: 'Maximum distance', 
				type: 'number',
				min: 1,
				max: 10000000,
				def: 2000
			},
			advancedControls: {
				label: 'Advanced controls',
				type: 'boolean',
				def: false,
				section: 'advanced'
			},
			autoAspect: {
				label: 'Auto aspect',
				type: 'boolean',
				def: true,
				section: 'advanced',
				condition: c => c.properties.advancedControls == true
			},
			aspect: { 
				label: 'Aspect', 
				type: 'number',
				def: 1,
				section: 'advanced',
				condition: c => !c.properties.autoAspect && c.properties.advancedControls == true
			},
			aoClipRadius: {
				label: 'AO distance',
				type: 'number',
				description: 'Clip radius for ambient occlusion pass (if enabled). Zero means infinite.',
				def: 0,
				min: 0,
				max: Infinity,
				step: 1,
				section: 'advanced',
				condition: c => c.properties.advancedControls == true
			}
		},
		gizmo3d: {
			hidden: true,
			mesh: 'Standard/Models/__Editor/Camera.glb',
			materials: [
				'Standard/Materials/__Editor/Gizmo3D.mat'
			]
		},
		manager: D3DCameraManager
	},
	AmbientLight: {
		name: 'Ambient Light',
		fields: {
			'skyColor': {
				label: 'Sky color',
				type: 'color',
				def: '0xffffff'
			},
			'groundColor': {
				label: 'Ground color',
				type: 'color',
				def: '0xffffff'
			},
			'intensity': { 
				label: 'Intensity', 
				type: 'number',
				min: 0,
				def: 1
			}
		},
		gizmo3d: {
			hidden: true,
			mesh: 'Standard/Models/__Editor/Light.glb',
			materials: [
				'Standard/Materials/__Editor/GizmoLight3D.mat'
			]
		},
		manager: D3DAmbientLightManager
	},
	DirectionalLight: {
		name: 'Directional Light',
		sectionsLast: true,
		fields: {
			'color': {
				label: 'Color',
				type: 'color',
				def: '0xFFFFFF'
			},
			'intensity': { 
				label: 'Intensity', 
				type: 'number',
				min: 0,
				def: 1
			},
			'distance': { 
				label: 'Distance', 
				type: 'number',
				def: 1000
			},
			'castShadow': { 
				label: 'Casts shadows', 
				type: 'boolean',
				def: true,
				section: 'shadow'
			},
			'shadowMapSize': {
				label: 'Shadow map size',
				description: 'Resolution of the shadow texture (power of two recommended, e.g. 1024–4096)',
				type: 'number',
				min: 128,
				max: 8192,
				step: 128,
				def: 2048,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowNear': {
				label: 'Shadow camera near',
				description: 'Near clipping plane for the shadow camera',
				type: 'number',
				min: 0.01,
				step: 0.01,
				def: 0.01,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowFar': {
				label: 'Shadow camera far',
				description: 'Far clipping plane for the shadow camera',
				type: 'number',
				min: 1,
				step: 1,
				def: 500,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowOrthoSize': {
				label: 'Shadow orthographic size',
				description: 'Half-extent of the orthographic shadow volume (larger = covers more scene, lower precision)',
				type: 'number',
				min: 1,
				step: 1,
				def: 50,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowBias': {
				label: 'Shadow bias',
				description: 'Offset applied to depth to reduce shadow acne (negative)',
				type: 'number',
				step: 0.0001,
				def: -0.0005,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowNormalBias': {
				label: 'Shadow normal bias',
				description: 'Adjusts bias based on surface normals (useful for skinned meshes)',
				type: 'number',
				step: 0.001,
				def: 0.02,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowRadius': {
				label: 'Shadow blur radius',
				description: 'Softness of PCF shadows',
				type: 'number',
				min: 0,
				step: 0.1,
				def: 1.0,
				section: 'shadow',
				condition: c => c.properties.castShadow
			},
			/*
			lensFlareEnabled: {
				label: 'Lens flare',
				type: 'boolean',
				section: 'lensflare',
				def: false
			},
			lensFlareTexture: {
				label: 'Flare texture',
				type: 'file',
				section: 'lensflare',
				format: 'img',
				condition: c => c.properties.lensFlareEnabled
			},
			lensFlareSize: {
				label: 'Flare size',
				type: 'number',
				section: 'lensflare',
				min: 50,
				max: 1000,
				def: 400,
				condition: c => c.properties.lensFlareEnabled
			}
			*/
		},
		gizmo3d: {
			hidden: true,
			mesh: 'Standard/Models/__Editor/Light.glb',
			materials: [
				'Standard/Materials/__Editor/GizmoLight3D.mat'
			]
		},
		manager: D3DDirectionalLightManger
	},
	PointLight: {
		name: 'Point Light',
		sectionsLast: true,
		fields: {
			'color': {
				label: 'Color',
				type: 'color',
				def: '0xFFFFFF'
			},
			'intensity': { 
				label: 'Intensity', 
				type: 'number',
				min: 0,
				step: 0.01,
				def: 1
			},
			'distance': { 
				label: 'Distance', 
				type: 'number',
				min: 0,
				step: 0.1,
				def: 0, // no limit
				description: 'Maximum range of the light. 0 = infinite'
			},
			'decay': { 
				label: 'Decay', 
				type: 'number',
				min: 0,
				step: 0.1,
				def: 2,
				description: 'Light attenuation over distance (physically correct = 2)'
			},
			'castShadow': { 
				label: 'Casts shadows', 
				type: 'boolean',
				def: true,
				section: 'shadow'
			},
			'shadowMapSize': {
				label: 'Shadow map size',
				description: 'Resolution of the shadow map texture (power of two)',
				type: 'number',
				min: 128,
				max: 8192,
				step: 128,
				def: 1024,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowBias': {
				label: 'Shadow bias',
				type: 'number',
				step: 0.0001,
				def: -0.0005,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowNormalBias': {
				label: 'Shadow normal bias',
				type: 'number',
				step: 0.001,
				def: 0.02,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowRadius': {
				label: 'Shadow blur radius',
				description: 'Softens shadow edges when using PCFSoftShadowMap',
				type: 'number',
				min: 0,
				step: 0.1,
				def: 1.0,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowNear': {
				label: 'Shadow camera near',
				type: 'number',
				min: 0.01,
				step: 0.01,
				def: 0.01,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowFar': {
				label: 'Shadow camera far',
				type: 'number',
				min: 1,
				step: 1,
				def: 500,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			}
		},
		gizmo3d: {
			hidden: true,
			mesh: 'Standard/Models/__Editor/Light.glb',
			materials: [
				'Standard/Materials/__Editor/GizmoLight3D.mat'
			]
		},
		manager: D3DPointLightManager
	},
	SpotLight: {
		name: 'Spot Light',
		sectionsLast: true,
		fields: {
			'color': {
				label: 'Color',
				type: 'color',
				def: '0xFFFFFF'
			},
			'intensity': { 
				label: 'Intensity', 
				type: 'number',
				min: 0,
				step: 0.01,
				def: 1
			},
			'distance': { 
				label: 'Distance', 
				type: 'number',
				min: 0,
				step: 0.1,
				def: 10
			},
			'angle': { 
				label: 'Angle', 
				type: 'slider',
				min: 0,
				max: 360,
				step: 1,
				def: 45
			},
			'penumbra': { 
				label: 'Penumbra', 
				description: 'Softness of the spotlight edge',
				type: 'number',
				min: 0,
				max: 1,
				step: 0.01,
				def: 0
			},
			'decay': { 
				label: 'Decay', 
				type: 'number',
				min: 0,
				step: 0.1,
				def: 1,
				description: 'Light attenuation over distance'
			},
			'castShadow': { 
				label: 'Casts shadows', 
				type: 'boolean',
				def: true,
				section: 'shadow'
			},
			'shadowMapSize': {
				label: 'Shadow map size',
				type: 'number',
				min: 128,
				max: 8192,
				step: 128,
				def: 1024,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowBias': {
				label: 'Shadow bias',
				type: 'number',
				step: 0.0001,
				def: -0.0005,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowNormalBias': {
				label: 'Shadow normal bias',
				type: 'number',
				step: 0.001,
				def: 0.02,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowRadius': {
				label: 'Shadow blur radius',
				type: 'number',
				min: 0,
				step: 0.1,
				def: 1.0,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowNear': {
				label: 'Shadow camera near',
				type: 'number',
				min: 0.01,
				step: 0.01,
				def: 0.01,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowFar': {
				label: 'Shadow camera far',
				type: 'number',
				min: 1,
				step: 1,
				def: 50,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			},
			'shadowFov': {
				label: 'Shadow camera FOV',
				type: 'number',
				min: 1,
				max: 120,
				step: 1,
				def: 45,
				section: 'shadow',
				condition: (c) => c.properties.castShadow
			}
		},
		gizmo3d: {
			hidden: true,
			mesh: 'Standard/Models/__Editor/Light.glb',
			materials: [
				'Standard/Materials/__Editor/GizmoLight3D.mat'
			]
		},
		manager: D3DSpotLightManager
	},
	Animation: {
		name: 'Animation',
		is2Dand3D: true,
		fields: {
			'clips': {
				label: 'Clips',
				type: 'file[]',
				format: 'anim',
				def: []
			}
		},
		manager: D3DAnimationManager
	},
	Rigidbody: {
		name: 'Rigidbody',
		sectionsLast: true,
		fields: {
			'kind': { 
				label: 'Kind', 
				type: 'select',
				options: [
					{
						name: 'dynamic', 
						label: 'Dynamic', 
						description: 'An object that moves under forces, collisions (default)'
					},
					{
						name: 'fixed', 
						label: 'Fixed',
						description: 'Static, immovable, like a terrain or floor'
					},
					{
						name: 'kinematicPosition', 
						label: 'Kinematic',
						description: 'You drive the transformation manually (e.g. character controller)'
					}
				],
				def: 'dynamic'
			},
			
			'shape': { 
				label: 'Shape', 
				type: 'select',
				section: 'shape',
				options: [
					{name: 'trimesh', label: 'Mesh'},
					{name: 'box', label: 'Box'},
					{name: 'sphere', label: 'Sphere'},
					{name: 'capsule', label: 'Capsule'},
					{name: 'convex', label: 'Convex'}
				],
				def: 'trimesh',
				description: 'The type of shape this object will use in physics interactions'
			},
			// === Shape configuration fields ===
			'autoCalculateShapes': {
				label: 'Auto calculate shapes',
				type: 'boolean',
				section: 'shape',
				def: true,
				description: 'Automatically derives shape dimensions from the object’s geometry when building the rigidbody',
				condition: c => ['box','sphere','capsule'].includes(c.properties.shape)
			},
			'shapeOffset': {
				label: 'Shape offset',
				type: 'vector3',
				section: 'shape',
				def: { x:0, y:0, z:0 },
				condition: c => ['box','sphere','capsule'].includes(c.properties.shape) && !c.properties.autoCalculateShapes
			},
			
			// ---- Box shape dimensions ----
			'boxSize': {
				label: 'Box size',
				type: 'vector3',
				section: 'shape',
				def: { x: 1, y: 1, z: 1 },
				description: 'Full box dimensions (local space, before world scaling)',
				condition: c => c.properties.shape === 'box' && !c.properties.autoCalculateShapes
			},
			
			// ---- Sphere shape dimensions ----
			'sphereRadius': {
				label: 'Sphere radius',
				type: 'number',
				section: 'shape',
				min: 0,
				step: 0.01,
				def: 0.5,
				description: 'Sphere radius before world scaling',
				condition: c => c.properties.shape === 'sphere' && !c.properties.autoCalculateShapes
			},
			
			// ---- Capsule shape dimensions ----
			'capsuleRadius': {
				label: 'Capsule radius',
				type: 'number',
				section: 'shape',
				min: 0,
				step: 0.01,
				def: 0.5,
				description: 'Radius of the capsule hemispheres before world scaling',
				condition: c => c.properties.shape === 'capsule' && !c.properties.autoCalculateShapes
			},
			'capsuleHeight': {
				label: 'Capsule height',
				type: 'number',
				section: 'shape',
				min: 0,
				step: 0.01,
				def: 1,
				description: 'Height of the capsule cylinder (excluding caps) before world scaling',
				condition: c => c.properties.shape === 'capsule' && !c.properties.autoCalculateShapes
			},
			
			'friction': {
				label: 'Friction',
				type: 'number',
				section: 'physics',
				min: 0,
				max: 1,
				def: 0.5,
				condition: c => c.properties.kind !== 'fixed'
			},
			'bounciness': {
				label: 'Bounciness',
				type: 'number',
				section: 'physics',
				min: 0,
				max: 1,
				def: 0.5,
				condition: c => c.properties.kind !== 'fixed'
			},
			'density': {
				label: 'Density',
				type: 'number',
				section: 'physics',
				min: 0,
				max: Infinity,
				def: 1,
				condition: c => c.properties.kind !== 'fixed'
			},
			'drag': {
				label: 'Drag',
				type: 'number',
				section: 'physics',
				min: 0,
				max: Infinity,
				def: 1,
				condition: c => c.properties.kind !== 'fixed'
			},
			'angularDrag': {
				label: 'Angular drag',
				type: 'number',
				section: 'physics',
				min: 0,
				max: Infinity,
				def: 1,
				condition: c => c.properties.kind !== 'fixed'
			},
			'constrainAxes': {
				label: 'Contrain axes',
				type: 'boolean',
				section: 'constrain',
				def: false,
				condition: c => c.properties.kind !== 'fixed'
			},
			'constraintPos': {
				label: 'Position',
				type: 'vector3bool',
				section: 'constrain',
				def: {x: 1, y: 1, z: 1},
				condition: c => !!c.properties.constrainAxes && c.properties.kind !== 'fixed'
			},
			'constraintRot': {
				label: 'Rotation',
				type: 'vector3bool',
				section: 'constrain',
				def: {x: 1, y: 1, z: 1},
				condition: c => !!c.properties.constrainAxes && c.properties.kind !== 'fixed'
			}
		},
		manager: D3DRigidbodyManager
	},
	CharacterController: {
		name: 'Character Controller (Third Person)',
		fields: {
			'cameraName': {
				label: 'Camera name',
				description: 'Path to the camera object instance that determines the direction of the character (.camera property pointing to an object instance overrides this value)',
				type: 'string',
				def: ''
			},
			'moveSpeed': {
				label: 'Move speed',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 2
			},
			'turnSpeed': {
				label: 'Turn speed',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 8
			},
			'jumpHeight': {
				label: 'Jump height',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 6
			},
			'gravityStrength': {
				label: 'Gravitational strength',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 1
			},
			'positionOnly': {
				label: 'Position only',
				type: 'boolean',
				def: false
			}
		},
		manager: D3DCharacterControllerManager
	},
	ThirdPersonCamera: {
		name: 'Third Person Camera',
		fields: {
			'targetName': {
				label: 'Target name',
				description: 'Path to the target object instance (.target property pointing to an object instance overrides this value)',
				type: 'string',
				def: '',
				section: 'target'
			},
			'targetOffset': {
				label: 'Target offset',
				type: 'vector3',
				def: {x: 0, y: 0, z: 0},
				section: 'target'
			},
			'distance': {
				label: 'Distance',
				description: 'Distance from target',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 1,
				section: 'offsets'
			},
			'height': {
				label: 'Height',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 0.5,
				section: 'offsets'
			},
			'rotateSpeed': {
				label: 'Rotate speed',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 1,
				section: 'speeds'
			},
			'zoomSpeed': {
				label: 'Zoom speed',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 1,
				section: 'speeds'
			},
			'smoothRotate': {
				label: 'Smooth rotate',
				type: 'boolean',
				def: false,
				section: 'speeds'
			},
			'damping': {
				label: 'Damping amount',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 5,
				condition: c => c.properties.smoothRotate === true,
				section: 'speeds'
			},
			'allowScroll': {
				label: 'Allow scroll',
				description: 'Allow the player to control the distance of the camera?',
				type: 'boolean',
				def: false,
				section: 'scroll'
			},
			'minDist': {
				label: 'Minimum distance',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 0.25,
				condition: c => c.properties.allowScroll === true,
				section: 'scroll'
			},
			'maxDist': {
				label: 'Maximum distance',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 100,
				condition: c => c.properties.allowScroll === true,
				section: 'scroll'
			}
		},
		manager: D3DThirdPersonCameraManager
	},
	Graphic2D: {
		name: 'Graphic 2D',
		persistent: true,
		is2D: true,
		fields: {
			'_paths': {
				label: '',
				type: 'none',
				def: []
			},
			'_points': {
				label: '',
				type: 'none',
				def: []
			},
			'_pivotPoint': {
				label: '',
				type: 'none',
				def: {x: 0, y: 0}
			},
			'fill': {
				label: 'Fill',
				type: 'boolean',
				section: 'fill',
				def: true
			},
			'fillColor': {
				label: 'Fill color',
				type: 'colorbest',
				def: 'rgba(255,255,255,1)',
				section: 'fill',
				condition: c => c.properties.fill == true
			},
			'line': {
				label: 'Line',
				type: 'boolean',
				def: true,
				section: 'line'
			},
			'lineWidth': {
				label: 'Line width',
				type: 'number',
				min: 0,
				max: 1000,
				def: 1,
				section: 'line',
				condition: c => c.properties.line == true
			},
			'lineColor': {
				label: 'Line color',
				type: 'colora',
				def: '#ffffffff',
				section: 'line',
				condition: c => c.properties.line == true
			},
			'lineCap': {
				label: 'Line cap',
				type: 'select',
				options: [
					{ name: 'butt',   label: 'Flat' },
					{ name: 'round',  label: 'Rounded' },
					{ name: 'square', label: 'Square' }
				],
				def: 'round',
				section: 'line',
				condition: c => c.properties.line == true
			},
			'lineJoin': {
				label: 'Line join',
				type: 'select',
				options: [
					{ name: 'miter', label: 'Miter (pointed)' },
					{ name: 'round', label: 'Rounded' },
					{ name: 'bevel', label: 'Bevel (chamfer)' }
				],
				def: 'round',
				section: 'line',
				condition: c => c.properties.line == true
			},
			'miterLimit': {
				label: 'Miter limit',
				type: 'number',
				min: 1,
				step: 0.5,
				def: 10,
				section: 'line',
				condition: c => (
					c.properties.line == true && 
					c.properties.lineJoin == 'miter'
				)
			},
			'lineStyle': {
				label: 'Line style',
				type: 'select',
				def: 'solid',
				section: 'line',
				options: [
					{ name: 'solid',   label: 'Solid' },
					{ name: 'dashed',  label: 'Dashed' },
					{ name: 'dotted',  label: 'Dotted' },
					{ name: 'dashdot', label: 'Dash-Dot' }
				],
				condition: c => c.properties.line == true
			},
			'lineDashLength': {
				label: 'Dash length',
				type: 'number',
				min: 0,
				max: 1024,
				step: 0.5,
				def: 12,
				section: 'line',
				// only for dashed + dashdot
				condition: c => {
					const s = c.properties.lineStyle;
					return c.properties.line == true && (s === 'dashed' || s === 'dashdot');
				}
			},
			'lineDashGap': {
				label: 'Dash gap',
				type: 'number',
				min: 0,
				max: 1024,
				step: 0.5,
				def: 8,
				section: 'line',
				// only for dashed + dashdot
				condition: c => {
					const s = c.properties.lineStyle;
					return c.properties.line == true && (s === 'dashed' || s === 'dashdot');
				}
			},
			'lineDotGap': {
				label: 'Dot gap',
				type: 'number',
				min: 0,
				max: 1024,
				step: 0.5,
				def: 4,
				section: 'line',
				// only for dotted + dashdot
				condition: c => {
					const s = c.properties.lineStyle;
					return c.properties.line == true && (s === 'dotted' || s === 'dashdot');
				}
			},
			'lineDashOffset': {
				label: 'Dash offset',
				type: 'number',
				min: -9999,
				max: 9999,
				step: 0.5,
				def: 0,
				section: 'line',
				// for anything that actually uses a pattern
				condition: c => {
					const s = c.properties.lineStyle;
					return c.properties.line == true && (s === 'dashed' || s === 'dotted' || s === 'dashdot');
				}
			},
			
			'outline': {
				label: 'Outline',
				type: 'boolean',
				def: false,
				section: 'outline'
			},
			'outlineWidth': {
				label: 'Outline width',
				type: 'number',
				min: 0,
				max: 1000,
				def: 1,
				section: 'outline',
				condition: c => c.properties.outline == true
			},
			'outlineColor': {
				label: 'Outline color',
				type: 'colora',
				def: '#ffffffff',
				section: 'outline',
				condition: c => c.properties.outline == true
			},
			'borderRadius': {
				label: 'Border radius',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 0
			},
			'subtract': {
				label: 'Erase parent',
				type: 'none',
				def: false
			},
			'mask': {
				label: 'Mask',
				type: 'boolean',
				def: false
			},
			'blocks': {
				label: 'Block mouse events',
				type: 'boolean',
				def: false
			}
		},
		manager: D2DGraphic2DManager
	},
	Container2D: {
		name: 'Container 2D',
		is2D: true,
		persistent: true,
		hidden: true,
		fields: {},
		manager: D2DContainerManager
	},
	Text2D: {
		name: 'Text 2D',
		is2D: true,
		sectionsLast: true,
		fields: {
			'text': {
				label: 'Text',
				type: 'longstring',
				def: 'Insert text here'
			},
			'fontFamily': {
				label: 'Font',
				type: 'custom',
				customInspector: 'textFont',
				options: WebSafeFonts.map(fontName => ({
					name: fontName,
					label: fontName
				})),
				def: 'Arial'
			},
			'_textStyle': { // no value, its a placeholder
				label: 'Style',
				type: 'custom',
				customInspector: 'textStyle',
				def: null 
			},
			'fontWeight': { // handled in _textStyle inspector
				label: '',
				type: 'none',
				def: 'normal' 
			},
			'fontStyle': { // handled in _textStyle inspector
				label: '',
				type: 'none',
				def: 'normal' 
			},
			'align': { // handled in _textStyle inspector
				label: '',
				type: 'none',
				def: 'left' 
			},
			'valign': { // handled in _textStyle inspector
				label: '',
				type: 'none',
				def: 'top' 
			},
			'fontSize': {
				label: 'Size',
				type: 'number',
				min: 1,
				max: 200,
				def: 14
			},
			'lineHeight': {
				label: 'Line height',
				type: 'number',
				min: 0.1,
				max: 100,
				def: 1
			},
			'letterSpacing': {
				label: 'Letter spacing',
				type: 'number',
				min: 0,
				max: 100,
				def: 0
			},
			'multiline': {
				label: 'Multiline',
				type: 'boolean',
				def: true
			},
			'wrap': {
				label: 'Word wrap',
				type: 'boolean',
				def: true,
				condition: c => c.properties.multiline === true
			},
			
			'padding': {
				label: 'Padding',
				type: 'boolean',
				def: false,
				section: 'padding'
			},
			'paddingLeft': {
				label: 'Left',
				type: 'number',
				def: 0,
				section: 'padding',
				condition: c => c.properties.padding == true
			},
			'paddingRight': {
				label: 'Right',
				type: 'number',
				def: 0,
				section: 'padding',
				condition: c => c.properties.padding == true
			},
			'paddingTop': {
				label: 'Top',
				type: 'number',
				def: 0,
				section: 'padding',
				condition: c => c.properties.padding == true
			},
			'paddingBottom': {
				label: 'Bottom',
				type: 'number',
				def: 0,
				section: 'padding',
				condition: c => c.properties.padding == true
			},
			
			
			'fill': {
				label: 'Color',
				type: 'boolean',
				section: 'fill',
				def: true
			},
			'fillStyle': {
				label: 'Text color',
				type: 'colora',
				def: '#000000ff',
				section: 'fill',
				condition: c => c.properties.fill == true
			},
			'stroke': {
				label: 'Stroke',
				type: 'boolean',
				section: 'stroke',
				def: false
			},
			'strokeStyle': {
				label: 'Color',
				type: 'colora',
				def: '#000000ff',
				section: 'stroke',
				condition: c => c.properties.stroke == true
			},
			'strokeWidth': {
				label: 'Stroke width',
				type: 'number',
				min: 0,
				max: 1000,
				def: 1,
				section: 'stroke',
				condition: c => c.properties.stroke == true
			},
			'isInput': {
				label: 'Input field',
				type: 'boolean',
				def: false,
				section: 'input'
			},
			'inputFormat': {
				label: 'Format',
				type: 'select',
				def: 'text',
				options: [
					{ name: 'text', label: 'Text' },
					{ name: 'password', label: 'Password' }
				],
				section: 'input',
				condition: c => c.properties.isInput == true
			},
			'inputTabIndex': {
				label: 'Tab index',
				type: 'number',
				def: 0,
				section: 'input',
				condition: c => c.properties.isInput == true
			},
			'caretColor': {
				label: 'Caret color',
				type: 'color',
				def: '#0080ff',
				section: 'input',
				condition: c => c.properties.isInput == true
			}
		},
		manager: D2DTextManager
	},
	Bitmap2D: {
		name: 'Bitmap 2D',
		sectionsLast: true,
		is2D: true,
		fields: {
			'source': {
				label: 'Bitmap',
				type: 'file',
				format: 'img',
				def: ''
			},
			'fit': {
				label: 'Fit',
				type: 'select',
				options: [
					{ name: 'contain', label: 'Contain' },
					{ name: 'cover', label: 'Cover' },
					{ name: 'stretch', label: 'Stretch' }
				],
				def: 'contain'
			},
			'alignX': {
				label: 'Align X',
				type: 'select',
				options: [
					{ name: 'left', label: 'Left' },
					{ name: 'center', label: 'Center' },
					{ name: 'right', label: 'Right' }
				],
				def: 'center'
			},
			'alignY': {
				label: 'Align Y',
				type: 'select',
				options: [
					{ name: 'top', label: 'Top' },
					{ name: 'center', label: 'Center' },
					{ name: 'bottom', label: 'Bottom' }
				],
				def: 'center'
			},
			'imageSmoothing': {
				label: 'Smoothing',
				type: 'boolean',
				def: true
			}
		},
		manager: D2DBitmapManager
	},
	Layout2D: {
		name: 'Layout 2D',
		is2D: true,
		fields: {
			'anchor': {
				label: 'Auto anchor',
				type: 'boolean',
				def: false,
				section: 'anchor',
				description: 'Automatically positions object to anchor relative to parent'
			},
			'anchorVertical': {
				label: 'Vertical',
				type: 'select',
				options: [
					{ name: 'top', label: 'Top' },
					{ name: 'center', label: 'Center' },
					{ name: 'bottom', label: 'Bottom' }
				],
				def: 'center',
				section: 'anchor',
				condition: c => c.properties.anchor == true
			},
			'anchorHorizontal': {
				label: 'Horizontal',
				type: 'select',
				options: [
					{ name: 'left', label: 'Left' },
					{ name: 'center', label: 'Center' },
					{ name: 'right', label: 'Right' }
				],
				def: 'center',
				section: 'anchor',
				condition: c => c.properties.anchor == true
			},
			'anchorOffsetAuto': {
				label: 'Auto calculate offset',
				type: 'boolean',
				def: true,
				section: 'anchor',
				condition: c => c.properties.anchor == true
			},
			'anchorOffsetX': {
				label: 'Offset X',
				type: 'number',
				def: 0,
				section: 'anchor',
				condition: c => c.properties.anchor == true && c.properties.anchorOffsetAuto == false
			},
			'anchorOffsetY': {
				label: 'Offset Y',
				type: 'number',
				def: 0,
				section: 'anchor',
				condition: c => c.properties.anchor == true && c.properties.anchorOffsetAuto == false
			},
			'size': {
				label: 'Auto size',
				type: 'boolean',
				def: false,
				section: 'size',
				description: 'Automatically resizes graphic to match the parent size (requires Graphic2D)'
			},
			'sizeWidth': {
				label: 'Width',
				type: 'boolean',
				def: true,
				section: 'size',
				condition: c => c.properties.size == true
			},
			'sizeHeight': {
				label: 'Height',
				type: 'boolean',
				def: true,
				section: 'size',
				condition: c => c.properties.size == true
			},
			'sizeOffsetAuto': {
				label: 'Auto calculate offset',
				type: 'boolean',
				def: true,
				section: 'size',
				condition: c => c.properties.size == true
			},
			'sizeOffsetX': {
				label: 'Offset width',
				type: 'number',
				def: 0,
				section: 'size',
				condition: c => c.properties.size == true && c.properties.sizeOffsetAuto == false
			},
			'sizeOffsetY': {
				label: 'Offset height',
				type: 'number',
				def: 0,
				section: 'size',
				condition: c => c.properties.size == true && c.properties.sizeOffsetAuto == false
			},
		},
		manager: D2DLayoutManager
	},
	AudioListener: {
		name: 'Audio Listener',
		is2Dand3D: true,
		fields: {
			'masterVolume': {
				label: 'Master volume',
				type: 'number',
				def: 1
			}
		},
		manager: D3DAudioListenerManager
	},
	AudioSource: {
		name: 'Audio Source',
		is2Dand3D: true,
		fields: {
			'audio': {
				label: 'Audio',
				type: 'file',
				format: 'audio',
				def: ''
			},
			'volume': {
				label: 'Volume',
				type: 'slider',
				min: 0,
				max: 1,
				def: 0.5,
				step: 0.01
			},
			'autoPlay': {
				label: 'Auto play',
				type: 'boolean',
				def: true
			},
			'loop': {
				label: 'Loop',
				type: 'boolean',
				def: false
			},
			'soundSpace': {
				label: 'Sound space',
				type: 'select',
				options: [
					{ name: '3D', label: '3D' },
					{ name: '2D', label: '2D' }
				],
				def: '3D'
			},
			'distanceModel': {
				label: 'Distance model',
				type: 'select',
				options: [
					{ name: 'linear', label: 'Linear' },
					{ name: 'inverse', label: 'Inverse' },
					{ name: 'exponential', label: 'Exponential' },
				],
				def: 'linear',
				condition: (c) => c.properties.soundSpace == '3D'
			},
			'refDistance': {
				label: 'Full volume radius',
				description: 'The sound is at full volume within this radius',
				type: 'number',
				def: 10,
				condition: (c) => c.properties.soundSpace == '3D'
			},
			'maxDistance': {
				label: 'Cut-off radius',
				description: 'The sound can not be heard outside of this radius',
				type: 'number',
				def: 100,
				condition: (c) => c.properties.soundSpace == '3D' && c.properties.distanceModel == 'linear'
			},
			'rolloffFactor': {
				label: 'Roll-off factor',
				description: 'How fast the volume is reduced as the listener moves away from the source',
				type: 'number',
				def: 1,
				condition: (c) => c.properties.soundSpace == '3D' && c.properties.distanceModel != 'linear'
			}
		},
		gizmo3d: {
			hidden: true,
			mesh: 'Standard/Models/__Editor/Audio.glb',
			materials: [
				'Standard/Materials/__Editor/Gizmo3D.mat'
			]
		},
		manager: D3DAudioSourceManager
	},
	ParticleSystem: {
		name: 'Particle System',
		displaySectionNames: true,
		manager: D3DParticleSystemManager,
		fields: {
			// ==== Main ====
			maxParticles: {
				section: 'Main',
				label: 'Max particles',
				type: 'number',
				def: 1000,
				min: 1,
				step: 1
			},
			lifetime: {
				section: 'Main',
				label: 'Lifetime (s)',
				type: 'number',
				def: 2.0,
				min: 0.01,
				step: 0.01
			},
			startSpeed: {
				section: 'Main',
				label: 'Start speed',
				type: 'number',
				def: 2.0,
				step: 0.01
			},
			startSize: {
				section: 'Main',
				label: 'Start size',
				type: 'number',
				def: 1,
				min: 0,
				step: 0.001
			},
			endSize: {
				section: 'Main',
				label: 'End size',
				type: 'number',
				def: 1,
				min: 0,
				step: 0.001
			},
			color: {
				section: 'Main',
				label: 'Color',
				type: 'colorbest',
				def: 'rgba(255,255,255,1)',
				description: "The color of the particles. Use a gradient to smoothly change color and transparency over the particle’s lifetime."
			},
			prewarm: {
				section: 'Main',
				label: 'Prewarm',
				type: 'boolean',
				def: false,
				description: 'Simulate full lifetime on start for seamless startup'
			},
			simulationSpace: {
				section: 'Main',
				label: 'Simulation',
				type: 'select',
				options: [
					{ name: 'local', label: 'Local' },
					{ name: 'world', label: 'World' }
				],
				def: 'local'
			},
		
			// ==== Emission / Playback ====
			emissionRate: {
				section: 'Emission / Playback',
				label: 'Emission /s',
				type: 'number',
				def: 50,
				min: 0,
				step: 1
			},
			looping: {
				section: 'Emission / Playback',
				label: 'Looping',
				type: 'boolean',
				def: true
			},
			playOnAwake: {
				section: 'Emission / Playback',
				label: 'Auto play',
				type: 'boolean',
				def: true
			},
		
			// ==== Shape ====
			shape: {
				section: 'Shape',
				label: 'Shape',
				type: 'select',
				options: [
					{ name: 'point',  label: 'Point' },
					{ name: 'sphere', label: 'Sphere' },
					{ name: 'cone',   label: 'Cone' },
					{ name: 'box',    label: 'Box' }
				],
				def: 'sphere'
			},
			shapeRadius: {
				section: 'Shape',
				label: 'Radius',
				type: 'number',
				def: 0.5,
				min: 0,
				step: 0.01,
				condition: c => c.properties.shape === 'sphere'
			},
			coneAngleDeg: {
				section: 'Shape',
				label: 'Cone angle (°)',
				type: 'slider',
				def: 20,
				min: 0,
				max: 89,
				step: 0.1,
				condition: c => c.properties.shape === 'cone'
			},
			boxSize: {
				section: 'Shape',
				label: 'Box size',
				type: 'vector3',
				def: { x: 1, y: 1, z: 1 },
				condition: c => c.properties.shape === 'box'
			},
		
			// ==== Renderer ====
			texture: {
				section: 'Renderer',
				label: 'Texture',
				type: 'file',
				def: '',
				format: 'img'
			},
			blending: {
				section: 'Renderer',
				label: 'Blending',
				type: 'select',
				options: [
					{ name: 'normal',   label: 'Normal' },
					{ name: 'add',      label: 'Additive' },
					{ name: 'multiply', label: 'Multiply' }
				],
				def: 'add'
			},
			sizeAttenuation: {
				section: 'Renderer',
				label: 'Size attenuation',
				type: 'boolean',
				def: true
			},
			useDayNight: {
				section: 'Renderer',
				label: 'Use day/night cycle lighting',
				type: 'boolean',
				def: false
			},
		
			// ==== Over Lifetime ====
			
			// ---------- Velocity over lifetime ----------
			velocityOverLifetime: {
				section: 'Over Lifetime',
				label: 'Velocity over lifetime',
				type: 'vector3',
				def: { x: 0, y: 0, z: 0 },
				condition: c => c.properties.velocityOverLifetimeRandom != true
			},
			velocityOverLifetimeRandom: {
				section: 'Over Lifetime',
				label: 'Random velocity',
				type: 'boolean',
				def: false
			},
			
			velocityOverLifetimeRandomMin: {
				section: 'Over Lifetime',
				label: 'Velocity min',
				description: 'Per-particle value (sampled once on spawn)',
				type: 'vector3',
				def: { x: 0, y: 0, z: 0 },
				condition: c => c.properties.velocityOverLifetimeRandom == true
			},
			
			velocityOverLifetimeRandomMax: {
				section: 'Over Lifetime',
				label: 'Velocity max',
				description: 'Per-particle value (sampled once on spawn)',
				type: 'vector3',
				def: { x: 0, y: 0, z: 0 },
				condition: c => c.properties.velocityOverLifetimeRandom == true
			},
			
			
			// ---------- Angular velocity over lifetime ----------
			angularVelocityOverLifetime: {
				section: 'Over Lifetime',
				label: 'Angular velocity over lifetime',
				description: 'Billboard spin; uses Z (radians/sec)',
				type: 'vector3',
				def: { x: 0, y: 0, z: 0 },
				condition: c => c.properties.angularVelocityOverLifetimeRandom != true
			},
			angularVelocityOverLifetimeRandom: {
				section: 'Over Lifetime',
				label: 'Random angular velocity',
				type: 'boolean',
				def: false
			},
			
			angularVelocityOverLifetimeRandomMin: {
				section: 'Over Lifetime',
				label: 'Angular velocity min',
				description: 'Per-particle value (sampled once on spawn)',
				type: 'vector3',
				def: { x: 0, y: 0, z: 0 },
				condition: c => c.properties.angularVelocityOverLifetimeRandom == true
			},
			
			angularVelocityOverLifetimeRandomMax: {
				section: 'Over Lifetime',
				label: 'Angular velocity max',
				description: 'Per-particle value (sampled once on spawn)',
				type: 'vector3',
				def: { x: 0, y: 0, z: 0 },
				condition: c => c.properties.angularVelocityOverLifetimeRandom == true
			},
			
			
			// ---------- Start rotation ----------
			startRotationDeg: {
				section: 'Over Lifetime',
				label: 'Start rotation °',
				type: 'number',
				def: 0,
				step: 0.1,
				condition: c => c.properties.startRotationRandom != true
			},
			startRotationRandom: {
				section: 'Over Lifetime',
				label: 'Random start rotation',
				type: 'boolean',
				def: false
			},
			
			startRotationRandomMinDeg: {
				section: 'Over Lifetime',
				label: 'Start rotation min °',
				description: 'Per-particle value (sampled once on spawn)',
				type: 'number',
				def: 0,
				step: 0.1,
				condition: c => c.properties.startRotationRandom == true
			},
			
			startRotationRandomMaxDeg: {
				section: 'Over Lifetime',
				label: 'Start rotation max °',
				description: 'Per-particle value (sampled once on spawn)',
				type: 'number',
				def: 0,
				step: 0.1,
				condition: c => c.properties.startRotationRandom == true
			},
		}
	},
	CameraCollision: {
		name: 'Camera Collision',
		fields: {
			'targetName': {
				label: 'Target name',
				description: 'Path to the target object instance (.target property pointing to an object instance overrides this value)',
				type: 'string',
				def: ''
			},
			'targetOffset': {
				label: 'Target offset',
				description: 'Offset applied in world space to the player position before collision resolution',
				type: 'vector3',
				def: {x: 0, y: 0, z: 0}
			},
			'radius': {
				label: 'Collision radius',
				description: 'Camera will offset the collision point by this amount',
				type: 'number',
				def: 0.5,
				step: 0.1
			},
			'offset': {
				label: 'Collision offset',
				description: 'Offset applied in world space to the camera after a collision is solved',
				type: 'vector3',
				def: {x: 0, y: 0, z: 0}
			},
			'minDistance': {
				label: 'Minimum distance',
				description: 'Minimum distance allowed to target before it latches to the target position',
				type: 'number',
				min: 0.01,
				max: Infinity,
				def: 0.1,
			},
			'smoothing': {
				label: 'Smoothing',
				type: 'boolean',
				def: false
			},
			'smoothingSpeed': {
				label: 'Smoothing speed',
				type: 'number',
				min: 0.01,
				max: Infinity,
				def: 5,
				condition: c => c.properties.smoothing === true
			},
		},
		manager: D3DCameraCollisionManager
	},
	FirstPersonCamera: {
		name: 'First Person Camera',
		sectionsLast: true,
		fields: {
			'targetName': {
				label: 'Target name',
				description: 'Path to the target object instance (.target property pointing to an object instance overrides this value)',
				type: 'string',
				def: '',
				section: 'target'
			},
			'targetOffset': {
				label: 'Target offset',
				type: 'vector3',
				def: {x: 0, y: 0, z: 0},
				section: 'target'
			},
			'rotateSpeed': {
				label: 'Rotate speed',
				description: 'Mouse look sensitivity',
				section: 'speeds',
				type: 'number',
				def: 1,
				min: 0.1,
				max: 10,
				step: 0.1
			},
			'smoothRotate': {
				label: 'Smooth rotate',
				type: 'boolean',
				def: false,
				section: 'speeds'
			},
			'damping': {
				label: 'Damping amount',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 5,
				condition: c => c.properties.smoothRotate === true,
				section: 'speeds'
			},
			'invertX': {
				label: 'Invert X-axis',
				section: 'rotation',
				type: 'boolean',
				def: false,
				condition: c => c.properties.advancedControls == true
			},
			'invertY': {
				label: 'Invert Y-axis',
				section: 'rotation',
				type: 'boolean',
				def: false,
				condition: c => c.properties.advancedControls == true
			},
			'mouseLock': {
				label: 'Lock mouse (pointer lock)',
				section: 'rotation',
				type: 'boolean',
				def: true,
				condition: c => c.properties.advancedControls == true
			},
			'minPitchDeg': {
				label: 'Minimum pitch',
				section: 'rotation',
				description: 'Look-down limit (negative angle in degrees)',
				type: 'number',
				def: -80,
				min: -90,
				max: 0,
				step: 1,
				condition: c => c.properties.advancedControls == true
			},
			'maxPitchDeg': {
				label: 'Maximum pitch',
				section: 'rotation',
				description: 'Look-up limit (positive angle in degrees)',
				type: 'number',
				def: 80,
				min: 0,
				max: 90,
				step: 1,
				condition: c => c.properties.advancedControls == true
			},
			'useWorldTargetPosition': {
				label: 'Use world target position',
				section: 'rotation',
				type: 'boolean',
				def: false,
				condition: c => c.properties.advancedControls == true
			},
			'advancedControls': {
				label: 'Advanced controls',
				type: 'boolean',
				def: false
			},
		},
		manager: D3DFirstPersonCameraManager
	},
	FirstPersonCharacterController: {
		name: 'First Person Character Controller',
		sectionsLast: true,
		fields: {
			'cameraName': {
				label: 'Camera name',
				description: 'Path to the camera object instance that determines the direction of the character (.camera property pointing to an object instance overrides this value)',
				type: 'string',
				def: ''
			},
			'moveSpeed': {
				label: 'Move speed',
				section: 'movement',
				type: 'number',
				def: 1,
				min: 0,
				step: 0.1
			},
			'jumpHeight': {
				label: 'Jump height',
				section: 'movement',
				type: 'number',
				def: 2,
				min: 0,
				step: 0.1
			},
			'gravityStrength': {
				label: 'Gravity strength',
				section: 'movement',
				type: 'number',
				def: 1,
				min: 0,
				condition: c => false // just hide this
			},
			'invertFwd': {
				label: 'Invert forward',
				section: 'movement',
				type: 'boolean',
				def: false,
				condition: c => c.properties.advancedControls == true
			},
			'invertHoriz': {
				label: 'Invert horizontal',
				section: 'movement',
				type: 'boolean',
				def: false,
				condition: c => c.properties.advancedControls == true
			},
			'advancedControls': {
				label: 'Advanced controls',
				type: 'boolean',
				def: false
			}
		},
		manager: D3DFirstPersonCharacterController
	},
	Filter2D: {
		name: 'Filter 2D',
		is2D: true,
		sectionsLast: true,
		fields: {
			'brightness': {
				label: 'Brightness',
				type: 'islider',
				min: -1,
				max: 1,
				step: 0.01,
				def: 0
			},
			'tint': {
				label: 'Tint',
				type: 'boolean',
				def: false
			},
			'tintColor': {
				label: 'Tint color',
				type: 'colorbest',
				def: 'rgba(255,255,255,1)',
				condition: c => c.properties.tint === true
			},
			'filterOpacity': {
				label: 'Opacity',
				type: 'islider',
				min: 0,
				max: 1,
				step: 0.01,
				def: 1
			},
			'blend': {
				label: 'Blend mode',
				type: 'select',
				options: [
					{ name: 'normal',    label: 'Normal' },
					{ name: 'darken',    label: 'Darken' },
					{ name: 'multiply',  label: 'Multiply' },
					{ name: 'lighten',   label: 'Lighten' },
					{ name: 'screen',    label: 'Screen' },
					{ name: 'overlay',   label: 'Overlay' },
					{ name: 'hard-light',label: 'Hard Light' },
					{ name: 'add',       label: 'Add' },
					{ name: 'subtract',  label: 'Subtract' },
					{ name: 'difference',label: 'Difference' },
					{ name: 'invert',    label: 'Invert' },
					{ name: 'alpha',     label: 'Alpha' },
					{ name: 'erase',     label: 'Erase' }
				],
				def: 'normal'
			},
			
			'glow': {
				label: 'Glow',
				type: 'boolean',
				def: false,
				section: 'glow'
			},
			'glowColor': {
				label: 'Color',
				type: 'colora',
				def: '#ffffffff',
				section: 'glow',
				condition: c => c.properties.glow === true
			},
			'glowBlur': {
				label: 'Blur',
				type: 'number',
				min: -256,
				max: 256,
				step: 1,
				def: 8,
				section: 'glow',
				condition: c => c.properties.glow === true
			},
			'glowStrength': {
				label: 'Strength',
				type: 'number',
				min: 0,
				step: 0.1,
				def: 1,
				section: 'glow',
				condition: c => c.properties.glow === true
			},
			
			'shadow': {
				label: 'Drop shadow',
				type: 'boolean',
				def: false,
				section: 'shadow'
			},
			'shadowColor': {
				label: 'Shadow color',
				type: 'colora',
				def: '#000000ff',
				section: 'shadow',
				condition: c => c.properties.shadow === true
			},
			'shadowAngle': {
				label: 'Shadow angle (deg)',
				type: 'number',
				min: -360,
				max: 360,
				step: 1,
				def: 45,
				section: 'shadow',
				condition: c => c.properties.shadow === true
			},
			'shadowDistanceX': {
				label: 'Distance X',
				type: 'number',
				min: -1024,
				max: 1024,
				step: 0.5,
				def: 4,
				section: 'shadow',
				condition: c => c.properties.shadow === true
			},
			'shadowDistanceY': {
				label: 'Distance Y',
				type: 'number',
				min: -1024,
				max: 1024,
				step: 0.5,
				def: 4,
				section: 'shadow',
				condition: c => c.properties.shadow === true
			},
			'shadowBlur': {
				label: 'Blur',
				type: 'number',
				min: 0,
				max: 256,
				step: 1,
				def: 8,
				section: 'shadow',
				condition: c => c.properties.shadow === true
			},
			'shadowType': {
				label: 'Type',
				type: 'select',
				def: 'outer',
				section: 'shadow',
				options: [
					{ name: 'outer', label: 'Outer' },
					//{ name: 'inner', label: 'Inner' }
				],
				condition: c => c.properties.shadow === true
			}
		},
		manager: D2DFilterManager
	},
	AutoLOD: {
		name: 'Auto LOD',
		sectionsLast: true,
		fields: {
			'levels': {
				label: 'Levels',
				type: 'islider',
				min: 1,
				max: 4,
				step: 1,
				def: 3
			},
			'simplification': {
				label: 'Simplification',
				type: 'islider',
				min: 0.01,
				max: 1,
				step: 0.01,
				def: 0.25
			},
			'maxDistance': {
				label: 'Maximum distance',
				type: 'number',
				min: 1,
				step: 1,
				def: 100,
				description: 'Beyond this distance, the mesh is culled'
			},
			'cameraName': {
				label: 'Camera name',
				description: 'Path to the camera object (.camera property pointing to an object instance overrides this value)',
				type: 'string',
				def: ''
			},
			'applyToChildren': {
				label: 'Apply to children',
				description: 'When true, all mesh children will recursively be included in the simplification',
				type: 'boolean',
				def: false
			},
			'centerType': {
				label: 'Center type',
				type: 'select',
				def: 'pivot',
				options: [
					{ name: 'pivot', label: 'Pivot Point' },
					{ name: 'center', label: 'Center' }
				]
			},
			'billboardWhenCulled': {
				label: 'Render billboard',
				description: 'When true, the billboard texture will show when meshes are culled',
				type: 'boolean',
				section: 'billboard',
				def: false
			},
			'billboardTexture': {
				label: 'Texture',
				type: 'file',
				def: '',
				format: 'img',
				section: 'billboard',
				condition: c => c.properties.billboardWhenCulled == true
			},
			'billboardOffset': {
				label: 'Offset',
				type: 'vector3',
				def: {x: 0, y: 0, z: 0},
				section: 'billboard',
				condition: c => c.properties.billboardWhenCulled == true
			},
			'billboardScale': {
				label: 'Scale',
				type: 'vector3',
				def: {x: 1, y: 1, z: 1},
				section: 'billboard',
				condition: c => c.properties.billboardWhenCulled == true
			},
			'billboardInstancing': {
				label: 'Instancing',
				type: 'boolean',
				section: 'billboard',
				def: false,
				condition: c => c.properties.billboardWhenCulled == true
			}
			/*'cullAO': {
				label: 'Ambient occlusion culling',
				type: 'boolean',
				section: 'ao',
				def: false
			},
			'aoDistance': {
				label: 'Distance',
				type: 'number',
				section: 'ao',
				def: 300,
				condition: c => c.properties.cullAO == true
			}*/
		},
		manager: D3DAutoLODManager
	},
	DayNightCycle: {
		name: 'Day Night Cycle',
		fields: {
			hour: {
				label: 'Hour',
				type: 'islider',
				min: 0,
				max: 24,
				step: 0.01,
				def: 12,
				section: 'time'
			},
			sunrise: {
				label: 'Sunrise',
				type: 'islider',
				min: 0,
				max: 24,
				step: 0.01,
				def: 7,
				section: 'time'
			},
			sunset: {
				label: 'Sunset',
				type: 'islider',
				min: 0,
				max: 24,
				step: 0.01,
				def: 19,
				section: 'time'
			},
			sunEnabled: {
				label: 'Enable sun',
				type: 'boolean',
				def: true,
				section: 'sun'
			},
			sunFlareTexture: {
				label: 'Sun flare texture',
				type: 'file',
				format: 'img',
				def: '',
				condition: c => c.properties.sunEnabled !== false,
				section: 'sun'
			},
			sunScale: {
				label: 'Sun scale',
				type: 'vector3',
				def: {x: 1, y: 1, z: 1},
				section: 'sun',
				condition: c => c.properties.sunEnabled !== false
			},
			sunriseTexture: {
				label: 'Sunrise sky',
				type: 'file',
				format: 'img',
				def: '',
				section: 'sunrise'
			},
			sunriseTint: {
				label: 'Sunrise tint',
				type: 'color',
				def: '0xFFC2D4',
			//	condition: c => !!c.properties.sunriseTexture,
				section: 'sunrise'
			},
			dayTexture: {
				label: 'Day sky',
				type: 'file',
				format: 'img',
				def: '',
				section: 'day'
			},
			dayTint: {
				label: 'Day tint',
				type: 'color',
				def: '0xD9F5FF',
			//	condition: c => !!c.properties.dayTexture,
				section: 'day'
			},
			sunsetTexture: {
				label: 'Sunset sky',
				type: 'file',
				format: 'img',
				def: '',
				section: 'sunset'
			},
			sunsetTint: {
				label: 'Sunset tint',
				type: 'color',
				def: '0xFFC3A3',
			//	condition: c => !!c.properties.sunsetTexture,
				section: 'sunset'
			},
			nightTexture: {
				label: 'Night sky',
				type: 'file',
				format: 'img',
				def: '',
				section: 'night'
			},
			nightTint: {
				label: 'Night tint',
				type: 'color',
				def: '0x000000',
			//	condition: c => !!c.properties.nightTexture,
				section: 'night'
			},
			skyDomeRadius: {
				label: 'Sky dome radius',
				type: 'number',
				min: 10,
				max: 50000,
				step: 10,
				def: 1000,
				section: 'skydome'
			},
			skyDomeOffset: {
				label: 'Sky dome offset',
				type: 'vector3',
				def: {x: 0, y: 0, z: 0},
				section: 'skydome'
			},
			sunOffset: {
				label: 'Sunlight offset',
				type: 'vector3',
				def: {x: 0, y: 0, z: 0},
				section: 'skydome'
			},
			lightMultiplierDir: {
				label: 'Directional light intensity',
				type: 'number',
				min: 0,
				def: 1,
				section: 'light'
			},
			lightMultiplierAmb: {
				label: 'Ambient light intensity',
				type: 'number',
				min: 0,
				def: 1,
				section: 'light'
			}
		},
		manager: D3DDayNightManager
	},
	Stamper: {
		name: 'Stamper',
		sectionsLast: true,
		fields: {
			radius: {
				label: 'Stamp radius',
				type: 'islider',
				min: 1,
				max: 200,
				def: 10,
				section: 'stamping'
			},
			strength: {
				label: 'Strength',
				type: 'islider',
				min: 0,
				max: 1,
				step: 0.01,
				def: 0.5,
				section: 'stamping'
			},
			rotateToNormal: {
				label: 'Match surface',
				description: 'Each stamp will rotate itself to match the surface normal of the ground',
				type: 'boolean',
				def: true,
				section: 'stamping'
			},
			randomness: {
				label: 'Randomness',
				type: 'boolean',
				def: false,
				section: 'stamping'
			},
			scaleFrom: {
				label: 'Scale from',
				type: 'vector3',
				def: {x: 1, y: 1, z: 1},
				section: 'randscl',
				condition: c => c.properties.randomness === true
			},
			scaleTo: {
				label: 'Scale to',
				type: 'vector3',
				def: {x: 2, y: 2, z: 2},
				section: 'randscl',
				condition: c => c.properties.randomness === true
			},
			scaleUniform: {
				label: 'Uniform',
				type: 'boolean',
				def: false,
				section: 'randscl',
				condition: c => c.properties.randomness === true
			},
			rotateFrom: {
				label: 'Rotate from',
				type: 'vector3',
				def: {x: 0, y: 0, z: 0},
				section: 'randrot',
				condition: c => c.properties.randomness === true
			},
			rotateTo: {
				label: 'Rotate to',
				type: 'vector3',
				def: {x: 180, y: 0, z: 0},
				section: 'randrot',
				condition: c => c.properties.randomness === true
			},
			active: {
				label: 'Active',
				type: 'select',
				options: c => {
					const names = [];
					c.properties.symbols.forEach(uuid => {
						const idx = c.properties.symbols.indexOf(uuid);
						const path = _root.resolvePath(uuid);
						const symbol = Object.values(_root.__symbols).find(s => s.file?.name == path);
						
						if(!symbol)  {
							console.warn('Stamper: Cant find symbol from asset UUID', uuid);
							return;
						}
						
						names.push({
							name: idx,
							label: fileNameNoExt(path)
						});
					});
					return names;
				},
				condition: c => c.properties.symbols?.length > 0
			},
			symbols: {
				label: 'Symbols',
				type: 'file[]',
				format: 'symbol',
				def: []
			}
		},
		manager: D3DStamperManager
	},
	Trigger: {
		name: 'Trigger',
		fields: {
			'targetName': {
				label: 'Target name',
				description: 'Path to the target object instance (.target property pointing to an object instance overrides this value)',
				type: 'string',
				def: ''
			},
			'label': {
				label: 'Label',
				type: 'string',
				def: ''
			}
		},
		manager: D3DTriggerManager
	}
}

export default D3DComponents;