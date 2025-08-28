import React from 'react';
import Inspector from './Inspector.jsx';
import GameView from './GameView.jsx';
import useResizable from '../hooks/useResizable.js';

export default function EditorMain() {
	const inspRef = React.useRef(null);
	const consoleRef = React.useRef(null);
	useResizable(inspRef, 'x');
	useResizable(consoleRef, 'y');

	return (
		<div className="editor-main">
			<div className="inspector resizable no-select" ref={inspRef}>
				<Inspector />
			</div>
			<div className="center-column">
				<GameView />
				<div className="console resizable" ref={consoleRef}></div>
			</div>
		</div>
	);
}