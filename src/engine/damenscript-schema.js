export const KEYWORDS = [
	'var', 'let','const','function','return','if','else','for','while','break','continue', 'async', 'await',
	'true','false','null','undefined','import','from','export','struct','enum','match',
	'case','default','try','catch','finally','throw', 'this', 'root', '_root', 'parent', '_time', '_physics', '_input', '_dimensions', '_graphics', '_global'
]
export const TYPE_KEYWORDS = [
	'number','string','bool','Vector2','Vector3','Vector4','MathUtils','Box3','Quaternion','crypto','Math','JSON','Promise','WebSocket','LocalStorage','WebRTC','console','Raycaster','Color','Euler','Box4','Sphere','Plane', 'Infinity','fileMeta',
	
	'onStart', 'onGraphicsReady', 'onLoad',
	'onEnterFrame','onBeforeRender','onExitFrame', 'onPhysicsUpdate',
	'onMouseOver', 'onMouseOut', 'onMouseMove',
	'onMouseDown', 'onMouseUp', 'onMouseWheel', 'onRelease',
	'addEventListener','removeEventListener', 
	'forSeconds', 'forFrames'
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
export const NO_OBFUSCATE = [
	"_root",
	"_input",
	"_time",
	"_physics",
	"_dimensions",
	"_graphics",
	"_global",
	"fetch",
	"setTimeout",
	"setInterval",
	"clearTimeout",
	"clearInterval",
	"performance",
	"queueMicrotask",
	"crypto",
	"Math",
	"JSON",
	"Infinity",
	"Promise",
	"WebSocket",
	"WebRTC",
	"LocalStorage",
	"_editor",
	"root",
	"parent",
	"self",
	"console",
	"MathUtils",
	"Vector3",
	"Vector2",
	"Quaternion",
	"Box3",
	"Matrix4",
	"Euler",
	"Color",
	"Raycaster",
	"Sphere",
	"Plane",
	"forSeconds",
	"forFrames"
]
export const D3D_OBJECT_SCHEMA = {
	// ---------- identity & basic state ----------
	uuid: {
		type: 'string',
		doc: 'Globally-unique ID for this object (unique across the whole .d3d).'
	},
	suuid: {
		type: 'string',
		doc: 'Symbol-local unique ID used for symbol instances and syncing.'
	},
	name: {
		type: 'string',
		doc: 'Instance name of the object (unique among siblings).'
	},
	enabled: {
		type: 'boolean',
		doc: 'Controls whether this object participates in updates / components / rendering.'
	},
	visible: {
		type: 'boolean',
		doc: 'Logical visibility flag for this object. If false, it and its children will not render.'
	},
	opacity: {
		type: 'number',
		doc: 'Local opacity (0–1). Combined multiplicatively with all ancestors.'
	},
	rendered: {
		type: 'boolean',
		doc: 'True if this object is visible and all its ancestors are visible.'
	},

	// ---------- hierarchy ----------
	root: {
		type: 'D3DObject',
		doc: 'Root of this object’s file subtree (the object that owns the manifest).'
	},
	parent: {
		type: 'D3DObject|null',
		doc: 'Immediate parent object, or null if this is the top .d3d root.'
	},
	children: {
		type: 'D3DObject[]',
		doc: 'Immediate children of this object.'
	},
	rootParent: {
		type: 'D3DObject',
		doc: 'Highest ancestor of this object under `root` (top of this branch).'
	},
	nameTree: {
		type: 'string',
		doc: 'Dot-separated path from branch root to this object (e.g. "Car.Body.Door").'
	},
	tree: {
		type: 'string[]',
		doc: 'Array of object names from branch root to this object.'
	},
	setParent: {
		type: 'Function(parent:D3DObject|null, opts?:{ keepWorldTranform?: boolean }):void',
		doc: 'Reparents this object under the given parent (or detach if null). Optionally keeps world transform.'
	},
	createObject: {
		type: 'Function(objData:Object, opts?:{ executeScripts?:boolean }):Promise<D3DObject>',
		doc: 'Creates a child object from serialized data (usually used by the engine, not user scripts).'
	},
	delete: {
		type: 'Function(force?:boolean):void',
		doc: 'Deletes this object from its parent. Throws if root; may be blocked for managed sub-meshes unless force=true.'
	},
	forceDelete: {
		type: 'Function():void',
		doc: 'Force-delete this object, bypassing certain managed-object protections.'
	},
	replaceObject3D: {
		type: 'Function(newObject3D:THREE.Object3D, opts?:{ keepChildren?:boolean }):void',
		doc: 'Replaces the underlying THREE.Object3D while preserving transform, scene position, and optionally children.'
	},

	// ---------- transforms: local ----------
	position: {
		type: 'Vector3',
		doc: 'Local position of this object relative to its parent.'
	},
	rotation: {
		type: 'Euler (Vector3-like)',
		doc: 'Local rotation in radians (x,y,z) with order XYZ.'
	},
	quaternion: {
		type: 'Quaternion',
		doc: 'Local orientation quaternion relative to parent.'
	},
	scale: {
		type: 'Vector3',
		doc: 'Local scale relative to parent.'
	},
	localEulerAngles: {
		type: '{ x:number, y:number, z:number } (degrees)',
		doc: 'Aircraft-style local rotation in degrees (pitch/yaw/roll, order YXZ).'
	},
	localAttitude: {
		type: '{ pitch:number, yaw:number, bank:number } (degrees)',
		doc: 'Stable aircraft-style attitude in local space (pitch/yaw/bank).'
	},

	// ---------- transforms: world ----------
	worldPosition: {
		type: 'Vector3',
		doc: 'World-space position (get/set). Setting converts to local space respecting parent.'
	},
	worldRotation: {
		type: 'Vector3',
		doc: 'World-space rotation in radians (get/set) converted to local space as needed.'
	},
	worldQuaternion: {
		type: 'Quaternion',
		doc: 'World-space orientation quaternion (get/set).'
	},
	worldScale: {
		type: 'Vector3',
		doc: 'World-space scale (get/set via decomposition relative to parent).'
	},
	worldAttitude: {
		type: '{ pitch:number, yaw:number, bank:number } (degrees)',
		doc: 'Aircraft-style attitude in world space (pitch/yaw/bank).'
	},

	// ---------- derived orientation ----------
	forward: {
		type: 'Vector3',
		doc: 'World-space forward vector (based on worldQuaternion).'
	},
	right: {
		type: 'Vector3',
		doc: 'World-space right vector.'
	},
	up: {
		type: 'Vector3',
		doc: 'World-space up vector.'
	},

	// ---------- depth / layering (2D) ----------
	depth: {
		type: 'number',
		doc: 'Local Z position shortcut for 2D layering (maps to position.z).'
	},
	worldDepth: {
		type: 'number',
		doc: 'World-space Z position shortcut (maps to worldPosition.z).'
	},
	getNextHighestDepth: {
		type: 'Function():number',
		doc: 'Returns a depth value above all non-temp children.'
	},
	getNextLowestDepth: {
		type: 'Function():number',
		doc: 'Returns a depth value below all non-temp children.'
	},

	// ---------- 2D / graphic helpers ----------
	is2D: {
		type: 'boolean',
		doc: 'True if object has Graphic2D or Container2D components.'
	},
	is3D: {
		type: 'boolean',
		doc: 'True if object is not considered 2D.'
	},
	graphic2d: {
		type: 'Graphic2DProperties|undefined',
		doc: 'Convenience access to the Graphic2D component properties, if present.'
	},
	invalidateGraphic2D: {
		type: 'Function():void',
		doc: 'Marks 2D renderer as dirty so it re-renders the 2D graphics on next frame.'
	},
	hitTest: {
		type: 'Function(point:{x:number,y:number}):boolean',
		doc: 'Hit-test for Container2D/Graphic2D (bounds-based). Throws if no 2D component.'
	},
	hitTestPoint: {
		type: 'Function(point:{x:number,y:number}):boolean',
		doc: 'Precise hit-test for Container2D/Graphic2D (per-shape). Throws if no 2D component.'
	},

	// ---------- animation transform helpers ----------
	setAnimatedTransform: {
		type: 'Function(params:{ position?:Vector3, quaternion?:Quaternion, scale?:Vector3, weight?:number, smoothing?:number }):void',
		doc: 'Blend external animation (position/rotation/scale) into this object with weight and optional smoothing.'
	},
	resetAnimationTransform: {
		type: 'Function():void',
		doc: 'Restores the original transform from before setAnimatedTransform was applied.'
	},

	// ---------- transform utilities ----------
	lookAt: {
		type: 'Function(target:Vector3|THREE.Object3D|D3DObject):void',
		doc: 'Rotate this object so it faces the target position/object in world space.'
	},
	localToWorld: {
		type: 'Function(vec:Vector3):Vector3',
		doc: 'Converts a local-space point to world-space.'
	},
	worldToLocal: {
		type: 'Function(vec:Vector3):Vector3',
		doc: 'Converts a world-space point to this object’s local space.'
	},
	worldToLocalDirection: {
		type: 'Function(dir:Vector3):Vector3',
		doc: 'Converts a world-space direction vector into local space (rotation only).'
	},
	localToWorldDirection: {
		type: 'Function(dir:Vector3):Vector3',
		doc: 'Converts a local-space direction vector into world space (rotation only).'
	},
	localDirToWorld: {
		type: 'Function(dirLocal:Vector3):Vector3',
		doc: 'Alias for converting local direction to world direction using world rotation.'
	},
	worldDirToLocal: {
		type: 'Function(dirWorld:Vector3):Vector3',
		doc: 'Converts world direction to local direction using inverse world rotation.'
	},
	localToWorldQuaternion: {
		type: 'Function(qLocal:Quaternion):Quaternion',
		doc: 'Converts a local rotation quaternion to world space.'
	},
	worldQuaternionToLocal: {
		type: 'Function(qWorld:Quaternion):Quaternion',
		doc: 'Converts a world-space quaternion into this object’s local space.'
	},
	worldEulerToLocal: {
		type: 'Function(e:{x:number,y:number,z:number}):{x:number,y:number,z:number}',
		doc: 'Converts world Euler rotation (radians) to local Euler rotation.'
	},
	localEulerToWorld: {
		type: 'Function(e:{x:number,y:number,z:number}):{x:number,y:number,z:number}',
		doc: 'Converts local Euler rotation (radians) to world Euler rotation.'
	},
	setPosition: {
		type: 'Function(pos:Vector3):void',
		doc: 'Set local position (Vector3) with editor transform change events.'
	},
	setRotation: {
		type: 'Function(rot:Vector3):void',
		doc: 'Set local rotation (Vector3 radians) with editor transform change events.'
	},
	setScale: {
		type: 'Function(scale:Vector3):void',
		doc: 'Set local scale (Vector3) with editor transform change events.'
	},

	// ---------- visibility / rendering ----------
	updateVisibility: {
		type: 'Function(force?:boolean):void',
		doc: 'Recalculates opacity inheritance and updates underlying THREE visibility/opacity.'
	},
	getIsRendered: {
		type: 'Function():boolean',
		doc: 'Returns true if this object and all ancestors are visible.'
	},

	// ---------- symbol system ----------
	symbolId: {
		type: 'string|undefined',
		doc: 'ID of the symbol this object represents, if any.'
	},
	symbol: {
		type: 'Symbol|undefined',
		doc: 'Symbol metadata referenced by symbolId, if available.'
	},

	// ---------- components ----------
	components: {
		type: 'Array<{ type:string, properties:object, enabled:boolean }>',
		doc: 'Raw component descriptors attached to this object.'
	},
	getComponent: {
		type: 'Function(type:string):ComponentManager|undefined',
		doc: 'Returns the manager instance for the given component type, if present.'
	},
	hasComponent: {
		type: 'Function(type:string):boolean',
		doc: 'Returns true if a component of the given type exists on this object.'
	},
	hasVisibleComponent: {
		type: 'Function(type:string):boolean',
		doc: 'Returns true if component exists and is not editor-only.'
	},
	addComponent: {
		type: 'Function(type:string, properties?:object, opts?:{ doUpdateAll?:boolean, removeIfPresent?:boolean, unshift?:boolean }):Promise<void>',
		doc: 'Adds a component by type, merging defaults from its schema, and creates its manager instance.'
	},
	removeComponent: {
		type: 'Function(type:string, opts?:{ dontRecurseSymbols?:boolean }):Promise<void>',
		doc: 'Removes a component and disposes its manager instance.'
	},
	setComponentValue: {
		type: 'Function(type:string, field:string, value:any):void',
		doc: 'Convenience for mutating a component property and refreshing state / symbols.'
	},
	toggleComponent: {
		type: 'Function(type:string, enabled?:boolean):void',
		doc: 'Enables or disables a component by type.'
	},
	enableComponent: {
		type: 'Function(type:string):void',
		doc: 'Shortcut: toggleComponent(type, true).'
	},
	disableComponent: {
		type: 'Function(type:string):void',
		doc: 'Shortcut: toggleComponent(type, false).'
	},
	updateComponents: {
		type: 'Function():Promise<void>',
		doc: 'Rebuilds or updates all component manager instances. Called automatically when needed.'
	},

	// ---------- traversal / search ----------
	find: {
		type: 'Function(path:string):D3DObject|undefined',
		doc: 'Finds a descendant by dot-separated path relative to this object (e.g. "Car.Body.Door").'
	},
	findDeep: {
		type: 'Function(name:string):D3DObject[]',
		doc: 'Returns all descendants (including self) matching a given name.'
	},
	traverse: {
		type: 'Function(callback:(obj:D3DObject)=>boolean|void):boolean',
		doc: 'Depth-first traversal; return false from callback to stop traversal.'
	},
	containsChild: {
		type: 'Function(child:D3DObject):boolean',
		doc: 'Returns true if the given object is somewhere in this object’s hierarchy (excluding self).'
	},

	// ---------- asset helpers ----------
	findAssetById: {
		type: 'Function(uuid:string):{ rel:string, uuid:string }|undefined',
		doc: 'Finds an asset in root.assetIndex by UUID.'
	},
	findAssetByPath: {
		type: 'Function(relPath:string):{ rel:string, uuid:string }|undefined',
		doc: 'Finds an asset in root.assetIndex by relative path.'
	},
	resolvePath: {
		type: 'Function(uuid:string):string',
		doc: 'Returns asset path (rel) for a UUID, or "" if not found.'
	},
	resolvePathNoAssets: {
		type: 'Function(uuid:string):string',
		doc: 'Returns asset path stripped of leading "assets/" if present.'
	},
	resolveAssetId: {
		type: 'Function(path:string):string',
		doc: 'Returns the UUID for a given asset path (adding "assets/" prefix if missing).'
	},

	// ---------- scenes / loading (mostly engine-side) ----------
	load: {
		type: 'Function(uri:string):Promise<Uint8Array|undefined>',
		doc: 'Loads a .d3d file from remote or local path into this root object.'
	},
	readFile: {
		type: 'Function(path:string):Promise<string|null|undefined>',
		doc: 'Reads a text file from this root .d3d zip by relative path.'
	},

	// ---------- events ----------
	addEventListener: {
		type: 'Function(name:string, listener:Function):void',
		doc: 'Registers an event listener for custom events fired via invokeEvent.'
	},
	removeEventListener: {
		type: 'Function(name:string, listener:Function):void',
		doc: 'Removes a previously registered event listener.'
	},
	invokeEvent: {
		type: 'Function(name:string, ...args:any[]):void',
		doc: 'Dispatches a named event to all registered listeners for this object.'
	},

	// ---------- serialization ----------
	serialize: {
		type: 'Function():string',
		doc: 'Serializes this object (and children) to a JSON string.'
	},
	getSerializableObject: {
		type: 'Function():object',
		doc: 'Returns a plain serializable object representing this object and children.'
	},
	getSerializedComponents: {
		type: 'Function():Array<{ type:string, properties:object, enabled:boolean }>',
		doc: 'Returns a serializable list of components (excluding editor-only ones).'
	},
	getSerializedComponent: {
		type: 'Function(component):{ type:string, properties:object, enabled:boolean }',
		doc: 'Returns a serializable copy of a single component.'
	},

	// ---------- naming helpers ----------
	isValidName: {
		type: 'Function(name:string):boolean',
		doc: 'True if the name matches allowed characters A–Z, a–z, 0–9, space, underscore, dash.'
	},
	isNameAllowed: {
		type: 'Function(name:string):boolean',
		doc: 'True if the name is valid and does not conflict with protected properties on this object.'
	}
};