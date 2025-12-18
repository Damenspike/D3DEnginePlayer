// ScriptFindReplaceDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MdClose } from "react-icons/md";
import {
	limitString
} from '../../../engine/d3dutility.js';

/* ========================= FIND UTILS ========================= */

function escapeRegExp(str) {
	return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegex(find, {
	regex = false,
	caseSensitive = false,
	wholeWord = false
} = {}) {
	if (!find) return null;

	let src = regex ? find : escapeRegExp(find);
	if (wholeWord) src = `\\b${src}\\b`;

	try {
		return new RegExp(src, caseSensitive ? 'g' : 'gi');
	} catch {
		return null;
	}
}

function countMatches(text, re) {
	if (!text || !re) return 0;
	re.lastIndex = 0;
	let c = 0;
	while (re.exec(text)) c++;
	return c;
}

function firstMatchInfo(text, re) {
	if (!text || !re) return null;
	re.lastIndex = 0;
	const m = re.exec(text);
	if (!m) return null;

	const idx = m.index ?? 0;
	const len = (m[0] || '').length;

	const start = Math.max(0, idx - 60);
	const end = Math.min(text.length, idx + len + 60);

	const pre = (start > 0 ? '…' : '') + text.slice(start, idx);
	const hit = text.slice(idx, idx + len);
	const post = text.slice(idx + len, end) + (end < text.length ? '…' : '');

	return { idx, len, pre, hit, post };
}

function replaceAll(text, re, replacement) {
	if (!text || !re) return { out: text, count: 0 };
	re.lastIndex = 0;

	let count = 0;
	const out = text.replace(re, () => {
		count++;
		return replacement;
	});

	return { out, count };
}

function collectObjects(root) {
	const out = [];
	if (!root?.traverse) return out;

	root.traverse(o => {
		if (!o) return;
		if(o.editorOnly || o.noSelect) return;
		out.push(o);
	});

	return out;
}

function snapshotScripts(results) {
	const out = [];
	for (let i = 0; i < results.length; i++) {
		const o = results[i]?.obj;
		if (!o) continue;
		out.push({ obj: o, script: typeof o.__script === 'string' ? o.__script : '' });
	}
	return out;
}

function applySnapshot(snapshot) {
	for (let i = 0; i < snapshot.length; i++) {
		const s = snapshot[i];
		s.obj.__script = s.script;
	}
	_editor.updateInspector();
}

/* ========================= DIALOG ========================= */

export default function ScriptFindReplaceDialog({
	isOpen,
	onClose,
	root = window._root,
	title = 'Find in scripts',
	allowReplace = true
}) {
	const [find, setFind] = useState('');
	const [replace, setReplace] = useState('');
	const [regex, setRegex] = useState(false);
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [wholeWord, setWholeWord] = useState(false);

	const [objects, setObjects] = useState([]);
	const [results, setResults] = useState([]);
	const [activeId, setActiveId] = useState(null);

	const listRef = useRef(null);

	// open/reset
	useEffect(() => {
		_input.findReplaceOpen = isOpen;
		if (!isOpen) return;

		setFind('');
		setReplace('');
		setRegex(false);
		setCaseSensitive(false);
		setWholeWord(false);

		const all = collectObjects(root);
		setObjects(all);
		setResults([]);
		setActiveId(null);
	}, [isOpen, root]);

	const re = useMemo(
		() => buildRegex(find, { regex, caseSensitive, wholeWord }),
		[find, regex, caseSensitive, wholeWord]
	);

	const regexValid = !!re || !find.trim();

	const filtered = useMemo(() => {
		const f = (find || '').trim();
		if (!f || !re) return [];
		const out = [];

		for (let i = 0; i < objects.length; i++) {
			const o = objects[i];
			const txt = typeof o.__script === 'string' ? o.__script : '';
			if (!txt) continue;

			const matchCount = countMatches(txt, re);
			if (matchCount < 1) continue;

			const info = firstMatchInfo(txt, re);
			out.push({
				id: o.uuid || o.id || o.name || String(i),
				obj: o,
				name: o.name || '(unnamed)',
				count: matchCount,
				snippet: info
			});
		}

		return out;
	}, [objects, re, find]);

	// keep results in state so arrow nav doesn’t jump when typing
	useEffect(() => {
		_input.scriptFindOpen = isOpen;
		if (!isOpen) return;

		setResults(filtered);

		const nextActive =
			(activeId && filtered.find(r => r.id === activeId)?.id) ||
			filtered[0]?.id ||
			null;

		setActiveId(nextActive);

		if (nextActive) requestAnimationFrame(() => scrollIntoView(nextActive));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filtered, isOpen]);

	const active = useMemo(() => results.find(r => r.id === activeId), [results, activeId]);

	function scrollIntoView(id) {
		const container = listRef.current;
		if (!container) return;
		const child = container.querySelector(`[data-id="${CSS.escape(id)}"]`);
		if (child) child.scrollIntoView({ block: 'nearest' });
	}

	function focusObject(obj) {
		_editor.openCode(obj);
	}

	function handleKeyDown(e) {
		if (!isOpen) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			onClose?.();
			return;
		}

		if (!results.length) return;

		const idx = Math.max(0, results.findIndex(r => r.id === activeId));

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			const next = results[Math.min(idx + 1, results.length - 1)];
			setActiveId(next.id);
			scrollIntoView(next.id);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			const prev = results[Math.max(idx - 1, 0)];
			setActiveId(prev.id);
			scrollIntoView(prev.id);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (active?.obj) focusObject(active.obj);
		}
	}

	function doReplaceAll() {
		if (!allowReplace) return;
		const f = (find || '').trim();
		if (!f) return;
		if (!re) return;
		if (!results.length) return;
	
		const before = snapshotScripts(results);
	
		let total = 0;
	
		for (let i = 0; i < results.length; i++) {
			const r = results[i];
			const o = r.obj;
			const txt = typeof o.__script === 'string' ? o.__script : '';
			if (!txt) continue;
	
			const { out, count } = replaceAll(txt, re, replace);
			if (count > 0) {
				o.__script = out;
				total += count;
			}
		}
	
		const after = snapshotScripts(results);
	
		if (total > 0) {
			/*_editor.addStep({
				name: `Replace in scripts (${total})`,
				undo: () => applySnapshot(before),
				redo: () => applySnapshot(after)
			});*/
		}
	
		_editor.updateInspector();
		_editor.showError({
			title: 'Replace',
			message: `Replaced ${total} occurrence${total === 1 ? '' : 's'}.`
		})
		
		const all = collectObjects(root);
		setObjects(all);
	}

	if (!isOpen) return null;

	return (
		<div className="asset-dialog script-dialog" onKeyDown={handleKeyDown} role="dialog" aria-modal="true">
			<div className="asset-dialog__window">
				<div className="asset-dialog__header">
					<div className="asset-dialog__title">{title}</div>
					<button className="asset-dialog__close" onClick={onClose} aria-label="Close">
						<MdClose />
					</button>
				</div>

				<div className="asset-dialog__toolbar">
					<input
						className="tf"
						placeholder="Find…"
						value={find}
						onChange={e => setFind(e.target.value)}
					/>

					{allowReplace && (
						<input
							className="tf"
							placeholder="Replace…"
							value={replace}
							onChange={e => setReplace(e.target.value)}
						/>
					)}

					<div className="ib vm ml options">
						<label className="ib vm mr">
							<input
								type="checkbox"
								className="mr"
								checked={regex}
								onChange={e => setRegex(e.target.checked)}
							/> Regex
						</label>

						<label className="ib vm mr">
							<input
								type="checkbox"
								className="mr"
								checked={caseSensitive}
								onChange={e => setCaseSensitive(e.target.checked)}
							/> Case
						</label>

						<label className="ib vm">
							<input
								type="checkbox"
								className="mr"
								checked={wholeWord}
								onChange={e => setWholeWord(e.target.checked)}
							/> Word
						</label>
					</div>

					<div className="ib vm ml options">
						<div className={`small ${regexValid ? 'gray' : 'red'}`}>
							{!regexValid ? 'Invalid regex' : `${results.length} object${results.length === 1 ? '' : 's'}`}
						</div>
					</div>
				</div>

				<div className="asset-dialog__body">
					<div className="asset-dialog__list" ref={listRef}>
						{results.map(r => {
							const isActive = r.id === activeId;
							return (
								<div
									key={r.id}
									data-id={r.id}
									className={`asset-row${isActive ? ' is-active' : ''}`}
									onClick={() => setActiveId(r.id)}
									onDoubleClick={() => focusObject(r.obj)}
									title={r.name}
								>
									<div className="asset-row__name">
										<div className="asset-row__file object-result-row">
											<div className="ib vm">
												<b>{r.name}</b>
											</div>
											<div className="ib vm ml small gray">
												({r.count})
											</div>
										</div>

										{r.snippet && (
											<div className="small gray mtvs">
												{r.snippet.pre}
												<span className="script-hit">{r.snippet.hit}</span>
												{r.snippet.post}
											</div>
										)}
									</div>
								</div>
							);
						})}

						{!!find.trim() && regexValid && results.length < 1 && (
							<div className="asset-empty mt mb ml gray small">No matches</div>
						)}
						{!find.trim() && (
							<div className="asset-empty mt mb ml gray small">Type something to search in scripts</div>
						)}
						{!!find.trim() && !regexValid && (
							<div className="asset-empty mt mb ml red small">Regex is invalid</div>
						)}
					</div>

					<div className="asset-dialog__preview">
						{active ? (
							<ScriptPreview
								active={active}
								find={find}
								re={re}
								regexValid={regexValid}
							/>
						) : (
							<div className="asset-preview__placeholder">No result selected</div>
						)}
					</div>
				</div>

				<div className="asset-dialog__footer">
					<button className="btn btn--ghost" onClick={onClose}>Close</button>

					<button
						className="btn"
						disabled={!active?.obj}
						onClick={() => active?.obj && focusObject(active.obj)}
					>
						Open Code
					</button>

					{allowReplace && (
						<button
							className="btn"
							disabled={!find.trim() || !regexValid || results.length < 1}
							onClick={doReplaceAll}
							title={!regexValid ? 'Invalid regex' : undefined}
						>
							Replace All
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

/* ========================= PREVIEW (REAL HIGHLIGHT + NAV) ========================= */

function escapeHtml(str) {
	return (str || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function globalRegex(re) {
	if (!re) return null;
	let flags = re.flags || '';
	if (!flags.includes('g')) flags += 'g';
	// keep i/s/u etc as-is
	return new RegExp(re.source, flags);
}

function buildHighlightParts(text, re) {
	if (!text || !re) return { parts: [escapeHtml(text)], matches: [] };

	const rg = globalRegex(re);
	rg.lastIndex = 0;

	const matches = [];
	let m;
	while ((m = rg.exec(text))) {
		const idx = m.index ?? 0;
		const hit = m[0] ?? '';
		matches.push({ idx, len: hit.length, hit });
		if (hit.length === 0) {
			// prevent infinite loops on empty matches
			rg.lastIndex = idx + 1;
		}
	}

	if (!matches.length) return { parts: [escapeHtml(text)], matches: [] };

	const parts = [];
	let cursor = 0;

	for (let i = 0; i < matches.length; i++) {
		const a = matches[i];
		const start = a.idx;
		const end = a.idx + a.len;

		if (start > cursor) parts.push({ t: 'txt', v: text.slice(cursor, start) });
		parts.push({ t: 'hit', v: text.slice(start, end), i });
		cursor = end;
	}

	if (cursor < text.length) parts.push({ t: 'txt', v: text.slice(cursor) });

	return { parts, matches };
}

function ScriptPreview({ active, find, re, regexValid }) {
	const obj = active?.obj;
	const txt = typeof obj?.__script === 'string' ? obj.__script : '';

	const scrollerRef = useRef(null);
	const hitRefs = useRef([]);
	const [hitIndex, setHitIndex] = useState(0);

	const { parts, matches } = useMemo(() => {
		if (!find.trim() || !regexValid || !re) return { parts: [{ t: 'txt', v: txt }], matches: [] };
		return buildHighlightParts(txt, re);
	}, [txt, find, regexValid, re]);

	// reset index when object/find changes
	useEffect(() => {
		setHitIndex(0);
	}, [active?.id, find, regexValid, re]);

	// keep refs array aligned
	useEffect(() => {
		hitRefs.current = new Array(matches.length);
	}, [matches.length]);

	function scrollTo(i) {
		if (!matches.length) return;
		const idx = ((i % matches.length) + matches.length) % matches.length;
		setHitIndex(idx);

		requestAnimationFrame(() => {
			const el = hitRefs.current[idx];
			if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
		});
	}

	// auto scroll to first match when matches appear
	useEffect(() => {
		if (!matches.length) return;
		scrollTo(0);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [matches.length, active?.id]);

	function next() {
		if (!matches.length) return;
		scrollTo(hitIndex + 1);
	}

	function prev() {
		if (!matches.length) return;
		scrollTo(hitIndex - 1);
	}

	return (
		<div className="script-preview">
			<div className="script-preview__header">
				<div className="ib vm">
					<div className="small gray minititle mb">Object</div>
					<div className="small">{limitString(active.name, 30)}</div>
				</div>

				<div className="ib vm ml">
					<div className="small gray minititle mb">Matches</div>
					<div className="small">{active.count}</div>
				</div>

				<div className="ib vm ml script-preview__nav">
					<button className="btn btn--ghost btn--sm" disabled={!matches.length} onClick={prev}>Prev</button>
					<button className="btn btn--ghost btn--sm ml" disabled={!matches.length} onClick={next}>Next</button>

					<div className="ib vm ml small gray">
						{matches.length ? `${hitIndex + 1}/${matches.length}` : '0/0'}
					</div>
				</div>
			</div>

			<div className="script-preview__scroller" ref={scrollerRef}>
				<pre className="script-preview__code">
					{parts.map((p, k) => {
						if (p.t === 'hit') {
							const isCur = p.i === hitIndex;
							return (
								<span
									key={k}
									ref={el => { hitRefs.current[p.i] = el; }}
									className={`script-preview__hit${isCur ? ' is-current' : ''}`}
								>
									{p.v}
								</span>
							);
						}
						return <span key={k}>{p.v}</span>;
					})}
				</pre>
			</div>
		</div>
	);
}