import { useEffect } from 'react';

export default function useResizable(ref, axis) {
	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		let current = null, startX = 0, startY = 0, startW = 0, startH = 0;

		function onMouseDown(e) {
			const rect = el.getBoundingClientRect();
			if (axis === 'x') {
				const nearRight = (e.clientX > rect.right - 6) && (e.clientX < rect.right + 10);
				if (!nearRight) return;
				current = el;
				startX = e.clientX;
				startW = el.offsetWidth;
				document.body.style.cursor = 'ew-resize';
			} else {
				const nearTop = (e.clientY < rect.top + 6) && (e.clientY > rect.top - 10);
				if (!nearTop) return;
				current = el;
				startY = e.clientY;
				startH = el.offsetHeight;
				document.body.style.cursor = 'ns-resize';
			}
		}

		function onMouseMove(e) {
			if (!current) return;
			if (axis === 'x') {
				const w = Math.max(200, startW + (e.clientX - startX));
				current.style.width = w + 'px';
			} else {
				const h = Math.max(80, startH - (e.clientY - startY));
				current.style.height = h + 'px';
			}
		}

		function onMouseUp() {
			current = null;
			document.body.style.cursor = 'default';
		}

		document.addEventListener('mousedown', onMouseDown);
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		return () => {
			document.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		};
	}, [ref, axis]);
}