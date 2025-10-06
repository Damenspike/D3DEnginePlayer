// GameView.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { loadD3DProj } from '../../../engine/d3deditor.js';

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