<div style="
	max-width: 600px;
	height: 55%;
	overflow-y: scroll;
	margin: 20px auto;
	text-align: left;
	line-height: 1.5;
">
	<ul style="margin: 0; padding-left: 1.2em;">
		<li>New: Multiple projects can now be open at once</li>
		<li>New: ZIP instancing by d3d file origin (player only)</li>
		<li>New: Code find and replace dialog</li>
		<li>New: Mesh getBones / setBones / updateSkeleton</li>
		<li>New: Overlap sphere provide point</li>
		<li>New: _physics.rigidline / _physics.rigidsphere</li>
		<li>New: Ability to drag drop assets into scene list to spawn at 0,0,0</li>
		<li>New: Ability to turn off edit focus effects</li>
		<li>New: Ability to swap Model on Mesh component</li>
		<li>New: RegEx(pattern:string) adapter for DamenScript regex</li>
		<li>New: Mesh manager <code>onMeshReady</code> / <code>onChildMeshReady</code> event</li>
		<li>New: <code>_rootParent</code> property (highest ancestor above absolute root)</li>
		<li>New: 3D object index for inspector ordering</li>
		<li>New: Fixed physics body batching for performance</li>
		<li>New: <code>_dimensions.setSize(width, height)</code></li>
		<li>New: <code>dontAnimate</code> properly on d3dobject</li>
		<li>New: Cache runtime loaded d3d files</li>
		<li>New: <code>_physics.rigidcast</code> (Rapier physics raycast for rigidbodies only)</li>
		
		<li>Improved: Separate code editor per object/tab in code editor</li>
		<li>Improved: Inspector search UX</li>
		<li>Improved: Render loop update event remodelling</li>
		<li>Improved: DamenScript runtime performance</li>
		<li>Improved: Raycast efficiency</li>
		<li>Improved: Correctly delete d3dobjects</li>
		<li>Improved: Mask does not apply when g2d is in focus mode</li>
		<li>Improved: Nested editor focus always visible (2D)</li>
		<li>Improved: AutoLOD, decimate instead of SimplifyModifier</li>
		<li>Improved: Removed un-needed material parameters</li>
		<li>Improved: Symbol component syncing</li>
		
		<li>Fixed: Async await stacking not working right</li>
		<li>Fixed: Unable to use transform gizmo to do negative axis scaling</li>
	</ul>
</div>
<div style="text-align: left;">
	<p style="font-size: 14px;opacity:0.8;">
		As the editor is in early beta, updates are very important because they change a lot of engine internals. Not updating will mean your project may not work with the new player.</p>
	</p>
</div>