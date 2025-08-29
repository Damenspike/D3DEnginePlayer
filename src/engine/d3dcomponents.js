import * as THREE from 'three';

const D3DComponents = {
	Mesh: {
		fields: {
			'mesh': {
				label: 'Model',
				type: 'file',
				format: 'mat'
			},
			'materials': { 
				label: 'Materials', 
				type: 'file[]',
				format: 'mat'
			}
		}
	},
	Camera: {
		fields: {
			'fieldOfView': {
				label: 'Field of view',
				type: 'slider',
				min: 1,
				max: 179
			},
			'clipNear': { 
				label: 'Minimum distance', 
				type: 'number',
				min: 0,
				max: 10000000
			},
			'clipFar': { 
				label: 'Maximum distance', 
				type: 'number',
				min: 1,
				max: 10000000
			}
		}
	},
	AmbientLight: {
		name: 'Ambient Light',
		fields: {
			'color': {
				label: 'Color',
				type: 'color'
			}
		}
	},
	DirectionalLight: {
		name: 'Directional Light',
		fields: {
			'color': {
				label: 'Color',
				type: 'color'
			},
			'intensity': { 
				label: 'Intensity', 
				type: 'number',
				min: 0
			},
			'castShadow': { 
				label: 'Casts shadows', 
				type: 'boolean'
			}
		}
	},
	PointLight: {
		name: 'Point Light',
		fields: {
			'color': {
				label: 'Color',
				type: 'color'
			},
			'intensity': { 
				label: 'Intensity', 
				type: 'number',
				min: 0
			},
			'power': { 
				label: 'Power', 
				type: 'number',
				min: 0
			},
			'distance': { 
				label: 'Distance', 
				type: 'number',
				min: 0
			},
			'castShadow': { 
				label: 'Casts shadows', 
				type: 'boolean'
			}
		}
	},
	SpotLight: {
		name: 'Spot Light',
		fields: {
			'color': {
				label: 'Color',
				type: 'color'
			},
			'intensity': { 
				label: 'Intensity', 
				type: 'number',
				min: 0
			},
			'distance': { 
				label: 'Distance', 
				type: 'number',
				min: 0
			},
			'angle': { 
				label: 'Distance', 
				type: 'slider',
				min: 0,
				max: 360,
				convert: (val) => THREE.MathUtils.degToRad(val)
			},
			'castShadow': { 
				label: 'Casts shadows', 
				type: 'boolean'
			}
		}
	},
	HTML: {
		name: 'HTML Overlay',
		fields: {
			'source': {
				label: 'Source',
				type: 'file',
				format: 'html'
			}
		}
	}
}

export default D3DComponents;