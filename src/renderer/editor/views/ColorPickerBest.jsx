import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import GradientColorPicker from 'react-best-gradient-color-picker';

function useOutsideClose(refs, onClose, enabled) {
	useEffect(() => {
		if (!enabled) return;
		const onDown = (e) => {
			const inside = refs.some(ref => ref.current && ref.current.contains(e.target));
			if (!inside) onClose();
		};
		const onKey = (e) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [refs, onClose, enabled]);
}

export default function ColorPickerBest({
	value,
	onChange,
	onClick,
	onBlur,
	readOnly = false
}) {
	const [open, setOpen] = useState(false);
	const anchorRef = useRef(null);
	const panelRef = useRef(null);
	const [panelStyle, setPanelStyle] = useState({ top: 0, left: 0 });

	const openPopup = useCallback(() => {
		if (readOnly) return;
		onClick?.(value);
		setOpen(true);
	}, [onClick, readOnly, value]);

	const closePopup = useCallback(() => {
		if (!open) return;
		setOpen(false);
		onBlur?.(value);
	}, [open, onBlur, value]);

	useOutsideClose([anchorRef, panelRef], closePopup, open);

	useLayoutEffect(() => {
		if (!open) return;
		const a = anchorRef.current;
		if (!a) return;
		const rect = a.getBoundingClientRect();
		const GAP = 8;
		const desiredTop = rect.bottom + GAP + window.scrollY;
		const desiredLeft = rect.left + window.scrollX;
		const maxLeft = Math.max(0, window.scrollX + document.documentElement.clientWidth - 320);
		const maxTop = Math.max(0, window.scrollY + document.documentElement.clientHeight - 480);
		const left = Math.min(desiredLeft, maxLeft);
		const top = Math.min(desiredTop, maxTop);
		setPanelStyle({ top, left });
	}, [open]);

	return (
		<>
			<button
				ref={anchorRef}
				type="button"
				tabIndex={readOnly ? -1 : 0}
				className="color-field-swatch"
				aria-label="Open gradient picker"
				disabled={readOnly}
				onClick={() => {
					onClick?.(value);
					open ? closePopup() : openPopup();
				}}
				onBlur={() => onBlur?.(value)}
				style={{
					cursor: readOnly ? 'not-allowed' : 'pointer',
					background: value || 'linear-gradient(90deg,#ff0000,#0000ff)',
				}}
			/>

			{open && createPortal(
				<div
					ref={panelRef}
					className="color-field-popup"
					style={{
						position: 'absolute',
						top: panelStyle.top,
						left: panelStyle.left,
						zIndex: 10000,
						background: '#222',
						borderRadius: 8,
						padding: 10,
						boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
						width: 300,
						maxHeight: 'min(90vh,440px)',
						overflow: 'auto'
					}}
				>
					<GradientColorPicker
						value={value}
						onChange={(v) => onChange?.(v)}
						// The library already handles onMouseUp commit internally
						// but we keep this for compatibility
						onClick={() => onClick?.(value)}
						height={200}
					/>
				</div>,
				document.body
			)}
		</>
	);
}