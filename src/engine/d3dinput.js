export default class D3DInput {
	constructor() {
		// --- keyboard ---
		this._listenersDown = [];
		this._listenersUp   = [];
		this._keys          = {};

		// --- pointer / mouse state ---
		this.mouseLock     = false;
		this.mouse         = { x: 0, y: 0 };      // game-space coords
		this.mouseClient   = { x: 0, y: 0 };      // client (CSS) coords
		this.mouseButtons  = {};                  // { 0: true, 1: false, ... }
		this._mouseDelta   = { x: 0, y: 0 };      // last frame delta
		this._mouseFrozen  = false;

		// unified flag: true if primary pointer is down (mouse left OR touch)
		this.pointerDown   = false;
		this._lastTouchPos = null;               // for touch delta

		// --- wheel ---
		this._wheelDelta    = { x: 0, y: 0, z: 0 };
		this._wheelListeners = [];

		// --- event listener arrays ---
		this._mouseDownListeners    = [];
		this._mouseUpListeners      = [];
		this._mouseMoveListeners    = [];
		this._pointerLockListeners  = [];

		this._touchStartListeners   = [];
		this._touchEndListeners     = [];
		this._touchMoveListeners    = [];

		// --- bind handlers ---
		this._onKeyDown          = this._onKeyDown.bind(this);
		this._onKeyUp            = this._onKeyUp.bind(this);
		this._onMouseDown        = this._onMouseDown.bind(this);
		this._onMouseUp          = this._onMouseUp.bind(this);
		this._onMouseMove        = this._onMouseMove.bind(this);
		this._onPointerLockChange= this._onPointerLockChange.bind(this);
		this._onPointerLockError = this._onPointerLockError.bind(this);
		this._onWheel            = this._onWheel.bind(this);
		this._onBlur             = this._onBlur.bind(this);
		this._onVisibility       = this._onVisibility.bind(this);

		this._onTouchStart       = this._onTouchStart.bind(this);
		this._onTouchEnd         = this._onTouchEnd.bind(this);
		this._onTouchMove        = this._onTouchMove.bind(this);

		// --- DOM listeners ---
		window.addEventListener('keydown',  this._onKeyDown,  { passive: false });
		window.addEventListener('keyup',    this._onKeyUp);
		window.addEventListener('mousedown',this._onMouseDown);
		window.addEventListener('mouseup',  this._onMouseUp);
		window.addEventListener('mousemove',this._onMouseMove);
		window.addEventListener('wheel',    this._onWheel, { passive: true });

		window.addEventListener('touchstart', this._onTouchStart, { passive: false });
		window.addEventListener('touchend',   this._onTouchEnd,   { passive: false });
		window.addEventListener('touchmove',  this._onTouchMove,  { passive: false });

		document.addEventListener('pointerlockchange', this._onPointerLockChange);
		document.addEventListener('pointerlockerror',  this._onPointerLockError);
		window.addEventListener('blur', this._onBlur);
		document.addEventListener('visibilitychange', this._onVisibility);

		// editor status hook
		if (window._editor) {
			window.addEventListener('focusin', () => {
				D3D.updateEditorStatus({
					inputFocussed: this.getInputFieldInFocus(),
					activeElement: {
						tag:  document.activeElement.tagName,
						type: document.activeElement.type
					}
				});
			});
			window.addEventListener('focusout', () => {
				D3D.updateEditorStatus({
					inputFocussed: this.getInputFieldInFocus(),
					activeElement: null
				});
			});
		}
	}

	/* ---------------------------------------------------------------------
	 * Helpers
	 * ------------------------------------------------------------------ */

	_isEditableTarget(e) {
		const el = e?.target;
		if (!el) return false;
		if (el.isContentEditable)
			return !el.hasAttribute('readonly') && !el.hasAttribute('disabled');

		const tag = (el.tagName || '').toUpperCase();
		if (tag === 'TEXTAREA') return !el.readOnly && !el.disabled;
		if (tag !== 'INPUT')   return false;

		const type = (el.type || 'text').toLowerCase();
		const textTypes = ['text','search','url','tel','password','email','number'];
		return textTypes.includes(type) && !el.readOnly && !el.disabled;
	}

	_updatePointerFromClient(clientX, clientY) {
		const use3D = !!(window._editor && _editor.mode === '3D');
		const canvas = use3D ? _host.renderer3d?.domElement : _host.renderer2d?.domElement;
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const cx = (clientX - rect.left) * (canvas.width  / rect.width);
		const cy = (clientY - rect.top)  * (canvas.height / rect.height);

		if (use3D) {
			const pr = _host.renderer3d?.getPixelRatio?.() || 1;
			this.mouse.x = cx / pr;
			this.mouse.y = cy / pr;
		} else {
			const r2d = _host.renderer2d;
			const pr  = r2d?.pixelRatio || 1;
			const vs  = r2d?.viewScale  || 1;
			const off = r2d?.viewOffset || { x:0, y:0 };

			this.mouse.x = (cx - off.x) / (pr * vs);
			this.mouse.y = (cy - off.y) / (pr * vs);
		}
	}

	/* ---------------------------------------------------------------------
	 * Freeze / unfreeze
	 * ------------------------------------------------------------------ */

	freezeMouse() {
		this._mouseFrozen   = true;
		this.mouseButtons   = {};
		this.pointerDown    = false;
		this._mouseDelta.x  = 0;
		this._mouseDelta.y  = 0;
	}
	unfreezeMouse() { this._mouseFrozen = false; }
	isMouseFrozen() { return this._mouseFrozen; }

	/* ---------------------------------------------------------------------
	 * Keyboard
	 * ------------------------------------------------------------------ */

	_onKeyDown(e) {
		const editing = this._isEditableTarget(e);

		// Let browser handle normal text input
		if (editing && !(e.ctrlKey || e.metaKey)) {
			return;
		}

		this._keys[e.code] = true;
		this._listenersDown.forEach(fn => fn(e));

		// prevent page scroll only outside inputs
		if (!editing && (e.code === 'Space' || e.code.startsWith('Arrow'))) {
			e.preventDefault();
		}
	}

	_onKeyUp(e) {
		const editing = this._isEditableTarget(e);
		if (editing && !(e.ctrlKey || e.metaKey)) {
			return;
		}
		this._keys[e.code] = false;
		this._listenersUp.forEach(fn => fn(e));
	}

	clearKeyState() {
		this._keys         = {};
		this.mouseButtons  = {};
		this.pointerDown   = false;
	}

	_keyNamesToCodes(key) {
		const k = key.toLowerCase();
		if (key.length === 1 && /^[a-z]$/i.test(key)) return ['Key' + key.toUpperCase()];
		if (key.length === 1 && /^[0-9]$/.test(key))  return ['Digit' + key];

		switch (k) {
			case 'shift':      return ['ShiftLeft','ShiftRight'];
			case 'ctrl':
			case 'control':    return ['ControlLeft','ControlRight'];
			case 'alt':        return ['AltLeft','AltRight'];
			case 'meta':       return ['MetaLeft','MetaRight'];
			case 'space':      return ['Space'];
			case 'arrowup':    return ['ArrowUp'];
			case 'arrowdown':  return ['ArrowDown'];
			case 'arrowleft':  return ['ArrowLeft'];
			case 'arrowright': return ['ArrowRight'];
			default:           return [key];
		}
	}

	getKeyDown(key) {
		const codes = this._keyNamesToCodes(key);
		for (const code of codes) {
			if (this._keys[code] === true) return true;
		}
		return false;
	}
	
	injectKey(key, duration = 50) {
		// convert "w" → ["KeyW"], etc.
		const codes = this._keyNamesToCodes(key);
	
		// press
		for (const code of codes) {
			this._keys[code] = true;
		}
	
		// fire your own listeners
		this._listenersDown.forEach(fn => fn({ code: codes[0], injected: true }));
	
		// auto-release
		setTimeout(() => {
			for (const code of codes) {
				this._keys[code] = false;
			}
			this._listenersUp.forEach(fn => fn({ code: codes[0], injected: true }));
		}, duration);
	}

	getControllerAxis(wasd = true, blockOverride = false) {
		let x = 0, y = 0;

		if (this.getInputFieldInFocus()) return { x: 0, y: 0 };

		if (this.getKeyDown('control') || this.getKeyDown('meta'))
			return { x, y };
			
		if(!blockOverride && typeof this.getControllerAxisOverride === 'function')
			return this.getControllerAxisOverride(wasd);

		if (wasd) {
			if (this.getKeyDown('d')) x += 1;
			if (this.getKeyDown('a')) x -= 1;
			if (this.getKeyDown('s')) y += 1;
			if (this.getKeyDown('w')) y -= 1;
		}
		if (this.getKeyDown('arrowright')) x += 1;
		if (this.getKeyDown('arrowleft'))  x -= 1;
		if (this.getKeyDown('arrowdown'))  y += 1;
		if (this.getKeyDown('arrowup'))    y -= 1;

		return { x, y };
	}

	getControllerAxisArrowsOnly() { return this.getControllerAxis(false); }

	/* ---------------------------------------------------------------------
	 * Focus / game area helpers
	 * ------------------------------------------------------------------ */

	getIsGameInFocus3D() {
		return _container3d.contains(document.activeElement);
	}
	
	getIsGameInFocus2D() {
		return _container2d.contains(document.activeElement);
	}
	
	getIsGameInFocus() {
		return this.getIsGameInFocus3D() || this.getIsGameInFocus2D();
	}

	getCursorOverGame() {
		return this.getCursorOverGame3D() || this.getCursorOverGame2D();
	}

	getCursorOverGame3D() {
		if (window._editor) {
			if (this.assetExplorerOpen) return false;
			if (_editor.mode !== '3D')  return false;
		}
		return this.getCursorOverGameBound();
	}

	getCursorOverGame2D() {
		if (window._editor) {
			if (this.assetExplorerOpen) return false;
			if (_editor.mode !== '2D')  return false;
		}
		return this.getCursorOverGameBound();
	}

	getCursorOverGameBound() {
		const pos  = this.getMouseClientPosition();
		const rect = _container3d.getBoundingClientRect();
		return pos.x >= rect.left && pos.x <= rect.right &&
			   pos.y >= rect.top  && pos.y <= rect.bottom;
	}

	getInputFieldInFocus() {
		const el = document.activeElement;
		if (!el) return false;
		return this._isEditableTarget({ target: el });
	}

	/* ---------------------------------------------------------------------
	 * Pointer lock
	 * ------------------------------------------------------------------ */

	isPointerLocked() {
		return document.pointerLockElement === _container3d;
	}

	requestPointerLock() {
		if (!_container3d || typeof _container3d.requestPointerLock !== 'function')
			return;

		if (_container3d.focus) _container3d.focus();

		try {
			_container3d.requestPointerLock({ unadjustedMovement: true });
		} catch (err) {
			console.warn('requestPointerLock error:', err);
		}
	}

	exitPointerLock() {
		if (document.exitPointerLock) document.exitPointerLock();
	}

	_onPointerLockChange(e) {
		const exited = (document.pointerLockElement === null);
		if (exited) this.clearKeyState();
		this._pointerLockListeners.forEach(fn => fn({ ...e, pressedEsc: exited }));
	}

	_onPointerLockError(e) {
		console.warn('pointerlockerror', e);
	}

	_onBlur() {
		this.clearKeyState();
		this.exitPointerLock();
	}

	_onVisibility() {
		if (document.hidden) {
			this.clearKeyState();
			this.exitPointerLock();
		}
	}

	/* ---------------------------------------------------------------------
	 * Mouse
	 * ------------------------------------------------------------------ */

	_onMouseDown(e) {
		if (this._mouseFrozen) return;

		this.mouseButtons[e.button] = true;
		if (e.button === 0) this.pointerDown = true;

		if (this.mouseLock) {
			if (this.getCursorOverGame() && !this.getInputFieldInFocus()) {
				if (!this.isPointerLocked()) {
					this.requestPointerLock();
				}
			}
		}

		this._mouseDownListeners.forEach(fn => fn(e));
	}

	_onMouseUp(e) {
		if (this._mouseFrozen) return;

		this.mouseButtons[e.button] = false;
		if (!this.mouseButtons[0] && !this.mouseButtons[1] && !this.mouseButtons[2]) {
			this.pointerDown = false;
		}

		this._mouseUpListeners.forEach(fn => fn(e));
	}

	_onMouseMove(e) {
		if (this._mouseFrozen) return;

		const clientX = e.clientX;
		const clientY = e.clientY;

		this.mouseClient.x = clientX;
		this.mouseClient.y = clientY;

		this._updatePointerFromClient(clientX, clientY);

		this._mouseDelta.x = e.movementX;
		this._mouseDelta.y = e.movementY;

		this._mouseMoveListeners.forEach(fn => fn(e));
	}

	getMouseButtonDown(button) { return !!this.mouseButtons[button]; }
	getLeftMouseButtonDown()   { return this.getMouseButtonDown(0); }
	getMiddleMouseButtonDown() { return this.getMouseButtonDown(1); }
	getRightMouseButtonDown()  { return this.getMouseButtonDown(2); }

	// Unified pointer state: mouse left OR primary touch
	getPointerDown() {
		return !!this.pointerDown;
	}

	getMousePosition()       { return { x: this.mouse.x,       y: this.mouse.y }; }
	getMouseClientPosition() { return { x: this.mouseClient.x, y: this.mouseClient.y }; }
	
	getMouseDelta(blockOverride = false) { 
		if(!blockOverride && typeof this.getMouseDeltaOverride === 'function')
			return this.getMouseDeltaOverride();
		
		return { ...this._mouseDelta }; 
	}

	/* ---------------------------------------------------------------------
	 * Touch (mobile)
	 * ------------------------------------------------------------------ */

	_onTouchStart(e) {
		if (this._mouseFrozen) return;
		if (!e.changedTouches || e.changedTouches.length === 0) return;
	
		// Any touch = pointer down
		this.pointerDown     = true;
		this.mouseButtons[0] = true;
	
		for (let i = 0; i < e.changedTouches.length; i++) {
			const t = e.changedTouches[i];
			const clientX = t.clientX;
			const clientY = t.clientY;
	
			// Update shared mouse position to THIS touch before dispatch
			this.mouseClient.x = clientX;
			this.mouseClient.y = clientY;
			this._updatePointerFromClient(clientX, clientY);
	
			// Reset delta for this new touch
			this._lastTouchPos = { x: clientX, y: clientY };
			this._mouseDelta.x = 0;
			this._mouseDelta.y = 0;
	
			// Spoof a "single pointer" event so downstream hitTest uses THIS finger
			const evt = {
				...e,
				type: 'touchstart',
				touches: [t],
				changedTouches: [t],
				clientX,
				clientY
			};
	
			this._touchStartListeners.forEach(fn => fn(evt));
		}
	
		if (this.getCursorOverGame()) {
			e.preventDefault();
		}
	}
	
	_onTouchMove(e) {
		if (this._mouseFrozen) return;
		if (!e.changedTouches || e.changedTouches.length === 0) return;
	
		// Still down if any touches left
		this.pointerDown     = e.touches && e.touches.length > 0;
		this.mouseButtons[0] = this.pointerDown;
	
		for (let i = 0; i < e.changedTouches.length; i++) {
			const t = e.changedTouches[i];
			const clientX = t.clientX;
			const clientY = t.clientY;
	
			// Update shared mouse position to THIS touch
			this.mouseClient.x = clientX;
			this.mouseClient.y = clientY;
			this._updatePointerFromClient(clientX, clientY);
	
			// Per-event delta (last touch that moved wins, which is fine for most use)
			if (this._lastTouchPos) {
				this._mouseDelta.x = clientX - this._lastTouchPos.x;
				this._mouseDelta.y = clientY - this._lastTouchPos.y;
			} else {
				this._mouseDelta.x = 0;
				this._mouseDelta.y = 0;
			}
			this._lastTouchPos = { x: clientX, y: clientY };
	
			const evt = {
				...e,
				type: 'touchmove',
				touches: [t],
				changedTouches: [t],
				clientX,
				clientY
			};
	
			this._touchMoveListeners.forEach(fn => fn(evt));
		}
	
		if (this.getCursorOverGame()) {
			e.preventDefault();
		}
	}
	
	_onTouchEnd(e) {
		if (this._mouseFrozen) return;
		if (!e.changedTouches || e.changedTouches.length === 0) return;
	
		// Any touches left? Then still "down"
		this.pointerDown     = e.touches && e.touches.length > 0;
		this.mouseButtons[0] = this.pointerDown;
	
		this._lastTouchPos = null;
		this._mouseDelta.x = 0;
		this._mouseDelta.y = 0;
	
		for (let i = 0; i < e.changedTouches.length; i++) {
			const t = e.changedTouches[i];
			const clientX = t.clientX;
			const clientY = t.clientY;
	
			const evt = {
				...e,
				type: 'touchend',
				touches: [],              // this finger is now up
				changedTouches: [t],
				clientX,
				clientY
			};
	
			this._touchEndListeners.forEach(fn => fn(evt));
		}
	
		if (this.getCursorOverGame()) {
			e.preventDefault();
		}
	}

	/* ---------------------------------------------------------------------
	 * Wheel
	 * ------------------------------------------------------------------ */

	_onWheel(e) {
		if (this._mouseFrozen) return;

		this._wheelDelta.x += e.deltaX;
		this._wheelDelta.y += e.deltaY;
		this._wheelDelta.z += e.deltaZ;

		this._wheelListeners.forEach(fn => fn(e));
	}

	getWheelDelta() { return { ...this._wheelDelta }; }

	/* ---------------------------------------------------------------------
	 * Frame-end
	 * ------------------------------------------------------------------ */

	_afterRenderFrame() {
		this._mouseDelta.x = 0;
		this._mouseDelta.y = 0;
		this._wheelDelta.x = 0;
		this._wheelDelta.y = 0;
		this._wheelDelta.z = 0;
	}

	/* ---------------------------------------------------------------------
	 * Event listener API
	 * ------------------------------------------------------------------ */

	addEventListener(type, handler) {
		switch (type) {
			case 'keydown':          this._listenersDown.push(handler);        break;
			case 'keyup':            this._listenersUp.push(handler);          break;
			case 'mousedown':        this._mouseDownListeners.push(handler);   break;
			case 'mouseup':          this._mouseUpListeners.push(handler);     break;
			case 'mousemove':        this._mouseMoveListeners.push(handler);   break;
			case 'touchstart':       this._touchStartListeners.push(handler);  break;
			case 'touchend':         this._touchEndListeners.push(handler);    break;
			case 'touchmove':        this._touchMoveListeners.push(handler);   break;
			case 'wheel':            this._wheelListeners.push(handler);       break;
			case 'pointerlockchange':this._pointerLockListeners.push(handler); break;
		}
	}

	removeEventListener(type, handler) {
		let arr;
		switch (type) {
			case 'keydown':          arr = this._listenersDown;       break;
			case 'keyup':            arr = this._listenersUp;         break;
			case 'mousedown':        arr = this._mouseDownListeners;  break;
			case 'mouseup':          arr = this._mouseUpListeners;    break;
			case 'mousemove':        arr = this._mouseMoveListeners;  break;
			case 'touchstart':       arr = this._touchStartListeners; break;
			case 'touchend':         arr = this._touchEndListeners;   break;
			case 'touchmove':        arr = this._touchMoveListeners;  break;
			case 'wheel':            arr = this._wheelListeners;      break;
			case 'pointerlockchange':arr = this._pointerLockListeners;break;
			default: return;
		}
		const i = arr.indexOf(handler);
		if (i !== -1) arr.splice(i, 1);
	}

	/* ---------------------------------------------------------------------
	 * Cleanup
	 * ------------------------------------------------------------------ */

	dispose() {
		window.removeEventListener('keydown',  this._onKeyDown);
		window.removeEventListener('keyup',    this._onKeyUp);
		window.removeEventListener('mousedown',this._onMouseDown);
		window.removeEventListener('mouseup',  this._onMouseUp);
		window.removeEventListener('mousemove',this._onMouseMove);
		window.removeEventListener('wheel',    this._onWheel);

		window.removeEventListener('touchstart', this._onTouchStart);
		window.removeEventListener('touchend',   this._onTouchEnd);
		window.removeEventListener('touchmove',  this._onTouchMove);

		document.removeEventListener('pointerlockchange', this._onPointerLockChange);
		document.removeEventListener('pointerlockerror',  this._onPointerLockError);
		window.removeEventListener('blur', this._onBlur);
		document.removeEventListener('visibilitychange', this._onVisibility);

		this._listenersDown       = [];
		this._listenersUp         = [];
		this._mouseDownListeners  = [];
		this._mouseUpListeners    = [];
		this._mouseMoveListeners  = [];
		this._touchStartListeners = [];
		this._touchEndListeners   = [];
		this._touchMoveListeners  = [];
		this._wheelListeners      = [];
		this._pointerLockListeners= [];

		this._keys        = {};
		this.mouse        = { x: 0, y: 0 };
		this.mouseClient  = { x: 0, y: 0 };
		this.mouseButtons = {};
		this._mouseDelta  = { x: 0, y: 0 };
		this.pointerDown  = false;
		this._wheelDelta  = { x: 0, y: 0, z: 0 };
		this._mouseFrozen = false;
	}
}