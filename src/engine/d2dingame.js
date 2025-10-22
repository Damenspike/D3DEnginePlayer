export function onMouseUp() {
	const r = _host.renderer2d;
	
	r._renderObjects.forEach(d3dobject => {
		if(typeof d3dobject?.onMouseUp !== 'function')
			return;
		
		if(d3dobject.isClicked) {
			d3dobject.isClicked = false;
			d3dobject.onMouseUp();
		}
	});
}
export function onMouseDown() {
	const r = _host.renderer2d;
	
	r._renderObjects.forEach(d3dobject => {
		if(
			typeof d3dobject?.onMouseDown !== 'function' && 
			typeof d3dobject?.onMouseUp !== 'function'
		)
			return;
			
		if(!d3dobject.hitTestPoint(_input.mouse))
			return;
		
		d3dobject.isClicked = true;
		d3dobject.onMouseDown();
	});
}
export function onMouseMove() {
	const r = _host.renderer2d;
	
	r._renderObjects.forEach(d3dobject => {
		if(
			typeof d3dobject?.onMouseMove !== 'function' &&
			typeof d3dobject?.onMouseOver !== 'function' && 
			typeof d3dobject?.onMouseOut !== 'function'
		)
			return;
			
		if(!d3dobject.hitTestPoint(_input.mouse)) {
			d3dobject.isMouseOver = false;
			d3dobject.onMouseOut?.();
			return;
		}
		
		d3dobject.onMouseMove?.();
		
		if(!d3dobject.isMouseOver) {
			d3dobject.isMouseOver = true;
			d3dobject.onMouseOver?.();
		}
	});
}
export function onMouseWheel() {
	const r = _host.renderer2d;
	
	r._renderObjects.forEach(d3dobject => {
		if(typeof d3dobject?.onMouseWheel !== 'function')
			return;
			
		if(!d3dobject.hitTestPoint(_input.mouse))
			return;
		
		d3dobject.onMouseWheel();
	});
}