import React from 'react';
import Inspector from './Inspector.jsx';
import GameView from './GameView.jsx';
import useResizable from '../hooks/useResizable.js';

export default function EditorMain() {
	const inspRef = React.useRef(null);
	const assetsRef = React.useRef(null);
	useResizable(inspRef, 'x');
	useResizable(assetsRef, 'y');

	return (
		<div className="editor-main">
			<Inspector ref={inspRef} />
			<div className="center-column">
				<GameView />
				<div className="assets resizable" id="assets-view" ref={assetsRef}></div>
			</div>
		</div>
	);
}