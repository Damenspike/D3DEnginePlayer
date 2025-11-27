function getPointerId(e, useChanged = false) {
	// Touch events
	if (useChanged && e && e.changedTouches && e.changedTouches.length) {
		return e.changedTouches[0].identifier;
	}
	if (!useChanged && e && e.touches && e.touches.length) {
		return e.touches[0].identifier;
	}
	// Mouse or anything else
	return 'mouse';
}

export function onMouseDown(e) {
	const r = _host.renderer2d;
	const pid = getPointerId(e, false);
	
	e.pointerId = pid;

	r._renderObjects.forEach(d3dobject => {
		if (
			typeof d3dobject?.onMouseDown !== 'function' &&
			typeof d3dobject?.onMouseUp   !== 'function'
		) {
			return;
		}
		
		if (!d3dobject.hitTestPoint(_input.mouse))
			return;

		// This pointer now "owns" the click/drag on this object
		d3dobject.isClicked = true;
		d3dobject.pointerId = pid;

		d3dobject.onMouseDown(e);
	});
}

export function onMouseUp(e) {
	const r   = _host.renderer2d;
	const pid = getPointerId(e, true); // for touchend we care about changedTouches
	
	e.pointerId = pid;

	r._renderObjects.forEach(d3dobject => {
		if(d3dobject?.isMouseOver && typeof d3dobject.onRelease === 'function') {
			d3dobject.onRelease(e);
		}
		
		if (typeof d3dobject?.onMouseUp !== 'function')
			return;
		
		if (!d3dobject.isClicked)
			return;

		// Only release if this pointer matches the one that pressed it
		if (d3dobject.pointerId !== undefined && d3dobject.pointerId !== pid)
			return;
		
		d3dobject.isClicked = false;
		d3dobject.pointerId = undefined;
		d3dobject.onMouseUp(e);
	});
}

export function onMouseMove(e) {
	const r = _host.renderer2d;
	const pid = getPointerId(e, true);
	
	e.pointerId = pid;
	
	r._renderObjects.forEach(d3dobject => {
		if (
			typeof d3dobject?.onMouseMove !== 'function' &&
			typeof d3dobject?.onMouseOver !== 'function' && 
			typeof d3dobject?.onMouseOut  !== 'function'
		) {
			return;
		}
		
		// Only send if this pointer matches the one that pressed it
		if (d3dobject.pointerId !== undefined && d3dobject.pointerId !== pid)
			return;
			
		if(d3dobject.isMouseOver)
			d3dobject.onMouseMove?.(e);
		
		if (!d3dobject.hitTestPoint(_input.mouse)) {
			d3dobject.isMouseOver = false;
			d3dobject.onMouseOut?.(e);
			return;
		}
		if (!d3dobject.isMouseOver) {
			d3dobject.isMouseOver = true;
			d3dobject.onMouseOver?.(e);
		}
	});
}

export function onMouseWheel(e) {
	const r = _host.renderer2d;
	
	r._renderObjects.forEach(d3dobject => {
		if (typeof d3dobject?.onMouseWheel !== 'function')
			return;
			
		if (!d3dobject.hitTestPoint(_input.mouse))
			return;
		
		d3dobject.onMouseWheel(e);
	});
}