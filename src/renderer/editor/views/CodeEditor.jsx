import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

import { attachDraggable } from '../utilities/draggable';
import { installDamenScript } from '../../../engine/damenscript-editor.js';

import {
	getExtension,
	fileName
} from '../../../engine/d3dutility.js';

import { MdClose } from 'react-icons/md';

export default function CodeEditor({isOpen}) {
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
		
		_editor.openCodeEditor = (d3dobject) => {
			if(!objectsOpen.includes(d3dobject))
				setObjectsOpen([d3dobject, ...objectsOpen]);
			
			setObjectOpen(d3dobject);
			setValue(d3dobject.__script ?? '');
			_editor.showCodeEditor();
		}
		
	}, [objectsOpen]);
	
	useEffect(() => {
		setValue(objectOpen?.__script ?? '');
	}, [objectOpen]);
	
	useEffect(() => {
		
		if(!objectOpen)
			return;
			
		objectOpen.__script = value;
		
	}, [value]);
	
	useEffect(() => {
		D3D.updateEditorStatus({ codeEditorOpen: isOpen });
	}, [isOpen]);
	
	const drawOpenObjects = () => {
		const rows = [];
		
		objectsOpen.forEach(d3dobject => {
			const path = d3dobject.__scriptPath;
			const classNames = ['code-editor__file', 'no-select'];
			
			if(d3dobject == objectOpen)
				classNames.push('code-editor__file--selected');
				
			const closeMe = (e) => {
				const arr = [...objectsOpen];
				arr.splice(arr.indexOf(d3dobject), 1);
				setObjectsOpen(arr);
				
				if(objectOpen == d3dobject)
					setObjectOpen(arr.length > 0 ? arr[0] : null);
				
				e.preventDefault();
			}
			const selectMe = (e) => {
				setObjectOpen(d3dobject);
			}
			
			rows.push(
				<div 
					className={classNames.join(' ')}
					key={rows.length}
					onClick={selectMe}
				>
					{d3dobject.name}
					<div 
						className='code-editor__file__close'
						onClick={closeMe}
					>
						x
					</div>
				</div>
			)
		});
		
		return rows;
	}
	
	return (
		<div 
			className='code-editor' 
			style={{display: (!isOpen || objectsOpen.length < 1) ? 'none': 'block'}}
			tabIndex={3}
		>
			<div ref={panelRef} className='code-editor__window'>
				
				<div className='code-editor__container'>
					<div className='code-editor__files'>
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
								
								// set theme ONLY after mount
								monaco.editor.setTheme('damenscript-dark');
							}}
							theme="vs-dark"
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