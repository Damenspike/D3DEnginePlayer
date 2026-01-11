import D3DConsole from './d3dconsole.js';

export default function D3DWebRTC(signalingUrl) {
	const state = {
		signalingUrl,
		ws: null,
		pc: null,
		dcReliable: null,
		dcUnreliable: null,
		onDisconnect: () => {},
		handlers: {},
		_disconnected: true,
		_token: 0
	};

	function teardown(token) {
		if (token !== state._token) return;

		const ws = state.ws;
		const pc = state.pc;
		const dcr = state.dcReliable;
		const dcu = state.dcUnreliable;

		state.ws = null;
		state.pc = null;
		state.dcReliable = null;
		state.dcUnreliable = null;

		try { dcr && (dcr.onopen = dcr.onclose = dcr.onmessage = null); } catch {}
		try { dcu && (dcu.onopen = dcu.onclose = dcu.onmessage = null); } catch {}
		try { pc && (pc.onicecandidate = pc.onconnectionstatechange = pc.oniceconnectionstatechange = null); } catch {}
		try { ws && (ws.onopen = ws.onerror = ws.onclose = ws.onmessage = null); } catch {}

		try { dcr?.close(); } catch {}
		try { dcu?.close(); } catch {}
		try { pc?.close(); } catch {}
		try { ws?.close(); } catch {}
	}

	function markDisconnected(reason, token) {
		if (token !== state._token) return;
		if (state._disconnected) return;

		state._disconnected = true;

		teardown(token);

		try {
			state.onDisconnect?.(reason);
		} catch (e) {
			D3DConsole.error('[D3DWebRTC] onDisconnect handler error:', e);
		}
	}

	function connect() {
		// kill any existing session hard, then start a brand new one
		state._token++;
		const token = state._token;

		state._disconnected = false;
		teardown(token); // teardown uses token check; but we just set token, so it will run

		return new Promise((resolve, reject) => {
			const ws = new WebSocket(state.signalingUrl);
			state.ws = ws;

			let settled = false;
			const doneResolve = () => {
				if (settled || token !== state._token) return;
				settled = true;
				resolve(api);
			};
			const doneReject = (err) => {
				if (settled || token !== state._token) return;
				settled = true;
				reject(err);
			};

			ws.onerror = (err) => {
				D3DConsole.error('Signaling WS error:', err);
				doneReject(err);
				markDisconnected('ws-error', token);
			};

			ws.onclose = () => {
				// if we never got connected, make connect() fail
				doneReject(new Error('Signaling WS closed'));
				markDisconnected('ws-close', token);
			};

			ws.onopen = () => {
				begin(token, doneResolve, doneReject);
			};

			ws.onmessage = async (e) => {
				if (token !== state._token) return;

				let msg;
				try { msg = JSON.parse(e.data); }
				catch { return; }

				const pc = state.pc;
				if (!pc) return;

				if (msg.type === 'answer' && msg.answer) {
					try {
						await pc.setRemoteDescription(msg.answer);
					} catch (err) {
						D3DConsole.error('setRemoteDescription(answer) failed', err);
						markDisconnected('srd-answer-fail', token);
					}
					return;
				}

				if (msg.type === 'ice-candidate' && msg.candidate) {
					try {
						await pc.addIceCandidate(msg.candidate);
					} catch (err) {
						D3DConsole.error('addIceCandidate failed', err);
						// don’t insta-kill on a single candidate failure, but it can indicate bad state
					}
					return;
				}
			};
		});
	}

	async function begin(token, resolve, reject) {
		if (token !== state._token) return;

		const pc = new RTCPeerConnection({ iceServers: [] });
		state.pc = pc;

		pc.onconnectionstatechange = () => {
			if (token !== state._token) return;
			const cs = pc.connectionState;
			if (cs === 'failed' || cs === 'closed') markDisconnected(`pc-${cs}`, token);

			// IMPORTANT: don’t treat "disconnected" as fatal immediately.
			// It often happens transiently during reconnect / wifi blips.
			// If you want it fatal, do it with a short timeout.
			if (cs === 'disconnected') {
				const t = token;
				setTimeout(() => {
					if (t !== state._token) return;
					if (!state.pc) return;
					if (state.pc.connectionState === 'disconnected')
						markDisconnected('pc-disconnected', t);
				}, 1500);
			}
		};

		pc.oniceconnectionstatechange = () => {
			if (token !== state._token) return;
			const ics = pc.iceConnectionState;
			if (ics === 'failed' || ics === 'closed') markDisconnected(`ice-${ics}`, token);

			if (ics === 'disconnected') {
				const t = token;
				setTimeout(() => {
					if (t !== state._token) return;
					if (!state.pc) return;
					if (state.pc.iceConnectionState === 'disconnected')
						markDisconnected('ice-disconnected', t);
				}, 1500);
			}
		};

		const dcReliable = pc.createDataChannel('reliable', { ordered: true });
		const dcUnreliable = pc.createDataChannel('unreliable', { ordered: false, maxRetransmits: 0 });

		state.dcReliable = dcReliable;
		state.dcUnreliable = dcUnreliable;

		const handlePacket = (raw, reliable) => {
			let pkt;
			try { pkt = JSON.parse(raw); }
			catch { return; }
			const fn = state.handlers[pkt.event];
			if (fn) fn(pkt.data, { reliable });
		};

		dcReliable.onopen = () => {
			if (token !== state._token) return;
			resolve();
		};

		dcReliable.onclose = () => {
			if (token !== state._token) return;
			markDisconnected('dcReliable-close', token);
		};

		dcReliable.onmessage = (e) => {
			if (token !== state._token) return;
			handlePacket(e.data, true);
		};

		dcUnreliable.onclose = () => {
			if (token !== state._token) return;
			markDisconnected('dcUnreliable-close', token);
		};

		dcUnreliable.onmessage = (e) => {
			if (token !== state._token) return;
			handlePacket(e.data, false);
		};

		pc.onicecandidate = (e) => {
			if (token !== state._token) return;
			if (!e.candidate) return;

			const ws = state.ws;
			if (!ws || ws.readyState !== WebSocket.OPEN) return;

			ws.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate }));
		};

		try {
			const offer = await pc.createOffer();
			if (token !== state._token) return;

			await pc.setLocalDescription(offer);
			if (token !== state._token) return;

			const ws = state.ws;
			if (!ws || ws.readyState !== WebSocket.OPEN) {
				reject(new Error('Signaling WS not open'));
				markDisconnected('ws-not-open', token);
				return;
			}

			ws.send(JSON.stringify({ type: 'offer', offer }));
		} catch (err) {
			reject(err);
			markDisconnected('begin-fail', token);
		}
	}

	function sendMessage(event, data, { reliable = true } = {}) {
		const dc = reliable ? state.dcReliable : state.dcUnreliable;
		if (!dc || dc.readyState !== 'open') return;
		dc.send(JSON.stringify({ event, data }));
	}

	function send(event, data) {
		sendMessage(event, data, { reliable: true });
	}

	function fire(event, data) {
		sendMessage(event, data, { reliable: false });
	}

	function close() {
		state._token++;
		const token = state._token;
		state._disconnected = true;
		teardown(token);
		try { state.onDisconnect?.('manual-close'); } catch {}
	}

	function on(event, fn) {
		state.handlers[event] = fn;
	}

	function off(event) {
		delete state.handlers[event];
	}

	const api = {
		connect,
		send,
		fire,
		close,
		on,
		off,
		onDisconnect(fn) { state.onDisconnect = fn; }
	};

	return api;
}