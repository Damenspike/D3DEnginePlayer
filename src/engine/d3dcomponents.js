import * as THREE from 'three';

const D3DComponents = {
	Mesh: {
		fields: {
			'mesh': {
				label: 'Model',
				type: 'file',
				format: 'model',
				def: ''
			},
			'materials': { 
				label: 'Materials', 
				type: 'file[]',
				format: 'material',
				def: []
			}
		}
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
				min: 0,
				max: 10000000,
				def: 100
			},
			'clipFar': { 
				label: 'Maximum distance', 
				type: 'number',
				min: 1,
				max: 10000000,
				def: 100000
			}
		},
		gizmo3d: {
			hidden: true,
			mesh: 'Standard/Models/__Editor/Camera.glb',
			materials: [
				'Standard/Materials/__Editor/Gizmo3D.mat'
			]
		}
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
		}
	},
	DirectionalLight: {
		name: 'Directional Light',
		fields: {
			'color': {
				label: 'Color',
				type: 'color',
				def: '#ffffff'
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
		}
	},
	PointLight: {
		name: 'Point Light',
		fields: {
			'color': {
				label: 'Color',
				type: 'color',
				def: '#ffffff'
			},
			'intensity': { 
				label: 'Intensity', 
				type: 'number',
				min: 0,
				def: 1
			},
			'power': { 
				label: 'Power', 
				type: 'number',
				min: 0,
				def: 0
			},
			'distance': { 
				label: 'Distance', 
				type: 'number',
				min: 0,
				def: 0 // no limit
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
		}
	},
	SpotLight: {
		name: 'Spot Light',
		fields: {
			'color': {
				label: 'Color',
				type: 'color',
				def: '#ffffff'
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
		}
	},
	HTML: {
		name: 'HTML Overlay',
		fields: {
			'source': {
				label: 'Source',
				type: 'file',
				format: 'html',
				def: ''
			}
		}
	}
}

export default D3DComponents;