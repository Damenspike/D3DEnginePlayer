import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

import { attachDraggable } from '../utilities/draggable';
import { installDamenScript } from '../../../engine/damenscript-editor.js';

import {
	getExtension,
	fileName
} from '../../../engine/d3dutility.js';

import { MdClose } from 'react-icons/md';
import { RxDrawingPin, RxDrawingPinFilled } from 'react-icons/rx';

export default function CodeEditor({isOpen, theme}) {
	const [objectsOpen, setObjectsOpen] = useState([]);
	const [pinnedObjects, setPinnedObjects] = useState([]);
	const [objectOpen, setObjectOpen] = useState();
	
	const editorRef = useRef(null);
	const panelRef = useRef(null);
	
	useEffect(() => {
		const detach = attachDraggable(panelRef.current, {
			ignoreSelector: '.code-editor__input',
			edgeThreshold: 14,
			padding: 8
		});
		
		return detach;
	}, []);
	
	useEffect(() => {
		
		const onSelectedObjects = objects => {
			if(!isOpen || objects.length < 1 || !isOpen || pinnedObjects.includes(objectOpen))
				return;
			
			const defObject = objects[0];
			
			if(!objectsOpen.includes(defObject))
				setObjectsOpen([...objectsOpen, defObject]);
			
			setObjectOpen(defObject);
		}
		
		_editor.openCodeEditor = (d3dobject) => {
			if(!objectsOpen.includes(d3dobject))
				setObjectsOpen([d3dobject, ...objectsOpen]);
			
			setObjectOpen(d3dobject);
			_editor.showCodeEditor();
		}
		
		_events.on('selected-objects', onSelectedObjects);
		
		return () => {
			_events.un('selected-objects', onSelectedObjects);
		}
	}, [objectsOpen, isOpen, objectOpen, pinnedObjects]);
	
	useEffect(() => {
		if(editorRef.current)
			editorRef.current.setValue(objectOpen?.__script ?? '');
	}, [objectOpen]);
	
	useEffect(() => {
		D3D.updateEditorStatus({ codeEditorOpen: isOpen });
	}, [isOpen]);
	
	const drawOpenObjects = () => {
		const rows = [];
		const objectsOpenList = [...objectsOpen];
		
		if(window._root && !objectsOpenList.includes(window._root))
			objectsOpenList.unshift(window._root);
		
		objectsOpenList.sort((a, b) => {
			const pA = pinnedObjects.includes(a) || a == window._root;
			const pB = pinnedObjects.includes(b) || b == window._root;
			if(pA && !pB)
				return -1;
			else
			if(!pA && pB)
				return 1;
			else
				return 0;
		});
		
		objectsOpenList.forEach(d3dobject => {
			if(!d3dobject || d3dobject.__deleted)
				return;
				
			const classNames = ['tab', 'no-select'];
			const isPinned = pinnedObjects.includes(d3dobject);
			
			if(d3dobject == objectOpen)
				classNames.push('tab--selected');
				
			const closeMe = (e) => {
				const arr = [...objectsOpen];
				arr.splice(arr.indexOf(d3dobject), 1);
				setObjectsOpen(arr);
				
				if(objectOpen == d3dobject)
					setObjectOpen(arr.length > 0 ? arr[0] : _root);
				
				e.preventDefault();
				e.stopPropagation();
			}
			const selectMe = () => {
				setObjectOpen(d3dobject);
			}
			const pinMe = (e) => {
				if(pinnedObjects.includes(d3dobject))
					pinnedObjects.splice(pinnedObjects.indexOf(d3dobject), 1);
				else
					pinnedObjects.push(d3dobject);
				
				setPinnedObjects([...pinnedObjects]);
				
				e.preventDefault();
				e.stopPropagation();
			}
			
			const drawClose = () => (
				<div 
					className='code-editor__file__btn vm'
					onClick={closeMe}
				>
					<MdClose />
				</div>
			)
			const drawPin = () => (
				<div 
					className={`code-editor__file__btn code-editor__file__pin vm ${isPinned ? 'code-editor__file__pin--pinned' : ''}`}
					onClick={pinMe}
				>
					{isPinned ? <RxDrawingPinFilled /> : <RxDrawingPin />}
				</div>
			)
			
			rows.push(
				<div 
					className={classNames.join(' ')}
					key={rows.length}
					onClick={selectMe}
				>
					{d3dobject != _root && drawClose()}
					{drawPin()}
					{d3dobject.name}
				</div>
			)
		});
		
		return rows;
	}
	
	return (
		<div 
			className='code-editor' 
			style={{display: (!isOpen) ? 'none' : 'block'}}
			tabIndex={3}
		>
			<div ref={panelRef} className='code-editor__window'>
				
				<div className='code-editor__container'>
					<div className='tabs no-scrollbar'>
						{drawOpenObjects()}
					</div>
					<button 
						className='code-editor__close' 
						onClick={() => _editor.hideCodeEditor()} 
					>
						<MdClose />
					</button>
					
					<div className='code-editor__input'>
						<Editor
							id="code-editor"
							height="100%"
							defaultLanguage="damenscript"
							language="damenscript"
							onChange={value => {
								if(!objectOpen)
									return;
								
								objectOpen.__script = value;
								objectOpen.checkSymbols();
								_editor.updateInspector();
							}}
							beforeMount={(monaco) => {
								installDamenScript(monaco);
							}}
							onMount={(editor, monaco) => {
								editorRef.current = editor;
								
								const KB = monaco.KeyMod;
								const K  = monaco.KeyCode;
							
								// Ctrl/Cmd + Enter  -> Build
								editor.addCommand(KB.CtrlCmd | K.Enter, () => {
									D3D.echoBuild({prompt: false, play: true});
								});
								// Support numpad Enter too
								editor.addCommand(KB.CtrlCmd | K.NumpadEnter, () => {
									D3D.echoBuild({prompt: false, play: true});
								});
								
								// Save project
								editor.addCommand(KB.CtrlCmd | K.KeyS, () => {
									D3D.echoSave();
								});
								
								// Ctrl/Cmd + B  -> Build
								editor.addCommand(KB.CtrlCmd | K.KeyB, () => {
									D3D.echoBuild({prompt: false, play: false});
								});
								// Ctrl/Cmd + Shift + B  -> Build To
								editor.addCommand(KB.CtrlCmd | KB.Shift | K.KeyB, () => {
									D3D.echoBuild({prompt: true, play: false});
								});
							}}
							theme={theme == 'dark' ? 'damenscript-dark' : 'damenscript-light'}
							options={{
								minimap: { enabled: false },
								tabSize: 4,
								insertSpaces: false,
								automaticLayout: true,
								scrollBeyondLastLine: false,
								semanticHighlighting: false,
								wordWrap: 'on',
								renderWhitespace: 'selection',
								fontLigatures: false,
								fontSize: 13,
								fontFamily: "monospace"
							}}
						/>
					</div>
				</div>
				
			</div>
		</div>
	)
}