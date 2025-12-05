import D3DConsole from './d3dconsole.js';

export function onMouseDown(e) {
	const r = _host.renderer2d;
	const pid = getPointerId(e, false);
	
	e.pointerId = pid;

	for(const d3dobject of r._renderObjects) {
		if(e.blocked)
			break;
			
		e.block = () => {
			e.blocked = true;
		}
		
		if (
			typeof d3dobject?.onMouseDown !== 'function' &&
			typeof d3dobject?.onMouseUp   !== 'function' &&
			typeof d3dobject?.graphic2d?.blocks === 'undefined'
		) {
			continue;
		}
		
		if (!d3dobject.hitTestPoint(_input.mouse))
			continue;
		
		// This pointer now "owns" the click/drag on this object
		d3dobject.isClicked = true;
		d3dobject.pointerId = pid;
		
		if(d3dobject.graphic2d?.blocks)
			e.blocked = true;
		
		try {
			d3dobject.onMouseDown?.(e);
		}catch(e) {
			D3DConsole.error(e);
		}
	}
}

export function onMouseUp(e) {
	const r   = _host.renderer2d;
	const pid = getPointerId(e, true); // for touchend we care about changedTouches
	
	e.pointerId = pid;

	for(const d3dobject of r._renderObjects) {
		if(e.blocked)
			break;
			
		e.block = () => {
			e.blocked = true;
		}
		
		if(d3dobject?.isMouseOver && typeof d3dobject.onRelease === 'function') {
			try {
				d3dobject.onRelease(e);
			}catch(e) {
				D3DConsole.error(e);
			}
		}
		
		if (typeof d3dobject?.onMouseUp !== 'function')
			continue;
		
		if (!d3dobject.isClicked)
			continue;
		
		// Only release if this pointer matches the one that pressed it
		if (d3dobject.pointerId !== undefined && d3dobject.pointerId !== pid)
			continue;
		
		d3dobject.isClicked = false;
		d3dobject.pointerId = undefined;
		
		if(d3dobject.graphic2d?.blocks)
			e.blocked = true;
		
		try {
			d3dobject.onMouseUp?.(e);
		}catch(e) {
			D3DConsole.error(e);
		}
	}
}

export function onMouseMove(e) {
	const r = _host.renderer2d;
	const pid = getPointerId(e, true);
	
	e.pointerId = pid;
	
	for(const d3dobject of r._renderObjects) {
		e.block = () => {
			e.blocked = true;
		}
		
		if (
			typeof d3dobject?.onMouseMove !== 'function' &&
			typeof d3dobject?.onMouseOver !== 'function' && 
			typeof d3dobject?.onMouseOut  !== 'function' &&
			typeof d3dobject?.graphic2d?.blocks === 'undefined'
		) {
			continue;
		}
		
		// Only send if this pointer matches the one that pressed it
		if (d3dobject.pointerId !== undefined && d3dobject.pointerId !== pid)
			continue;
			
		if(d3dobject.isMouseOver) {
			try {
				d3dobject.onMouseMove?.(e);
			}catch(e) {
				D3DConsole.error(e);
			}
		}
		
		if (!d3dobject.hitTestPoint(_input.mouse) || e.blocked) {
			d3dobject.isMouseOver = false;
			
			try {
				d3dobject.onMouseOut?.(e);
			}catch(e) {
				D3DConsole.error(e);
			}
			
			continue;
		}
		
		if(e.blocked)
			break;
			
		if(d3dobject.graphic2d?.blocks)
			e.blocked = true;
		
		if (!d3dobject.isMouseOver) {
			d3dobject.isMouseOver = true;
			
			try {
				d3dobject.onMouseOver?.(e);
			}catch(e) {
				D3DConsole.error(e);
			}
		}
	}
}

export function onMouseWheel(e) {
	const r = _host.renderer2d;
	
	for(const d3dobject of r._renderObjects) {
		if(e.blocked)
			break;
			
		e.block = () => {
			e.blocked = true;
		}
		
		if (
			typeof d3dobject?.onMouseWheel !== 'function' &&
			typeof d3dobject?.graphic2d?.blocks === 'undefined'
		)
			continue;
			
		if (!d3dobject.hitTestPoint(_input.mouse))
			continue;
			
		if(d3dobject.graphic2d?.blocks)
			e.blocked = true;
		
		try {
			d3dobject.onMouseWheel?.(e);
		}catch(e) {
			D3DConsole.error(e);
		}
	}
}

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