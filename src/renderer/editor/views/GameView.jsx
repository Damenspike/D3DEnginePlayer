// GameView.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { loadD3DProj } from '../../../engine/d3deditor.js';
import { eventToWorld } from '../../../engine/d2dutility.js';

const MIME = 'application/x-d3d-objectrow';

export default function GameView({editorMode}) {
	const game3dRef = useRef(null);
	const game2dRef = useRef(null);
	
	const [objectFrame, setObjectFrame] = useState();

	_editor.game3dRef = game3dRef;
	_editor.game2dRef = game2dRef;
	
	const unpack = useCallback((e) => {
		try {
			return JSON.parse(e.dataTransfer.getData(MIME) || '{}');
		} catch {
			return null;
		}
	}, []);

	const onDragOver = useCallback((e) => {
		// Only allow our custom payload to be dropped
		const types = e.dataTransfer?.types;
		if (!types || !Array.from(types).includes(MIME))
			return;

		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	}, []);

	const onDrop = useCallback((e) => {
		e.preventDefault();
		const payload = unpack(e);
		if (!payload)
			return;
			
		if (!payload.path)
			return;

		// Screen → local coords
		const host = game3dRef.current;
		if (!host)
			return;

		const r = host.getBoundingClientRect();
		const sx = e.clientX - r.left;
		const sy = e.clientY - r.top;
		
		window._editor.onAssetDroppedIntoGameView(payload.path, { x: sx, y: sy });
	}, [unpack]);

	useEffect(() => {
		const element3d = game3dRef.current;
		const element2d = game2dRef.current;
		
		if (!element3d || !element2d)
			return;

		window._container3d = element3d;
		window._container2d = element2d;

		const observer = new ResizeObserver(() => {
			const w = element3d.clientWidth;
			const h = element3d.clientHeight;

			if (w <= 0 || h <= 0 || !window._editor)
				return;

			const r = window._editor.renderer3d;
			const cam = window._editor.camera;
			const comp = window._editor.composer;

			if (r)
				r.setSize(w, h, false);

			if (comp?.setSize)
				comp.setSize(w, h);

			if (cam) {
				cam.aspect = w / h;
				cam.updateProjectionMatrix();
			}
		});
		observer.observe(element3d);

		D3D.getCurrentProjectURI().then(uri => {
			loadD3DProj(uri);
		});
		
		_events.on('select-all', () => {
			// select all in game view
		});
		_events.on('editor-focus', (focus) => {
			setObjectFrame(focus);
		});

		return () => observer.disconnect();
	}, []);
	
	// Right click menu on canvas 2d
	useEffect(() => {
		if(!game2dRef?.current)
			return;
		
		const canvas2d = game2dRef.current;
		let objectHit;
		let p;
		
		const onRightClick = (e) => {
			
			const defaultCtx = [
				{
					id: 'paste-point',
					label: 'Paste',
					enabled: _editor.clipboard?.length > 0
				},
				{
					id: 'paste',
					label: 'Paste in Place',
					enabled: _editor.clipboard?.length > 0
				},
				{ type: 'separator' },
				{
					id: 'snap-points',
					type: 'checkbox',
					checked: !!_editor.draw2d.snapToPoints,
					label: 'Snap to Points'
				},
				{
					id: 'snap-objects',
					type: 'checkbox',
					checked: !!_editor.draw2d.snapToObjects,
					label: 'Snap to Objects'
				}
			];
			const objectCtx = [
				{
					id: 'cut-object',
					label: 'Cut'
				},
				{
					id: 'copy-object',
					label: 'Copy'
				},
				{
					id: 'paste-point',
					label: 'Paste',
					enabled: _editor.clipboard?.length > 0
				},
				{
					id: 'paste',
					label: 'Paste in Place',
					enabled: _editor.clipboard?.length > 0
				},
				{ type: 'separator' },
				{
					id: 'front-object',
					label: 'Bring to Front'
				},
				{
					id: 'forwards-object',
					label: 'Bring Forward'
				},
				{
					id: 'back-object',
					label: 'Send to Back'
				},
				{
					id: 'backwards-object',
					label: 'Send Backwards'
				},
				{ type: 'separator' },
				{
					id: 'symbolise-object',
					label: 'Symbolise'
				},
				{
					id: 'group',
					label: 'Group'
				},
				{
					id: 'ungroup',
					label: 'Ungroup'
				},
				{ type: 'separator' },
				{
					id: 'code',
					label: 'Code'
				}
			];
			
			let template = defaultCtx;
			p = eventToWorld(e, _editor.renderer2d.domElement, _editor.renderer2d);
			
			const x = e.clientX + 2;
			const y = e.clientY + 2;
			
			objectHit = _editor.renderer2d.gizmo._pickTop(p.x, p.y);
			
			if(objectHit) {
				template = objectCtx;
				
				if(!_editor.isSelected(objectHit))
					_editor.setSelection([objectHit]);
			}
			
			D3D.openContextMenu({template, x, y});
		}
		const onCtxMenuAction = async (id) => {
			if(id == 'snap-points') {
				_editor.draw2d.snapToPoints = !_editor.draw2d.snapToPoints;
			}else
			if(id == 'snap-objects') {
				_editor.draw2d.snapToObjects = !_editor.draw2d.snapToObjects;
			}else
			if(id == 'cut-object') {
				_editor.cut();
			}else
			if(id == 'copy-object') {
				_editor.copy();
			}else
			if(id == 'paste') {
				_editor.paste();
			}else
			if(id == 'paste-point' && !isNaN(p?.x) && !isNaN(p?.y)) {
				const pastedObjects = await _editor.paste();
				pastedObjects.forEach(d3dobject => {
					d3dobject.position.x = p.x;
					d3dobject.position.y = p.y;
				});
			}else
			if(id == 'front-object') {
				_editor.bringObjectsToFront();
			}else
			if(id == 'forwards-object') {
				_editor.bringObjectsForwards();
			}else
			if(id == 'back-object') {
				_editor.sendObjectsToBack();
			}else
			if(id == 'backwards-object') {
				_editor.sendObjectsBackwards();
			}else
			if(id == 'code') {
				_editor.editCode();
			}else
			if(id == 'symbolise-object') {
				_editor.symboliseSelectedObject();
			}else
			if(id == 'group') {
				_editor.group();
			}else
			if(id == 'ungroup') {
				_editor.ungroup();
			}
		}
		
		_events.on('ctx-menu-action', onCtxMenuAction);
		canvas2d.addEventListener('contextmenu', onRightClick);
		
		return () => {
			_events.un('ctx-menu-action', onCtxMenuAction);
			canvas2d.removeEventListener('contextmenu', onRightClick);
		};
	}, [game2dRef]);
	
	const drawFocusPath = () => {
		if(!objectFrame)
			return;
		
		const path = [];
		
		if(!objectFrame || !objectFrame.parent)
			return;
		
		let stack = [objectFrame];
		let current = objectFrame;
		
		while(current.parent != null) {
			stack.push(current.parent);
			current = current.parent;
		}
		
		stack = stack.reverse();
		stack.forEach(object => {
			const classes = ['object-path-item'];
			
			const drawArrow = () => {
				if(stack.indexOf(object) == stack.length - 1)
					return;
				
				return (
					<>
						&nbsp;
						&gt;
						&nbsp;
					</>
				)
			}
			
			if(object == _editor.focus) {
				classes.push('object-path-item--active')
			}
			
			path.push(
				<React.Fragment key={path.length}>
					<div 
						className={classes.join(' ')}
						onClick={() => {
							const oldParent = _editor.focus;
							
							_editor.focus = object;
							
							if(object == (oldParent.parent ?? _root))
								_editor.setSelection([oldParent]);
							else
								_editor.setSelection([]);
						}}
					>
						{object.name}
					</div>
					{drawArrow()}
				</React.Fragment>
			)
		});
		
		if(path.length > 0) {
			return (
				<div className='game-focus-path'>
					{path}
				</div>
			)
		}
	}

	return (
		<div
			className='game-master-container'
			onDragOver={onDragOver}
			onDrop={onDrop}
		>
			<div
				id='game3d-container'
				className='game'
				ref={game3dRef}
				tabIndex={0}
				style={{ 
					display: editorMode == '3D' ? 'block' : 'none',
				}}
			/>
			<div
				id='game2d-container'
				className='game'
				ref={game2dRef}
				tabIndex={0}
				style={{ 
					display: editorMode == '2D' ? 'block' : 'none',
				}}
			/>
			{drawFocusPath()}
		</div>
	);
}