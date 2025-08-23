export default class D3DInput {
	constructor() {
		this._listenersDown = [];
		this._listenersUp = [];
		this._keys = {};

		// Mouse state
		this.mouseLock = false;
		this.mouse = { x: 0, y: 0, buttons: {} };
		this._mouseDelta = { x: 0, y: 0 };
		this._mouseFrozen = false;   // <-- NEW

		this._mouseDownListeners = [];
		this._mouseUpListeners = [];
		this._mouseMoveListeners = [];
		this._pointerLockListeners = [];

		// Bind methods
		this._onKeyDown = this._onKeyDown.bind(this);
		this._onKeyUp = this._onKeyUp.bind(this);
		this._onMouseDown = this._onMouseDown.bind(this);
		this._onMouseUp = this._onMouseUp.bind(this);
		this._onMouseMove = this._onMouseMove.bind(this);
		this._onPointerLockChange = this._onPointerLockChange.bind(this);

		// Add event listeners
		window.addEventListener('keydown', this._onKeyDown);
		window.addEventListener('keyup', this._onKeyUp);
		window.addEventListener('mousedown', this._onMouseDown);
		window.addEventListener('mouseup', this._onMouseUp);
		window.addEventListener('mousemove', this._onMouseMove);
		document.addEventListener('pointerlockchange', this._onPointerLockChange);
	}

	// --- Freeze/unfreeze mouse ---
	freezeMouse() {
		this._mouseFrozen = true;
		// clear state so clicks aren't "stuck"
		this.mouse.buttons = {};
		this._mouseDelta = { x: 0, y: 0 };
	}

	unfreezeMouse() {
		this._mouseFrozen = false;
	}

	isMouseFrozen() {
		return this._mouseFrozen;
	}

	// --- Keyboard ---
	_onKeyDown(e) {
		this._keys[e.code] = true;
		this._listenersDown.forEach(listener => listener(e));
	}

	_onKeyUp(e) {
		this._keys[e.code] = false;
		this._listenersUp.forEach(listener => listener(e));
	}
	
	_onPointerLockChange(e) {
		this._pointerLockListeners.forEach(listener => listener(
			{...e, pressedEsc: document.pointerLockElement === null})
		);
	}

	_keyNameToCode(key) {
		// letters a-z
		if (key.length === 1 && /^[a-z]$/i.test(key)) return 'Key' + key.toUpperCase();
	
		// digits
		if (key.length === 1 && /^[0-9]$/.test(key)) return 'Digit' + key;
	
		// modifiers
		switch (key.toLowerCase()) {
			case 'shift': return 'ShiftLeft';   // or maybe check both ShiftLeft/ShiftRight
			case 'ctrl': return 'ControlLeft';
			case 'space': return 'Space';
			case 'control': return 'ControlLeft';
			case 'alt': return 'AltLeft';
			case 'meta': return 'MetaLeft';     // command key on Mac
			case 'arrowup': return 'ArrowUp';
			case 'arrowdown': return 'ArrowDown';
			case 'arrowleft': return 'ArrowLeft';
			case 'arrowright': return 'ArrowRight';
			default: return key;                // fallback to whatever string
		}
	}

	getKeyDown(key) {
		const code = this._keyNameToCode(key);
		return this._keys[code] === true;
	}

	getControllerAxis() {
		let x = 0, y = 0;
		if (this.getKeyDown('d')) x += 1;
		if (this.getKeyDown('a')) x -= 1;
		if (this.getKeyDown('s')) y += 1;
		if (this.getKeyDown('w')) y -= 1;
		return { x, y };
	}
	
	getIsGameInFocus() {
		return _container3d.matches(':focus');
	}

	// --- Mouse ---
	_afterRenderFrame() {
		this._mouseDelta.x = 0;
		this._mouseDelta.y = 0;
	}
	
	_onMouseDown(e) {
		if (this._mouseFrozen) return;   // <-- NEW
		this.mouse.buttons[e.button] = true;
		this._mouseDownListeners.forEach(listener => listener(e));
	}

	_onMouseUp(e) {
		if (this._mouseFrozen) return;   // <-- NEW
		this.mouse.buttons[e.button] = false;
		this._mouseUpListeners.forEach(listener => listener(e));
	}

	_onMouseMove(e) {
		if (this._mouseFrozen) return;   // <-- NEW
		const x = e.clientX;
		const y = e.clientY;
		
		// update positions
		this.mouse.x = x;
		this.mouse.y = y;
		
		this._mouseDelta.x = e.movementX;
		this._mouseDelta.y = e.movementY;
		
		this._mouseMoveListeners.forEach(listener => listener(e));
	}

	getMouseButtonDown(button) {
		return !!this.mouse.buttons[button]; // 0=left, 1=middle, 2=right
	}

	getLeftMouseButtonDown() { return this.getMouseButtonDown(0); }
	getMiddleMouseButtonDown() { return this.getMouseButtonDown(1); }
	getRightMouseButtonDown() { return this.getMouseButtonDown(2); }

	getMousePosition() {
		return { x: this.mouse.x, y: this.mouse.y };
	}
	getMouseDelta() {
		return { ...this._mouseDelta };
	}

	// --- Event listeners ---
	addEventListener(type, handler) {
		switch (type) {
			case 'keydown': this._listenersDown.push(handler); break;
			case 'keyup': this._listenersUp.push(handler); break;
			case 'mousedown': this._mouseDownListeners.push(handler); break;
			case 'mouseup': this._mouseUpListeners.push(handler); break;
			case 'mousemove': this._mouseMoveListeners.push(handler); break;
			case 'pointerlockchange': this._pointerLockListeners.push(handler); break;
		}
	}

	removeEventListener(type, handler) {
		let arr;
		switch (type) {
			case 'keydown': arr = this._listenersDown; break;
			case 'keyup': arr = this._listenersUp; break;
			case 'mousedown': arr = this._mouseDownListeners; break;
			case 'mouseup': arr = this._mouseUpListeners; break;
			case 'mousemove': arr = this._mouseMoveListeners; break;
			case 'pointerlockchange': arr = this._pointerLockListeners; break;
			default: return;
		}
		const index = arr.indexOf(handler);
		if (index !== -1) arr.splice(index, 1);
	}

	// --- Cleanup ---
	dispose() {
		window.removeEventListener('keydown', this._onKeyDown);
		window.removeEventListener('keyup', this._onKeyUp);
		window.removeEventListener('mousedown', this._onMouseDown);
		window.removeEventListener('mouseup', this._onMouseUp);
		window.removeEventListener('mousemove', this._onMouseMove);
		document.removeEventListener('pointerlockchange', this._onPointerLockChange);

		this._listenersDown = [];
		this._listenersUp = [];
		this._keys = {};
		this._mouseDownListeners = [];
		this._mouseUpListeners = [];
		this._mouseMoveListeners = [];
		this.mouse = { x: 0, y: 0, buttons: {} };
		this._mouseDelta = { x: 0, y: 0 };
		this._mouseFrozen = false;
	}
}