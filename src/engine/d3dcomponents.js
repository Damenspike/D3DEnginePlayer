import * as THREE from 'three';

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

const D3DComponents = {
	Mesh: {
		fields: {
			'mesh': {
				label: 'Model',
				type: 'file',
				format: 'model',
				def: '',
				readOnly: true
			},
			'_meshKeys': {
				label: '',
				type: 'none',
				def: []
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
		fields: {
			'materials': { 
				label: 'Materials', 
				type: 'file[]',
				format: 'material',
				def: []
			}
		},
		manager: D3DMeshManager
	},
	Camera: {
		fields: {
			'fieldOfView': {
				label: 'Field of view',
				type: 'slider',
				min: 1,
				max: 179,
				def: 75
			},
			'clipNear': { 
				label: 'Minimum distance', 
				type: 'number',
				min: 0.0001,
				max: 100,
				def: 0.1
			},
			'clipFar': { 
				label: 'Maximum distance', 
				type: 'number',
				min: 1,
				max: 10000000,
				def: 2000
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
			'color': {
				label: 'Color',
				type: 'color',
				def: '#ffffff'
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
			'castShadow': { 
				label: 'Casts shadows', 
				type: 'boolean',
				def: true
			}
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
				min: 0,
				def: 0 // no limit
			},
			'decay': { 
				label: 'Decay', 
				type: 'number',
				min: 0,
				def: 2
			},
			'castShadow': { 
				label: 'Casts shadows', 
				type: 'boolean',
				def: true
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
				min: 0,
				def: 0
			},
			'angle': { 
				label: 'Distance', 
				type: 'slider',
				min: 0,
				max: 360,
				def: 0,
				convert: (val) => THREE.MathUtils.degToRad(val)
			},
			'castShadow': { 
				label: 'Casts shadows', 
				type: 'boolean',
				def: true
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
			'shapeBias': {
				label: 'Bias', 
				type: 'number',
				def: 1,
				description: 'Affects the scale of the generated physics shape'
			},
			'friction': {
				label: 'Friction',
				type: 'number',
				min: 0,
				max: 1,
				def: 0.5
			},
			'bounciness': {
				label: 'Bounciness',
				type: 'number',
				min: 0,
				max: 1,
				def: 0.5
			},
			'density': {
				label: 'Density',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 1
			}
		},
		manager: D3DRigidbodyManager
	},
	CharacterController: {
		name: 'Character Controller',
		fields: {
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
			}
		},
		manager: D3DCharacterControllerManager
	},
	ThirdPersonCamera: {
		name: 'Third Person Camera',
		fields: {
			'targetName': {
				label: 'Target name',
				description: 'Instance name of the target object (.target property pointing to an object instance overrides this value)',
				type: 'string',
				def: ''
			},
			'distance': {
				label: 'Distance',
				description: 'Distance from target',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 1
			},
			'height': {
				label: 'Height',
				description: 'Y offset from target position',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 0.5
			},
			'rotateSpeed': {
				label: 'Rotate speed',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 1
			},
			'zoomSpeed': {
				label: 'Zoom speed',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 1
			},
			'minDist': {
				label: 'Minimum distance',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 0.25
			},
			'maxDist': {
				label: 'Maximum distance',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 6
			}
		},
		manager: D3DThirdPersonCameraManager
	},
	Graphic2D: {
		name: 'Graphic 2D',
		fields: {
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
			'line': {
				label: 'Line',
				type: 'boolean',
				def: true
			},
			'lineWidth': {
				label: 'Line width',
				type: 'number',
				min: 0,
				max: 100,
				def: 1,
				condition: c => c.properties.line == true
			},
			'lineColor': {
				label: 'Line color',
				type: 'colora',
				def: '#ffffff',
				condition: c => c.properties.line == true
			},
			'fill': {
				label: 'Fill',
				type: 'boolean',
				def: true
			},
			'fillColor': {
				label: 'Fill color',
				type: 'colora',
				def: '#ffffffff',
				condition: c => c.properties.fill == true
			},
			'borderRadius': {
				label: 'Border radius',
				type: 'number',
				min: 0,
				max: Infinity,
				def: 0
			}
		},
		manager: function() {}
	}
}

export default D3DComponents;