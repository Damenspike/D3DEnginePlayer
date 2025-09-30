import React, { useState, useEffect, useRef } from 'react';

export default function ConsoleInspector() {
	const [editorConsole, setEditorConsole] = useState(_editor.console);
	const scrollRef = useRef();
	const autoScroll = useRef(true);

	useEffect(() => {
		_events.on('editor-console', (ec) => {
			setEditorConsole([...ec]);
		});
	}, []);

	useEffect(() => {
		if (autoScroll.current && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [editorConsole]);
	
	const onScroll = () => {
		if(!scrollRef.current) 
			return;
		
		const { scrollTop, clientHeight, scrollHeight } = scrollRef.current;
		
		autoScroll.current = scrollTop + clientHeight >= scrollHeight - 5;
	};
	const clearConsole = () => {
		_editor.console = [];
		setEditorConsole([]);
	}

	const drawOptions = () => {
		const drawClearButton = () => (
			<div className='clear-console'>
				<button 
					onClick={clearConsole}
					disabled={editorConsole.length < 1}
				>
					Clear
				</button>
			</div>
		)
		return (
			<>
				{drawClearButton()}
			</>
		)
	}
	const drawConsoleLines = () => {
		const rows = [];
		
		editorConsole.forEach(({ level, message }) => {
			const classes = ['console-entry', `console-entry-${level}`];
			
			rows.push(
				<div 
					key={rows.length}
					className={classes.join(' ')}
				>
					{message}
				</div>
			);
		});
		
		return rows;
	};

	return (
		<div 
			ref={scrollRef}
			className='console-inspector'
			onScroll={onScroll}
		>
			{drawOptions()}
			{drawConsoleLines()}
		</div>
	);
}