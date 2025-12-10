import D3DConsole from './d3dconsole.js';

export default function D3DWebRTC(signalingUrl) {
	const state = {
		signalingUrl,
		ws: null,
		pc: null,
		dcReliable: null,
		dcUnreliable: null,
		onDisconnect: () => {},
		handlers: {}, // event -> fn
		_disconnected: false
	};

	function markDisconnected(reason) {
		if (state._disconnected) return;
		state._disconnected = true;
		try {
			state.onDisconnect?.(reason);
		} catch (e) {
			D3DConsole.error('[D3DWebRTC] onDisconnect handler error:', e);
		}
	}

	function connect() {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(state.signalingUrl);
			state.ws = ws;
			state._disconnected = false;

			ws.onerror = err => {
				// if we haven't resolved yet, reject connect()
				if (!state._disconnected)
					reject(err);
				// also treat as disconnect
				markDisconnected('ws-error');
				
				D3DConsole.error('Signaling WS error:', err);
			};

			ws.onopen = () => {
				begin(resolve, reject);
			};

			ws.onclose = () => {
				// signaling server went away
				//markDisconnected('ws-close');
			};

			ws.onmessage = async e => {
				let msg;
				try { msg = JSON.parse(e.data); }
				catch { return; }

				if (msg.type === 'answer' && state.pc && msg.answer) {
					try {
						await state.pc.setRemoteDescription(msg.answer);
					} catch (err) {
						D3DConsole.error('setRemoteDescription(answer) failed', err);
					}
				}

				if (msg.type === 'ice-candidate' && state.pc && msg.candidate) {
					try {
						await state.pc.addIceCandidate(msg.candidate);
					} catch (err) {
						D3DConsole.error('addIceCandidate failed', err);
					}
				}
			};
		});
	}

	async function begin(resolve, reject) {
		const pc = new RTCPeerConnection({
			iceServers: []
		});
		state.pc = pc;

		// ---- watch connection state for disconnects ----
		pc.onconnectionstatechange = () => {
			const cs = pc.connectionState;
			//D3DConsole.log('[RTC client] connectionState =', cs);
			// 'disconnected' can be temporary, but for D3D it's usually safe to treat as "gone"
			if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') {
				markDisconnected(`pc-${cs}`);
			}
		};

		// back-compat if you care:
		pc.oniceconnectionstatechange = () => {
			const ics = pc.iceConnectionState;
			//D3DConsole.log('[RTC client] iceConnectionState =', ics);
			if (ics === 'failed' || ics === 'disconnected' || ics === 'closed') {
				markDisconnected(`ice-${ics}`);
			}
		};

		// ---- data channels ----
		const dcReliable = pc.createDataChannel('reliable', {
			ordered: true
		});
		const dcUnreliable = pc.createDataChannel('unreliable', {
			ordered: false,
			maxRetransmits: 0
		});

		state.dcReliable = dcReliable;
		state.dcUnreliable = dcUnreliable;

		// helper to dispatch incoming packets
		function handlePacket(raw, reliable) {
			let pkt;
			try { pkt = JSON.parse(raw); }
			catch { return; }

			const fn = state.handlers[pkt.event];
			if (fn)
				fn(pkt.data, { reliable });
		}

		dcReliable.onopen = () => {
			// resolve exactly once when reliable channel is ready
			resolve(api);
		};

		dcReliable.onclose = () => {
			//D3DConsole.log('[RTC] reliable channel closed');
			markDisconnected('dcReliable-close');
		};

		dcReliable.onmessage = e => handlePacket(e.data, true);

		dcUnreliable.onopen = () => {};

		dcUnreliable.onclose = () => {
			//D3DConsole.log('[RTC] unreliable channel closed');
			markDisconnected('dcUnreliable-close');
		};

		dcUnreliable.onmessage = e => handlePacket(e.data, false);

		// ---- ICE -> signaling ----
		pc.onicecandidate = e => {
			if (e.candidate && state.ws && state.ws.readyState === WebSocket.OPEN) {
				state.ws.send(JSON.stringify({
					type: 'ice-candidate',
					candidate: e.candidate
				}));
			}
		};

		// ---- create + send offer ----
		try {
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);

			state.ws.send(JSON.stringify({
				type: 'offer',
				offer
			}));
		} catch (err) {
			reject(err);
		}
	}

	function sendMessage(event, data, { reliable = true } = {}) {
		const dc = reliable ? state.dcReliable : state.dcUnreliable;
		if (!dc || dc.readyState !== 'open')
			return;

		dc.send(JSON.stringify({ event, data }));
	}

	// reliable by default (chat, commands, etc.)
	function send(event, data) {
		sendMessage(event, data, { reliable: true });
	}

	// default (currently unreliable = false, i.e. unreliable channel)
	function fire(event, data) {
		sendMessage(event, data);
	}

	function close() {
		try { state.dcReliable?.close(); } catch {}
		try { state.dcUnreliable?.close(); } catch {}
		try { state.pc?.close(); } catch {}
		try { state.ws?.close(); } catch {}

		// make sure user gets notified for manual close too
		markDisconnected('manual-close');
	}

	function on(event, fn) {
		state.handlers[event] = fn;
	}

	function off(event) {
		delete state.handlers[event];
	}

	const api = {
		connect,
		send,      // reliable
		fire,      // default (unreliable)
		close,
		on,
		off,
		onDisconnect(fn) { state.onDisconnect = fn; }
	};

	return api;
}