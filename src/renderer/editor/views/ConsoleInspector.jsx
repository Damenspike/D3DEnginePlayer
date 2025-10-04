import React, { useState, useEffect, useRef } from 'react';

export default function ConsoleInspector() {
	const [editorConsole, setEditorConsole] = useState(_editor.console);
	const scrollRef = useRef();
	const autoScroll = useRef(true);

	useEffect(() => {
		_events.on('editor-console', (ec) => {
			setEditorConsole([...ec]);
		});
		_events.on('clear-console', clearConsole);
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
		
		// Deduplicate entries and count occurrences
		const uniqueEntries = new Map();
		editorConsole.forEach(({ level, message }) => {
			const key = `${level}:${message}`;
			const entry = uniqueEntries.get(key) || { level, message, count: 0 };
			entry.count += 1;
			uniqueEntries.set(key, entry);
		});
		
		// Render unique entries with count badge
		Array.from(uniqueEntries.values()).forEach(({ level, message, count }, index) => {
			const classes = ['console-entry', `console-entry-${level}`];
			const c = count < 1000 ? count : '999+'
			rows.push(
				<div
					key={index}
					className={classes.join(' ')}
				>
					{count > 1 && (
						<span className="console-count-badge">{c}</span>
					)}
					{message}
				</div>
			);
		});
		
		return rows;
	};

	return (
		<div 
			ref={scrollRef}
			className='console-inspector shade'
			onScroll={onScroll}
		>
			{drawOptions()}
			{drawConsoleLines()}
		</div>
	);
}