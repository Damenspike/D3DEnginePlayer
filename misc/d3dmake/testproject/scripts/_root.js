_root.buttonify = (d3dobject) => {
	var mouseOver = false;
	var mouseDown = false;

	d3dobject.onEnterFrame = () => {
		d3dobject.Normal.visible = !mouseOver && !mouseDown;
		d3dobject.Hover.visible = mouseOver && !mouseDown;
		d3dobject.Pressed.visible = mouseDown;
	}
	d3dobject.onMouseOver = () => {
		mouseOver = true;
	}
	d3dobject.onMouseOut = () => {
		mouseOver = false;
	}
	d3dobject.onMouseDown = () => {
		mouseDown = true;
	}
	d3dobject.onMouseUp = () => {
		mouseDown = false;
	}
}