import { useState, useEffect, useRef } from 'react';

let renameTimer;

export default function ObjectRow({
	style, title, icon, name, selected, onClick, onDoubleClick, onRename, children
}) {
	const [editing, setEditing] = useState(false);
	const [draftName, setDraftName] = useState(name);
	const inputRef = useRef(null);
	
	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editing]);
	
	useEffect(() => {
		setDraftName(name);
	}, [name]);
	
	const saveRename = () => {
		const newName = draftName.trim();
		
		if (newName && newName !== name) {
			let res = onRename?.(newName);
			console.log('Res', res);
			if(res !== undefined)
				setDraftName(res);
		}
		
		setEditing(false);
	}
	const cancelRename = () => {
		setEditing(false);
		setDraftName(name);
	}
	
	const time = () => new Date().getTime() / 1000;
	  
	return (
		<div
			className={`object-row ${selected ? 'object-row--selected' : ''}`}
			style={style ?? {}}
			title={title}
			onClick={e => {
				if(editing) {
					e.preventDefault();
					return;
				}
				if(selected) {
					clearTimeout(renameTimer);
					renameTimer = setTimeout(
						() => setEditing(true),
						500
					);
				}
				
				onClick?.(e);
			}}
			onDoubleClick={e => {
				clearTimeout(renameTimer);
				
				if(editing) {
					e.preventDefault();
					return;
				}
				
				onDoubleClick?.(e)
			}}
		>
			{icon} 
			{editing ? (
				<input
					ref={inputRef}
					value={draftName}
					onChange={e => setDraftName(e.target.value)}
					onBlur={saveRename}
					onKeyDown={e => {
						if (e.key === 'Enter') 
							saveRename();
						if (e.key === 'Escape') 
							cancelRename();
					}}
					style={{ font: 'inherit', padding: 2 }}
				/>
			) : (
				name
			)}
			{children}
		</div>
	)
}