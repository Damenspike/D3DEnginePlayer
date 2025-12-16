import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

import { attachDraggable } from '../utilities/draggable';
import { installDamenScript } from '../../../engine/damenscript-editor.js';

import { MdClose } from 'react-icons/md';
import { RxDrawingPin, RxDrawingPinFilled } from 'react-icons/rx';

export default function CodeEditor({isOpen, theme}) {
	const [objectsOpen, setObjectsOpen] = useState([]);
	const [pinnedObjects, setPinnedObjects] = useState([]);
	const [objectOpen, setObjectOpen] = useState();
	
	const panelRef = useRef(null);
	
	// monaco state
	const monacoRef = useRef(null);
	const dsInstalledRef = useRef(false);
	const editorByKeyRef = useRef(new Map());
	const modelByKeyRef = useRef(new Map());
	
	const getObjKey = (obj) => {
		if(!obj)
			return 'null';
		
		if(obj == window._root)
			return 'root';
		
		return String(obj.uuid || obj.id || obj.__uuid || obj.name || 'object');
	}
	
	const normalizeOpenList = (arr) => {
		const out = arr ? [...arr] : [];
		
		for(let i = out.length - 1; i >= 0; i--) {
			const o = out[i];
			if(!o || o.__deleted)
				out.splice(i, 1);
		}
		
		for(let i = 0; i < out.length; i++) {
			for(let j = out.length - 1; j > i; j--) {
				if(out[j] === out[i])
					out.splice(j, 1);
			}
		}
		
		if(window._root) {
			const idx = out.indexOf(window._root);
			if(idx === -1)
				out.unshift(window._root);
			else
			if(idx !== 0) {
				out.splice(idx, 1);
				out.unshift(window._root);
			}
		}
		
		return out;
	}
	
	const getModelFor = (monaco, d3dobject) => {
		const k = getObjKey(d3dobject);
	
		let model = modelByKeyRef.current.get(k);
	
		if(model && model.isDisposed?.())
			model = null;
	
		if(model)
			return model;
	
		model = monaco.editor.createModel(d3dobject.__script ?? '', 'damenscript');
		modelByKeyRef.current.set(k, model);
	
		return model;
	};
	
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
			if(!isOpen || objects.length < 1 || pinnedObjects.includes(objectOpen))
				return;
			
			const defObject = objects[0];
			
			if(!objectsOpen.includes(defObject))
				setObjectsOpen(normalizeOpenList([...objectsOpen, defObject]));
			
			setObjectOpen(defObject);
		}
		
		_editor.openCodeEditor = (d3dobject) => {
			if(!objectsOpen.includes(d3dobject))
				setObjectsOpen(normalizeOpenList([d3dobject, ...objectsOpen]));
			else
				setObjectsOpen(normalizeOpenList(objectsOpen));
			
			setObjectOpen(d3dobject);
			_editor.showCodeEditor();
		}
		
		_events.on('selected-objects', onSelectedObjects);
		
		return () => {
			_events.un('selected-objects', onSelectedObjects);
		}
	}, [objectsOpen, isOpen, objectOpen, pinnedObjects]);
	
	useEffect(() => {
		D3D.updateEditorStatus({ codeEditorOpen: isOpen });
	}, [isOpen]);
	
	// if scripts arrive after editor mount (root commonly), update the model
	useEffect(() => {
		const monaco = monacoRef.current;
		if(!monaco)
			return;
		
		const list = normalizeOpenList(objectsOpen);
		
		list.forEach(o => {
			const k = getObjKey(o);
			const model = modelByKeyRef.current.get(k);
			if(!model)
				return;
			
			const want = o.__script ?? '';
			const have = model.getValue();
			
			if(have !== want)
				model.setValue(want);
		});
	}, [objectsOpen]);
	
	const addCommands = (editor, monaco) => {
		const KB = monaco.KeyMod;
		const K  = monaco.KeyCode;
		
		editor.addCommand(KB.CtrlCmd | K.Enter, () => {
			D3D.echoBuild({prompt: false, play: true});
		});
		editor.addCommand(KB.CtrlCmd | K.NumpadEnter, () => {
			D3D.echoBuild({prompt: false, play: true});
		});
		
		editor.addCommand(KB.CtrlCmd | K.KeyS, () => {
			D3D.echoSave();
		});
		
		editor.addCommand(KB.CtrlCmd | K.KeyB, () => {
			D3D.echoBuild({prompt: false, play: false});
		});
		editor.addCommand(KB.CtrlCmd | KB.Shift | K.KeyB, () => {
			D3D.echoBuild({prompt: true, play: false});
		});
	}
	
	const closeMe = (e, d3dobject) => {
		const arr = normalizeOpenList(objectsOpen).filter(o => o !== d3dobject);
		setObjectsOpen(arr);
		
		if(objectOpen == d3dobject)
			setObjectOpen(arr.length > 0 ? arr[0] : _root);
		
		const k = getObjKey(d3dobject);
		const model = modelByKeyRef.current.get(k);
		if(model) {
			model.dispose();
			modelByKeyRef.current.delete(k);
		}
		
		e.preventDefault();
		e.stopPropagation();
	}
	
	const pinMe = (e, d3dobject) => {
		if(pinnedObjects.includes(d3dobject))
			pinnedObjects.splice(pinnedObjects.indexOf(d3dobject), 1);
		else
			pinnedObjects.push(d3dobject);
		
		setPinnedObjects([...pinnedObjects]);
		
		e.preventDefault();
		e.stopPropagation();
	}
	
	const drawOpenObjects = () => {
		const rows = [];
		const list = normalizeOpenList(objectsOpen);
		
		list.sort((a, b) => {
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
		
		list.forEach(d3dobject => {
			if(!d3dobject || d3dobject.__deleted)
				return;
			
			const classNames = ['tab', 'no-select'];
			const isPinned = pinnedObjects.includes(d3dobject);
			
			if(d3dobject == objectOpen)
				classNames.push('tab--selected');
			
			const drawClose = () => (
				<div 
					className='code-editor__file__btn vm'
					onClick={e => closeMe(e, d3dobject)}
				>
					<MdClose />
				</div>
			)
			
			const drawPin = () => (
				<div 
					className={`code-editor__file__btn code-editor__file__pin vm ${isPinned ? 'code-editor__file__pin--pinned' : ''}`}
					onClick={e => pinMe(e, d3dobject)}
				>
					{isPinned ? <RxDrawingPinFilled /> : <RxDrawingPin />}
				</div>
			)
			
			rows.push(
				<div 
					className={classNames.join(' ')}
					key={getObjKey(d3dobject)}
					onClick={() => setObjectOpen(d3dobject)}
				>
					{d3dobject != _root && drawClose()}
					{drawPin()}
					{d3dobject.name}
				</div>
			)
		});
		
		return rows;
	}
	
	const drawEditors = () => {
		const list = [];
		const listObjs = normalizeOpenList(objectsOpen);
		
		listObjs.sort((a, b) => {
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
		
		listObjs.forEach(d3dobject => {
			if(!d3dobject || d3dobject.__deleted)
				return;
			
			const k = getObjKey(d3dobject);
			const isActive = d3dobject === objectOpen;
			
			list.push(
				<div 
					key={k}
					className='code-editor__input'
					style={{display: isActive ? 'block' : 'none'}}
				>
					<Editor
						key={k}
						height='100%'
						defaultLanguage='damenscript'
						language='damenscript'
						onChange={value => {
							d3dobject.__script = value ?? '';
							d3dobject.checkSymbols();
							_editor.updateInspector();
						}}
						beforeMount={(monaco) => {
							monacoRef.current = monaco;
							
							if(!dsInstalledRef.current) {
								dsInstalledRef.current = true;
								installDamenScript(monaco);
							}
						}}
						onMount={(editor, monaco) => {
							editorByKeyRef.current.set(k, editor);
							
							const model = getModelFor(monaco, d3dobject);
							editor.setModel(model);
							
							addCommands(editor, monaco);
						}}
						theme={theme == 'dark' ? 'damenscript-dark' : 'damenscript-light'}
						keepCurrentModel={true}
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
			)
		});
		
		return list;
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
					
					{drawEditors()}
				</div>
			</div>
		</div>
	)
}