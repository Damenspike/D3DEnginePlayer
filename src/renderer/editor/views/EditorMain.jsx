import React, { useState, useEffect, useRef } from 'react';
import Inspector from './Inspector.jsx';
import GameView from './GameView.jsx';
import ConsoleView from './ConsoleView.jsx';
import CodeEditor from './CodeEditor.jsx';
import useResizable from '../hooks/useResizable.js';

export default function EditorMain({theme}) {
	const [codeEditorOpen, setCodeEditorOpen] = useState(false);
	
	const inspRef = useRef(null);
	const consoleRef = useRef(null);
	useResizable(inspRef, 'x');
	useResizable(consoleRef, 'y');
	
	useEffect(() => {
		_editor.showCodeEditor = () => setCodeEditorOpen(true);
		_editor.hideCodeEditor = () => setCodeEditorOpen(false);
	}, []);

	return (
		<div className="editor-main">
			<div className="inspector resizable no-select" ref={inspRef}>
				<Inspector />
			</div>
			<div className="center-column">
				<GameView />
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