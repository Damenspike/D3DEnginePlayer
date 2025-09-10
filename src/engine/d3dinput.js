export default class D3DInput {
	constructor() {
		this._listenersDown = [];
		this._listenersUp = [];
		this._keys = {};

		this.mouseLock = false;
		this.mouse = { x: 0, y: 0, buttons: {} };
		this._mouseDelta = { x: 0, y: 0 };
		this._mouseFrozen = false;

		this._wheelDelta = { x: 0, y: 0, z: 0 };
		this._wheelListeners = [];

		this._mouseDownListeners = [];
		this._mouseUpListeners = [];
		this._mouseMoveListeners = [];
		this._pointerLockListeners = [];

		this._onKeyDown = this._onKeyDown.bind(this);
		this._onKeyUp = this._onKeyUp.bind(this);
		this._onMouseDown = this._onMouseDown.bind(this);
		this._onMouseUp = this._onMouseUp.bind(this);
		this._onMouseMove = this._onMouseMove.bind(this);
		this._onPointerLockChange = this._onPointerLockChange.bind(this);
		this._onWheel = this._onWheel.bind(this);
		this._onBlur = this._onBlur.bind(this);
		this._onVisibility = this._onVisibility.bind(this);

		window.addEventListener('keydown', this._onKeyDown, { passive: false });
		window.addEventListener('keyup', this._onKeyUp);
		window.addEventListener('mousedown', this._onMouseDown);
		window.addEventListener('mouseup', this._onMouseUp);
		window.addEventListener('mousemove', this._onMouseMove);
		window.addEventListener('wheel', this._onWheel, { passive: true });

		document.addEventListener('pointerlockchange', this._onPointerLockChange);
		window.addEventListener('blur', this._onBlur);
		document.addEventListener('visibilitychange', this._onVisibility);
	}

	/* --- helpers --- */
	_isEditableTarget(e) {
		const el = e?.target;
		if (!el) return false;
		if (el.isContentEditable) return !el.hasAttribute('readonly') && !el.hasAttribute('disabled');

		const tag = (el.tagName || '').toUpperCase();
		if (tag === 'TEXTAREA') return !el.readOnly && !el.disabled;
		if (tag !== 'INPUT') return false;

		// only treat text-like inputs as editable
		const type = (el.type || 'text').toLowerCase();
		const textTypes = ['text','search','url','tel','password','email','number'];
		return textTypes.includes(type) && !el.readOnly && !el.disabled;
	}

	/* --- Freeze/unfreeze mouse --- */
	freezeMouse() {
		this._mouseFrozen = true;
		this.mouse.buttons = {};
		this._mouseDelta = { x: 0, y: 0 };
	}
	unfreezeMouse() { this._mouseFrozen = false; }
	isMouseFrozen() { return this._mouseFrozen; }

	/* --- Keyboard --- */
	_onKeyDown(e) {
		const editing = this._isEditableTarget(e);

		// When typing in a field: let the browser handle the key entirely
		if (editing && !(e.ctrlKey || e.metaKey)) {
			return; // no tracking, no preventDefault, no gameplay listeners
		}

		// record state only when not editing (or when using app shortcuts like Ctrl/⌘)
		this._keys[e.code] = true;

		// prevent page scroll only outside inputs
		if (!editing && (e.code === 'Space' || e.code.startsWith('Arrow'))) {
			e.preventDefault();
		}

		this._listenersDown.forEach(listener => listener(e));
	}

	_onKeyUp(e) {
		const editing = this._isEditableTarget(e);

		if (editing && !(e.ctrlKey || e.metaKey)) {
			return; // ignore key tracking while editing
		}

		this._keys[e.code] = false;
		this._listenersUp.forEach(listener => listener(e));
	}

	_onPointerLockChange(e) {
		const exited = (document.pointerLockElement === null);
		if (exited) this._clearKeyState();
		this._pointerLockListeners.forEach(listener => listener({ ...e, pressedEsc: exited }));
	}

	_onBlur() { this._clearKeyState(); }
	_onVisibility() { if (document.hidden) this._clearKeyState(); }

	_clearKeyState() {
		this._keys = {};
		this.mouse.buttons = {};
	}

	_keyNamesToCodes(key) {
		const k = key.toLowerCase();
		if (key.length === 1 && /^[a-z]$/i.test(key)) return ['Key' + key.toUpperCase()];
		if (key.length === 1 && /^[0-9]$/.test(key)) return ['Digit' + key];

		switch (k) {
			case 'shift': return ['ShiftLeft','ShiftRight'];
			case 'ctrl':
			case 'control': return ['ControlLeft','ControlRight'];
			case 'alt': return ['AltLeft','AltRight'];
			case 'meta': return ['MetaLeft','MetaRight'];
			case 'space': return ['Space'];
			case 'arrowup': return ['ArrowUp'];
			case 'arrowdown': return ['ArrowDown'];
			case 'arrowleft': return ['ArrowLeft'];
			case 'arrowright': return ['ArrowRight'];
			default: return [key];
		}
	}

	getKeyDown(key) {
		const codes = this._keyNamesToCodes(key);
		for (const code of codes) {
			if (this._keys[code] === true) return true;
		}
		return false;
	}

	getControllerAxis(wasd = true) {
		let x = 0, y = 0;

		// block gameplay when typing
		if (this.getInputFieldInFocus()) return { x: 0, y: 0 };

		if (this.getKeyDown('control') || this.getKeyDown('meta')) return { x, y };

		if (wasd) {
			if (this.getKeyDown('d')) x += 1;
			if (this.getKeyDown('a')) x -= 1;
			if (this.getKeyDown('s')) y += 1;
			if (this.getKeyDown('w')) y -= 1;
		}
		if (this.getKeyDown('arrowright')) x += 1;
		if (this.getKeyDown('arrowleft')) x -= 1;
		if (this.getKeyDown('arrowdown')) y += 1;
		if (this.getKeyDown('arrowup')) y -= 1;

		return { x, y };
	}

	getControllerAxisArrowsOnly() { return this.getControllerAxis(false); }

	getIsGameInFocus() {
		return _container3d?.matches?.(':focus') === true;
	}

	getCursorOverGame() {
		if(this.assetExplorerOpen)
			return false;
			
		const pos = this.getMousePosition();
		const rect = _container3d.getBoundingClientRect();
		return pos.x >= rect.left && pos.x <= rect.right && pos.y >= rect.top && pos.y <= rect.bottom;
	}

	getInputFieldInFocus() {
		const el = document.activeElement;
		if (!el) return false;
		if (el.isContentEditable) return true;
		const tag = (el.tagName || '').toUpperCase();
		return tag === 'INPUT' || tag === 'TEXTAREA';
	}

	/* --- Mouse --- */
	_afterRenderFrame() {
		this._mouseDelta.x = 0;
		this._mouseDelta.y = 0;
		this._wheelDelta.x = 0;
		this._wheelDelta.y = 0;
		this._wheelDelta.z = 0;
	}

	_onMouseDown(e) {
		if (this._mouseFrozen) return;
		this.mouse.buttons[e.button] = true;
		this._mouseDownListeners.forEach(listener => listener(e));
	}

	_onMouseUp(e) {
		if (this._mouseFrozen) return;
		this.mouse.buttons[e.button] = false;
		this._mouseUpListeners.forEach(listener => listener(e));
	}

	_onMouseMove(e) {
		if (this._mouseFrozen) return;
		this.mouse.x = e.clientX;
		this.mouse.y = e.clientY;
		this._mouseDelta.x = e.movementX;
		this._mouseDelta.y = e.movementY;
		this._mouseMoveListeners.forEach(listener => listener(e));
	}

	getMouseButtonDown(button) { return !!this.mouse.buttons[button]; }
	getLeftMouseButtonDown() { return this.getMouseButtonDown(0); }
	getMiddleMouseButtonDown() { return this.getMouseButtonDown(1); }
	getRightMouseButtonDown() { return this.getMouseButtonDown(2); }

	getMousePosition() { return { x: this.mouse.x, y: this.mouse.y }; }
	getMouseDelta() { return { ...this._mouseDelta }; }

	/* --- Wheel --- */
	_onWheel(e) {
		if (this._mouseFrozen) return;
		this._wheelDelta.x += e.deltaX;
		this._wheelDelta.y += e.deltaY;
		this._wheelDelta.z += e.deltaZ;
		this._wheelListeners.forEach(listener => listener(e));
	}

	getWheelDelta() { return { ...this._wheelDelta }; }

	/* --- Event listeners --- */
	addEventListener(type, handler) {
		switch (type) {
			case 'keydown': this._listenersDown.push(handler); break;
			case 'keyup': this._listenersUp.push(handler); break;
			case 'mousedown': this._mouseDownListeners.push(handler); break;
			case 'mouseup': this._mouseUpListeners.push(handler); break;
			case 'mousemove': this._mouseMoveListeners.push(handler); break;
			case 'wheel': this._wheelListeners.push(handler); break;
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
			case 'wheel': arr = this._wheelListeners; break;
			case 'pointerlockchange': arr = this._pointerLockListeners; break;
			default: return;
		}
		const i = arr.indexOf(handler);
		if (i !== -1) arr.splice(i, 1);
	}

	/* --- Cleanup --- */
	dispose() {
		window.removeEventListener('keydown', this._onKeyDown);
		window.removeEventListener('keyup', this._onKeyUp);
		window.removeEventListener('mousedown', this._onMouseDown);
		window.removeEventListener('mouseup', this._onMouseUp);
		window.removeEventListener('mousemove', this._onMouseMove);
		window.removeEventListener('wheel', this._onWheel);
		document.removeEventListener('pointerlockchange', this._onPointerLockChange);
		window.removeEventListener('blur', this._onBlur);
		document.removeEventListener('visibilitychange', this._onVisibility);

		this._listenersDown = [];
		this._listenersUp = [];
		this._keys = {};
		this._mouseDownListeners = [];
		this._mouseUpListeners = [];
		this._mouseMoveListeners = [];
		this.mouse = { x: 0, y: 0, buttons: {} };
		this._mouseDelta = { x: 0, y: 0 };
		this._mouseFrozen = false;
		this._wheelListeners = [];
		this._wheelDelta = { x: 0, y: 0, z: 0 };
	}
}