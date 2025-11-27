/**
 * Event system class
 * 
 * @remarks
 * Events can be set and called globally via _events (as defined in config/global)
 * 
 * @param events  -  Map containing the event names and handlers
 */
export default class D3DEventSystem {
	constructor() {
		this.events = new Map();
		this.singleEvents = new Map();
	}

	/**
	 * Adds an event listener
	 * 
	 * @example
	 * `_events.on("resize", (dimensions) => { console.log(dimensions) })`
	 * 
	 * @param {string} event   Event name
	 * @param {Function} handler  Method to be called
	 */
	on(event, handler) {
		let handlers = this.events.get(event) || [];
		
		handlers.push(handler);
		
		this.events.set(event, handlers);
	}
	
	/**
	 * Adds an event listener (one off)
	 * 
	 * @example
	 * `_events.once("resize", (dimensions) => { console.log(dimensions) })`
	 * 
	 * @param {string} event    Event name
	 * @param {Function} handler  Method to be called
	 */
	once(event, handler) {
		let handlers = this.singleEvents.get(event) || [];
		
		handlers.push(handler);
		
		this.singleEvents.set(event, handlers);
	}
	
	/**
	 * Removes an event listener
	 * 
	 * @param {string} event    Event name
	 * @param {Function} handler  Method to be removed
	 */
	un(event, handler) {
		let handlers = this.events.get(event) || [];
		
		handlers = handlers.filter(item => item !== handler);
		
		this.events.set(event, handlers);
	}
	
	/**
	 * Removes all event listeners for event
	 * 
	 * @param {string} event  Event name
	 */
	unall(event) {
		let handlers = this.events.get(event) || [];
		let handlersSingle = this.singleEvents.get(event) || [];
		
		handlers = [];
		handlersSingle = [];
		
		this.events.set(event, handlers);
		this.singleEvents.set(event, handlersSingle);
	}
	
	/**
	 * Removes a single event listener
	 * 
	 * @param {string} event    Event name
	 * @param {Function} handler  Method to be removed
	 */
	unce(event, handler) {
		let handlers = this.singleEvents.get(event) || [];
		
		handlers = handlers.filter(item => item !== handler);
		
		this.singleEvents.set(event, handlers);
	}
	
	/**
	 * Invokes an event listener
	 *
	 * @remarks
	 * Does nothing if no such event listener is found
	 *
	 * @example
	 * `_events.invoke("resize", {width: window.innerWidth, height: window.innerHeight})`
	 * 
	 * @param {string} event     Event name
	 * @param {...any} params    Parameters passed to handling method
	 */
	invoke(event, ...params) {
		this.events.forEach((handlers, key) => {
			if (key != event) return;
			
			handlers.forEach(handler => {
				handler(...params);
			});
		});
		
		this.singleEvents.forEach((handlers, key) => {
			if (key != event) return;
			
			handlers.forEach(handler => {
				handler(...params);
			});
			
			this.singleEvents.set(event, []);
		});
	}
}