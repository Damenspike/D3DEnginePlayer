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
		if(typeof d3dobject?.onMouseMove !== 'function')
			return;
			
		if(!d3dobject.hitTestPoint(_input.mouse))
			return;
		
		d3dobject.onMouseMove();
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