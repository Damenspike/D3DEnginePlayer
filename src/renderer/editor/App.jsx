import React, { useEffect } from 'react';
import Topbar from './views/Topbar.jsx';
import EditorMain from './views/EditorMain.jsx';
import useSystemTheme from './hooks/useSystemTheme.js';
import { loadD3DProj } from '../../engine/d3deditor.js';

import '../../assets/style/main.css';
import '../../assets/style/editor.css';

export default function App() {
	const theme = useSystemTheme();
	
	return (
		<div className="editor-shell">
			<Topbar />
			<EditorMain />
		</div>
	);
}