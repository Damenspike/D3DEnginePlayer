export const protectedNames = [
	// core / globals
	'_root',
	'Input',
	'manifest',
	'scenes',
	'zip',
	'fileMeta',

	// identity / hierarchy
	'name',
	'parent',
	'children',
	'scenes',
	'threeObj',
	'__origin',
	'__self__',

	// transforms
	'position',
	'rotation',
	'scale',
	'quaternion',
	'forward',
	'right',
	'up',

	// object state
	'__deleted',
	'__loaded',
	'__runInSandbox',
	'__animatedTransformChange',
	'__componentInstances',

	// rendering / scene
	'_mesh',
	'_camera',
	'_directionallight',
	'_ambientlight',
	'_pointlight',

	// animation / physics
	'_animation',

	// interaction
	'isClicked',
	'isMouseOver',

	// lifecycle: start
	'__onInternalStart',
	'__onStart',
	'onStart',
	'__onEditorStart',
	'onEditorStart',

	// lifecycle: graphics ready
	'__onInternalGraphicsReady',
	'__onGraphicsReady',
	'onGraphicsReady',

	// lifecycle: physics
	'__onInternalPhysicsUpdate',
	'__onPhysicsUpdate',
	'onPhysicsUpdate',

	// lifecycle: enter frame
	'__onInternalEnterFrame',
	'__onEnterFrame',
	'onEnterFrame',
	'__onEditorEnterFrame',
	'onEditorEnterFrame',

	// lifecycle: before render
	'__onInternalBeforeRender',
	'__onBeforeRender',
	'onBeforeRender',
	'__onEditorBeforeRender',
	'onEditorBeforeRender',

	// lifecycle: exit frame
	'__onInternalExitFrame',
	'__onExitFrame',
	'onExitFrame',
	'__onEditorExitFrame',
	'onEditorExitFrame'
];