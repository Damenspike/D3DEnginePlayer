_input.freezeMouse();
_input.addEventListener('keydown', (e) => {
	if(e.code == 'Escape')
		self.visible = !self.visible;
});
_input.addEventListener('pointerlockchange', (e) => {
	if(e.pressedEsc)
		self.visible = !self.visible;
	
	console.log(e);
});

self.close = () => {
	self.visible = false;
}
self.onVisibilityChanged = () => {
	if(self.visible)
		_input.freezeMouse();
	else
		_input.unfreezeMouse();
}