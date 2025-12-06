// d3dwebrtc.js
export default function D3DWebRTC(signalingUrl) {
	const state = {
		signalingUrl,
		ws: null,
		pc: null,
		dcReliable: null,
		dcUnreliable: null,
		onDisconnect: () => {},
		handlers: {} // event -> fn
	};

	function connect() {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(state.signalingUrl);
			state.ws = ws;

			ws.onerror = err => {
				reject(err);
			};

			ws.onopen = () => {
				begin(resolve, reject);
			};

			ws.onmessage = async e => {
				let msg;
				try { msg = JSON.parse(e.data); }
				catch { return; }

				if (msg.type === 'answer' && state.pc && msg.answer) {
					try {
						await state.pc.setRemoteDescription(msg.answer);
					} catch (err) {
						console.error('setRemoteDescription(answer) failed', err);
					}
				}

				if (msg.type === 'ice-candidate' && state.pc && msg.candidate) {
					try {
						await state.pc.addIceCandidate(msg.candidate);
					} catch (err) {
						console.error('addIceCandidate failed', err);
					}
				}
			};
		});
	}

	async function begin(resolve, reject) {
		const pc = new RTCPeerConnection({
			iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
		});
		state.pc = pc;

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
		dcReliable.onclose = () => state.onDisconnect?.();
		dcReliable.onmessage = e => handlePacket(e.data, true);

		dcUnreliable.onopen = () => {};
		dcUnreliable.onclose = () => state.onDisconnect?.();
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
		onDisconnect(fn) { state.onDisconnect = fn || (() => {}); }
	};

	return api;
}