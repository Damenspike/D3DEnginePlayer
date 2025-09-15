// utilities/draggable.js
// TABS, edge-aware, no preventDefault
export function attachDraggable(panelEl, {
	ignoreSelector = '.code-editor__input',
	edgeThreshold = 14,   // px near edges -> let native resize win
	padding = 0
} = {}) {
	let startX = 0, startY = 0, startLeft = 0, startTop = 0;
	let dragging = false;

	function onPointerDown(e) {
		// must start inside the panel
		if (!panelEl.contains(e.target)) return;
		// skip editor input (Monaco)
		if (ignoreSelector && e.target.closest(ignoreSelector)) return;

		// If user pressed near any edge, let native resize handle it
		const rect = panelEl.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const nearLeft   = x <= edgeThreshold;
		const nearRight  = rect.width - x <= edgeThreshold;
		const nearTop    = y <= edgeThreshold;
		const nearBottom = rect.height - y <= edgeThreshold;
		if (nearLeft || nearRight || nearTop || nearBottom) return;

		// baseline
		if (!panelEl.style.left) panelEl.style.left = rect.left + 'px';
		if (!panelEl.style.top)  panelEl.style.top  = rect.top + 'px';

		startX = e.clientX;
		startY = e.clientY;
		startLeft = rect.left;
		startTop  = rect.top;
		dragging = true;

		document.addEventListener('pointermove', onPointerMove);
		document.addEventListener('pointerup', onPointerUp, { once: true });
	}

	function onPointerMove(e) {
		if (!dragging) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		let left = startLeft + dx;
		let top  = startTop  + dy;

		// clamp to viewport
		const vw = window.innerWidth, vh = window.innerHeight;
		const rect = panelEl.getBoundingClientRect();
		const maxLeft = vw - rect.width  - padding;
		const maxTop  = vh - rect.height - padding;
		left = Math.max(padding, Math.min(left, maxLeft));
		top  = Math.max(padding, top);

		panelEl.style.left = left + 'px';
		panelEl.style.top  = top  + 'px';
	}

	function onPointerUp() {
		dragging = false;
		document.removeEventListener('pointermove', onPointerMove);
	}
	
	function onMouseDown(e) {
		e.stopPropagation();
	}

	panelEl.addEventListener('pointerdown', onPointerDown);
	panelEl.addEventListener('mousedown', onMouseDown);

	// cleanup
	return () => {
		panelEl.removeEventListener('pointerdown', onPointerDown);
		document.removeEventListener('pointermove', onPointerMove);
	};
}