import React, { useState, useEffect, useRef } from 'react';

export default function ConsoleInspector() {
	const [editorConsole, setEditorConsole] = useState(_editor.console);
	const [code, setCode] = useState('');
	const [codeHistory, setCodeHistory] = useState([]);
	const [stackNumber, setStackNumber] = useState(0);
	
	const scrollRef = useRef();
	const autoScroll = useRef(true);
	const codeRef = useRef(null);

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
		
		return (
			<div className='console-entries'>
				{rows}
			</div>
		);
	};
	const submitCodeInput = () => {
		if(!code) return;
		
		_editor.focus.__runInSandbox(code);
		setCodeHistory([code, ...codeHistory]);
		setCode('');
		setStackNumber(0);
	}
	const endOfCode = () => {
		requestAnimationFrame(() => {
			const el = codeRef.current;
			if(!el) return;
			const len = el.value.length;
			el.setSelectionRange(len, len);
		});
	}
	const drawConsoleInput = () => {
		return (
			<div className='console-input'>
				<input
					ref={codeRef}
					type='text'
					className='tf'
					placeholder='DamenScript ⏎'
					value={code}
					onChange={e => setCode(e.target.value)}
					onKeyDown={e => {
						if(e.keyCode === 13) {
							submitCodeInput();
						}else
						if(e.keyCode === 38) {
							if(stackNumber > codeHistory.length)
								return;
								
							const oldCode = codeHistory[stackNumber];
							
							setCode(oldCode);
							endOfCode();
							setStackNumber(
								stackNumber < codeHistory.length
									? (stackNumber + 1)
									: codeHistory.length
							);
							e.preventDefault();
						}else
						if(e.keyCode === 40) {
							// moving *towards* newer code
							if(stackNumber <= 0) {
								setCode('');          // <-- clear the editor
								setStackNumber(0);    // already at newest
								return;
							}
							
							const oldCode = codeHistory[stackNumber - 1];
							
							setCode(oldCode);
							endOfCode();
							setStackNumber(stackNumber - 1);
							e.preventDefault();
						}
					}}
				/>
			</div>
		)
	}

	return (
		<>
			{drawClearButton()}
			<div 
				ref={scrollRef}
				className='console-inspector shade'
				onScroll={onScroll}
			>
				{drawConsoleLines()}
				{drawConsoleInput()}
			</div>
		</>
	);
}