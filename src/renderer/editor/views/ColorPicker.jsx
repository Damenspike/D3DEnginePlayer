import { 
	useMemo, useRef, useCallback, useState, useEffect, useLayoutEffect 
} from 'react';
import { createPortal } from 'react-dom';
import { RgbaColorPicker } from 'react-colorful';

/* --- helpers --- */
const normalizeHex = (hex) => {
	if (!hex) return '0xFFFFFFFF';
	if (hex.startsWith('#')) hex = '0x' + hex.slice(1);
	let n = Number(hex);
	if (!Number.isFinite(n)) n = 0xFFFFFFFF;
	return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0'); // RRGGBBAA
};

export function hexToRgbaObj(hex) {
	const h = normalizeHex(String(hex));
	const n = Number(h);
	const r = (n >>> 24) & 0xFF;
	const g = (n >>> 16) & 0xFF;
	const b = (n >>>  8) & 0xFF;
	const a = (n & 0xFF) / 255;
	return { r, g, b, a };
}

export function rgbaObjToHex({ r, g, b, a }) {
	const rr = (r & 255) | 0;
	const gg = (g & 255) | 0;
	const bb = (b & 255) | 0;
	const aa = Math.max(0, Math.min(255, Math.round((a ?? 1) * 255)));
	const n = (((rr << 24) >>> 0) | (gg << 16) | (bb << 8) | aa) >>> 0;
	return '0x' + n.toString(16).toUpperCase().padStart(8, '0');
}

const rgbaToCss = ({ r, g, b, a }) => `rgba(${r|0}, ${g|0}, ${b|0}, ${Math.max(0, Math.min(1, a ?? 1))})`;

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

/* --- component --- */
export default function ColorPicker({
	value,
	onChange,
	onBlur,
	onKeyDown,
	onClick,
	readOnly = false,
	displayMode = 'full' // 'full' | 'small'
}) {
	const propHex = normalizeHex(String(value ?? '0xFFFFFFFF'));
	const rgba = useMemo(() => hexToRgbaObj(propHex), [propHex]);

	// last value we told the parent
	const lastEmittedRef = useRef(propHex);
	if (lastEmittedRef.current !== propHex) {
		lastEmittedRef.current = propHex; // sync when parent changes externally
	}

	const emitChange = useCallback((rgbaVal) => {
		if (readOnly) return;
		const hex = rgbaObjToHex(rgbaVal);
		if (hex === lastEmittedRef.current) return; // guard: no echo
		lastEmittedRef.current = hex;
		onChange?.(hex);
	}, [onChange, readOnly]);

	const handleCommitBlur = useCallback(() => {
		if (readOnly) return;
		onBlur?.(lastEmittedRef.current);
	}, [onBlur, readOnly]);

	/* ---------- full mode (original) ---------- */
	if (displayMode === 'full') {
		return (
			<div
				className="color-field"
				tabIndex={readOnly ? -1 : 0}
				onKeyDown={readOnly ? undefined : onKeyDown}
				onClick={() => onClick?.(propHex)}
				onPointerUp={handleCommitBlur}
				onBlur={handleCommitBlur}
				style={readOnly ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
			>
				<RgbaColorPicker color={rgba} onChange={emitChange} />
			</div>
		);
	}

	/* ---------- small mode (swatch + popup) ---------- */
	const [open, setOpen] = useState(false);
	const anchorRef = useRef(null);
	const panelRef = useRef(null);
	const [panelStyle, setPanelStyle] = useState({ top: 0, left: 0 });

	const openPopup = useCallback(() => {
		if (readOnly) return;
		onClick?.(propHex);
		setOpen(true);
	}, [onClick, propHex, readOnly]);

	const closePopup = useCallback(() => {
		if (!open) return;
		setOpen(false);
		handleCommitBlur();
	}, [open, handleCommitBlur]);

	useOutsideClose([anchorRef, panelRef], closePopup, open);

	useLayoutEffect(() => {
		if (!open) return;
		const a = anchorRef.current;
		if (!a) return;
		const rect = a.getBoundingClientRect();
		const GAP = 8;
		const desiredTop = rect.bottom + GAP + window.scrollY;
		const desiredLeft = rect.left + window.scrollX;

		// Basic viewport clamping
		const maxLeft = Math.max(0, window.scrollX + document.documentElement.clientWidth - 260);
		const left = Math.min(desiredLeft, maxLeft);
		const maxTop = Math.max(0, window.scrollY + document.documentElement.clientHeight - 300);
		const top = Math.min(desiredTop, maxTop);

		setPanelStyle({ top, left });
	}, [open]);

	return (
		<>
			<button
				ref={anchorRef}
				type="button"
				className="color-field-swatch"
				aria-label="Open color picker"
				disabled={readOnly}
				onClick={openPopup}
				onKeyDown={readOnly ? undefined : onKeyDown}
				style={{
					cursor: readOnly ? 'not-allowed' : 'pointer',
					background:
						// checkerboard bg + color overlay
						`${rgbaToCss(rgba)}`
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
						boxShadow: '0 10px 24px rgba(0,0,0,0.35)'
					}}
				>
					<RgbaColorPicker color={rgba} onChange={emitChange} />
				</div>,
				document.body
			)}
		</>
	);
}