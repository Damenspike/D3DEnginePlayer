export const KEYWORDS = [
	'let','const','function','return','if','else','for','while','break','continue',
	'true','false','null','undefined','import','from','export','struct','enum','match',
	'case','default','try','catch','finally','throw', 'this', 'root', '_root', 'parent'
]
export const TYPE_KEYWORDS = [
	'number','string','bool','Vector2','Vector3','Vector4','MathUtils','Box3'
]
export const FORBIDDEN_KEYWORDS = [
	'window','document','globalThis',
	'require','process',
	'Function','eval',
	'import','new'
]
export const FORBIDDEN_PROPS = [
	'constructor','prototype','__proto__',
	   'caller','callee','arguments',
	   'call','apply','bind', '__script',
	   '__onInternalEnterFrame', '__onEditorEnterFrame',
	   '__componentInstances', '__deleted', '__animatedTransformChange'
]
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
	
	animation: {
		type: 'Manager',
		doc: 'Animation manager (if exists)'
	},
	camera: {
		type: 'Manager',
		doc: 'Camera manager (if exists)'
	},
	mesh: {
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
	onExitFrame: {
		type: 'Function():void',
		doc: 'Called after the frame is rendered.'
	}
};