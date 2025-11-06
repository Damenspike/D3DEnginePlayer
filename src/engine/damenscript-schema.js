export const KEYWORDS = [
	'var', 'let','const','function','return','if','else','for','while','break','continue', 'async', 'await',
	'true','false','null','undefined','import','from','export','struct','enum','match',
	'case','default','try','catch','finally','throw', 'this', 'root', '_root', 'parent'
]
export const TYPE_KEYWORDS = [
	'number','string','bool','Vector2','Vector3','Vector4','MathUtils','Box3','Quaternion','crypto','Math','JSON','Promise','WebSocket','console','Raycaster','Color','Euler','Box4','Sphere','Plane'
]
export const FORBIDDEN_KEYWORDS = [
	'window','document','globalThis',
	'require','process',
	'Function','eval',
	'import','new'
];
export const FORBIDDEN_PROPS = [
	// hard blockers (escape hatches / proto pivots)
	'constructor','prototype','__proto__',
	
	// call plumbing (prevents rebinding/currying tricks)
	'caller','callee','arguments',
	'call','apply','bind',
	
	// legacy meta accessors (close weird edges)
	'__defineGetter__','__defineSetter__',
	'__lookupGetter__','__lookupSetter__',
	
	// optionals
	'toString','valueOf',

	// engine internals
	'__script','__onInternalEnterFrame','__onEditorEnterFrame',
	'__componentInstances','__deleted','__animatedTransformChange',
	'_animation','_mesh','_camera','_directionallight','_ambientlight',
	'_pointlight','__runInSandbox'
];
export const D3D_OBJECT_SCHEMA = {
	name: {
		type: 'string',
		doc: 'Instance name of the object.'
	},
	position: {
		type: 'Vector3',
		doc: 'Local position (x,y,z).'
	},
	rotation: {
		type: 'Vector3',
		doc: 'Local rotation (pitch,yaw,roll).'
	},
	scale: {
		type: 'Vector3',
		doc: 'Local scale.'
	},
	worldPosition: {
		type: 'Vector3',
		doc: 'World position (x,y,z).'
	},
	worldRotation: {
		type: 'Vector3',
		doc: 'World rotation (x,y,z).'
	},
	opacity: {
		type: 'number',
		doc: 'Opacity of the object.'
	},
	visible: {
		type: 'boolean',
		doc: 'Visibility of the object.'
	},

	forward: {
		type: 'Vector3',
		doc: 'Forward vector.'
	},
	right: {
		type: 'Vector3',
		doc: 'Right vector.'
	},
	up: {
		type: 'Vector3',
		doc: 'Up vector.'
	},

	root: {
		type: 'D3DObject|null',
		doc: 'Root object relative to this file.'
	},
	parent: {
		type: 'D3DObject|null',
		doc: 'Parent object.'
	},
	children: {
		type: 'D3DObject[]',
		doc: 'Immediate children.'
	},
	
	_animation: {
		type: 'Manager',
		doc: 'Animation manager (if exists)'
	},
	_camera: {
		type: 'Manager',
		doc: 'Camera manager (if exists)'
	},
	_mesh: {
		type: 'Manager',
		doc: 'Mesh manager (if exists)'
	},

	createObject: {
		type: 'Function(child:D3DObject):void',
		doc: 'Create a child object.'
	},
	delete: {
		type: 'Function():void',
		doc: 'Delete object.'
	},
	onEnterFrame: {
		type: 'Function():void',
		doc: 'Called before the frame is rendered.'
	},
	onBeforeRender: {
		type: 'Function():void',
		doc: 'Called after onEnterFrame but still before the frame is rendered.'
	},
	onExitFrame: {
		type: 'Function():void',
		doc: 'Called after the frame is rendered.'
	},
	getComponent: {
		type: 'Function():ComponentManager',
		doc: 'Returns the component manager attached to a D3DObject'
	},
	hasComponent: {
		type: 'Function():boolean',
		doc: 'Returns whether a component is attached to a D3DObject'
	},
	addComponent: {
		type: 'Function(type:string, parameters:object):void',
		doc: 'Attaches a component to a D3DObject'
	},
	removeComponent: {
		type: 'Function():void',
		doc: 'Removes an already attached component from a D3DObject'
	}
};