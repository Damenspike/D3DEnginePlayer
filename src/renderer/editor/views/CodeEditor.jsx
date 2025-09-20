import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

import { attachDraggable } from '../utilities/draggable';
import { installDamenScript } from '../../../engine/damenscript-editor.js';

import {
	getExtension,
	fileName
} from '../../../engine/d3dutility.js';

import { MdClose } from 'react-icons/md';

export default function CodeEditor({isOpen, theme}) {
	const [objectsOpen, setObjectsOpen] = useState([]);
	const [objectOpen, setObjectOpen] = useState();
	const [value, setValue] = useState();
	
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
			if(objects.length < 1)
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
			setValue(d3dobject.__script ?? '');
			_editor.showCodeEditor();
		}
		
		_events.on('selected-objects', onSelectedObjects);
		
		return () => {
			_events.un('selected-objects', onSelectedObjects);
		}
	}, [objectsOpen]);
	
	useEffect(() => {
		setValue(objectOpen?.__script ?? '');
	}, [objectOpen]);
	
	useEffect(() => {
		
		if(!objectOpen)
			return;
			
		objectOpen.__script = value;
		objectOpen.checkSymbols();
		
	}, [value]);
	
	useEffect(() => {
		D3D.updateEditorStatus({ codeEditorOpen: isOpen });
	}, [isOpen]);
	
	const drawOpenObjects = () => {
		const rows = [];
		const objectsOpenList = [...objectsOpen];
		
		if(window._root && !objectsOpenList.includes(window._root))
			objectsOpenList.unshift(window._root);
		
		objectsOpenList.forEach(d3dobject => {
			const classNames = ['tab', 'no-select'];
			
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
			const selectMe = (e) => {
				setObjectOpen(d3dobject);
			}
			
			const drawClose = () => (
				<div 
					className='code-editor__file__close'
					onClick={closeMe}
				>
					x
				</div>
			)
			
			rows.push(
				<div 
					className={classNames.join(' ')}
					key={rows.length}
					onClick={selectMe}
				>
					{d3dobject.name}
					{d3dobject != _root && drawClose()}
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
					<div className='tabs'>
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
							value={value}
							onChange={v => setValue(v ?? '')}
							beforeMount={(monaco) => {
								installDamenScript(monaco);
							}}
							onMount={(editor, monaco) => { 
								editorRef.current = editor; 
								
								editorRef.current.onKeyDown((e) => {
									if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
										e.preventDefault();
										_editor.saveProject();
									}
								});
							}}
							theme={theme == 'dark' ? 'damenscript-dark' : 'damenscript-light'}
							options={{
								minimap: { enabled: false },
								tabSize: 6,
								insertSpaces: false,
								automaticLayout: true,
								scrollBeyondLastLine: false,
								semanticHighlighting: false,
								wordWrap: 'on',
								renderWhitespace: 'selection',
								fontLigatures: false,
								fontSize: 14
							}}
						/>
					</div>
				</div>
				
			</div>
		</div>
	)
}