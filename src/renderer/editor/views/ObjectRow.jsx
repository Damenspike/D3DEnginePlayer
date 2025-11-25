import { useState, useEffect, useRef } from 'react';

let renameTimer;

export default function ObjectRow({
	style, title, icon, name, selected,
	onClick, onRightClick, onDoubleClick, onRename, isInstance, children,
	
	// Other
	displayName = '',
	
	// Drag & Drop
	draggable = false,
	droppable = false,
	dragData = null,
	onDrop,
	onDragStart,
	onDragEnd,
	onDragOver,
	onDragEnter,
	onDragLeave
}) {
	const [editing, setEditing] = useState(false);
	const [draftName, setDraftName] = useState(name);
	const [dragOver, setDragOver] = useState(false);
	const inputRef = useRef(null);

	useEffect(() => {
		const onEdit = () => {
			selected && setEditing(true);
		}
		
		_events.on('edit-object-row', onEdit);
		
		return () => {
			_events.un('edit-object-row', onEdit);
		}
	}, [selected]);
	
	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editing]);

	useEffect(() => {
		setDraftName(name);
	}, [name]);

	const saveRename = async () => {
		const newName = draftName.trim();

		if (newName && newName !== name) {
			const res = await onRename?.(newName);
			if (res !== undefined)
				setDraftName(res);
		}

		setTimeout(() => setEditing(false), 200);
	};

	const cancelRename = () => {
		setEditing(false);
		setDraftName(name);
	};

	// ---- DnD helpers ----
	const MIME = 'application/x-d3d-objectrow';

	const pack = (data) => JSON.stringify(data ?? {});

	const unpack = (e) => {
		try {
			return JSON.parse(e.dataTransfer.getData(MIME) || '{}');
		} catch {
			return null;
		}
	};

	return (
		<div
			className={[
				'object-row',
				selected ? 'object-row--selected' : '',
				dragOver ? 'object-row--dragover' : ''
			].filter(Boolean).join(' ')}
			style={style ?? {}}
			title={title}
			draggable={!!draggable && !editing}

			onDragStart={(e) => {
				if (!draggable || editing)
					return;

				e.dataTransfer.effectAllowed = 'copyMove';
				e.dataTransfer.setData(MIME, pack(dragData ?? { name, title }));
				onDragStart?.(e, dragData);
				clearTimeout(renameTimer);
			}}

			onDragEnd={(e) => {
				onDragEnd?.(e);
			}}

			onDragOver={(e) => {
				if (!droppable)
					return;

				const payload = unpack(e);
				if (!payload)
					return;

				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';

				if (!dragOver)
					setDragOver(true);

				onDragOver?.(e, payload);
			}}

			onDragEnter={(e) => {
				if (!droppable)
					return;

				const payload = unpack(e);
				if (!payload)
					return;

				setDragOver(true);
				onDragEnter?.(e);
			}}

			onDragLeave={(e) => {
				if (!droppable)
					return;

				setDragOver(false);
				onDragLeave?.(e);
			}}

			onDrop={(e) => {
				if (!droppable)
					return;

				e.preventDefault();
				const payload = unpack(e);
				setDragOver(false);

				if (payload)
					onDrop?.(e, payload);
			}}

			onClick={(e) => {
				if (editing) {
					e.preventDefault();
					return;
				}

				if (selected && !e.shiftKey && !e.metaKey && !e.ctrlKey &&
					(_editor.selectedObjects.length == 1 || !isInstance)) {
					clearTimeout(renameTimer);
					renameTimer = setTimeout(() => setEditing(true), 500);
				}

				onClick?.(e);
			}}

			onDoubleClick={(e) => {
				clearTimeout(renameTimer);

				if (editing) {
					e.preventDefault();
					return;
				}

				onDoubleClick?.(e);
			}}
			
			onContextMenu={e => {
				onRightClick?.(e);
			}}
		>
			{icon}
			{editing ? (
				<input
					ref={inputRef}
					value={draftName}
					onChange={(e) => setDraftName(e.target.value)}
					onBlur={saveRename}
					onKeyDown={(e) => {
						if (e.key === 'Enter')
							saveRename();

						if (e.key === 'Escape')
							cancelRename();
					}}
					style={{ font: 'inherit', padding: 2 }}
				/>
			) : (
				displayName || name
			)}
			{children}
		</div>
	);
}