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
import D2DTextManager from './d2dmgr_text.js';
import D2DBitmapManager from './d2dmgr_bitmap.js';
import D2DGraphic2DManager from './d2dmgr_graphic2d.js';
import D2DLayoutManager from './d2dmgr_layout.js';

import { WebSafeFonts } from './d3dfonts.js';

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
		persistent: true,
		fields: {
			'_paths': { // legacy
				label: '',
				type: 'none',
				def: []
			},
			'_points': { // legacy
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
			}
		},
		manager: D2DGraphic2DManager
	},
	Container2D: {
		name: 'Container 2D',
		persistent: true,
		hidden: true,
		fields: {},
		manager: function() {}
	},
	Text2D: {
		name: 'Text 2D',
		sectionsLast: true,
		fields: {
			'text': {
				label: 'Text',
				type: 'string',
				def: 'Insert text here'
			},
			'fontFamily': {
				label: 'Font',
				type: 'select',
				options: WebSafeFonts.map(fontName => ({
					name: fontName,
					label: fontName
				})),
				def: 'Arial'
			},
			'_textStyle': { // no value, its a placeholder
				label: 'Style',
				type: '_textStyle',
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
			'wrap': {
				label: 'Word wrap',
				type: 'boolean',
				def: true
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
			'caretColor': {
				label: 'Caret color',
				type: 'color',
				def: '#0080ff',
				section: 'input',
				condition: c => c.properties.isInput == true
			},
		},
		manager: D2DTextManager
	},
	Bitmap2D: {
		name: 'Bitmap 2D',
		sectionsLast: true,
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
	}
}

export default D3DComponents;