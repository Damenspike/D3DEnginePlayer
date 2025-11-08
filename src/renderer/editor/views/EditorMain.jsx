import React, { useState, useEffect, useRef } from 'react';
import Inspector from './Inspector.jsx';
import GameView from './GameView.jsx';
import ConsoleView from './ConsoleView.jsx';
import DrawBar from './DrawBar.jsx';
import CodeEditor from './CodeEditor.jsx';
import useResizable from '../hooks/useResizable.js';

export default function EditorMain({theme}) {
	const [codeEditorOpen, setCodeEditorOpen] = useState(false);
	const [editorMode, setEditorMode] = useState(_editor.mode);
	
	const inspRef = useRef(null);
	const consoleRef = useRef(null);
	const drawBarRef = useRef(null);
	useResizable(inspRef, 'x');
	useResizable(consoleRef, 'y');
	
	_editor.inspRef = inspRef;
	_editor.consoleRef = consoleRef;
	
	useEffect(() => {
		_editor.showCodeEditor = () => setCodeEditorOpen(true);
		_editor.hideCodeEditor = () => setCodeEditorOpen(false);
		_events.on('editor-mode', m => setEditorMode(m));
	}, []);

	return (
		<div className="editor-main">
			<div className="inspector resizable no-select no-scrollbar" ref={inspRef}>
				<Inspector />
			</div>
			{editorMode == '2D' && (
				<div className="drawbar no-select no-scrollbar" ref={drawBarRef}>
					<DrawBar />
				</div>
			)}
			<div className="center-column">
				<GameView editorMode={editorMode} setEditorMode={setEditorMode} />
				<div className="console resizable no-select" ref={consoleRef}>
					<ConsoleView />
				</div>
			</div>
			
			<CodeEditor 
				theme={theme}
				isOpen={codeEditorOpen}
			/>
		</div>
	);
}