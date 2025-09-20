// AssetExplorerDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import MaterialSphere from './MaterialSphere.jsx';
import { MdClose } from "react-icons/md";

import { 
	fileNameNoExt,
	getExtension
} from '../../../engine/d3dutility.js';
import {
	drawIconForObject,
	drawIconForExt
} from '../utilities/d3dicons.jsx';

const EXT_GROUPS = {
	img: ['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg'],
	audio: ['.mp3','.ogg','.wav','.m4a','.flac'],
	json: ['.json'],
	txt: ['.txt','.md','.csv'],
	model: ['.glb','.gltf'],
	material: ['.mat'],
	html: ['.html'],
	anim: ['.anim'],
	all: []
};

function extOf(name) {
	const m = /\.[a-z0-9]+$/i.exec(name || '');
	return m ? m[0].toLowerCase() : '';
}
function resolveExts(group, customExt) {
	if (group === 'custom') {
		const c = (customExt || '').trim().toLowerCase();
		return c ? [c.startsWith('.') ? c : `.${c}`] : [];
	}
	return EXT_GROUPS[group] || [];
}
function listAssetsFromZip(zip, folder = 'assets/') {
	const out = [];
	if (!zip) return out;
	zip.forEach((rel, file) => {
		if (file.dir) return;
		if (!rel.startsWith(folder)) return;
		if(rel.includes('__Editor')) return;
		const name = rel.slice(folder.length);
		if (!name) return;
		out.push({ path: rel, name, compressedSize: file._dataCompressed?.length ?? 0 });
	});
	return out.sort((a, b) => a.name.localeCompare(b.name));
}
async function previewURLFromZip(zip, path) {
	const f = zip.file(path);
	if (!f) return null;
	const blob = await f.async('blob');
	return URL.createObjectURL(blob);
}

export default function AssetExplorerDialog({
	isOpen,
	onClose,
	onSelect,
	folder = 'assets/',
	allowImport = true,
	zip = window._root?.zip,
	defaultFilter = 'all',
	allowChangeFormat = true,
	selectedAsset = ''
}) {
	const [all, setAll] = useState([]);
	const [query, setQuery] = useState('');
	const [extFilter, setExtFilter] = useState(defaultFilter);
	const [customExt, setCustomExt] = useState('');
	const [active, setActive] = useState();
	const [previewURL, setPreviewURL] = useState(null);
	const listRef = useRef(null);
	const fileInputRef = useRef(null);

	// load/reset when opened
	useEffect(() => {
		_input.assetExplorerOpen = isOpen;
		
		if (!isOpen) return;
		const items = listAssetsFromZip(zip, folder);
		setAll(items);
		setQuery('');
		setExtFilter(defaultFilter);
		setCustomExt('');
	
		// build a full path from selectedAsset (if it isn't already)
		const fullPath = selectedAsset
			? (selectedAsset.startsWith(folder) ? selectedAsset : `${folder}${selectedAsset}`)
			: '';
	
		// try: match by full path, then by name (relative path)
		let initial =
			(fullPath && items.find(i => i.path === fullPath)) ||
			(selectedAsset && items.find(i => i.name === selectedAsset)) ||
			items[0] || null;
	
		setActive(initial);
	
		// scroll once the row actually exists in the DOM
		if (initial) {
			requestAnimationFrame(() => scrollIntoView(initial));
		}
	}, [isOpen, zip, folder, defaultFilter, selectedAsset]);

	// preview
	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!isOpen || !active) {
				if (previewURL) URL.revokeObjectURL(previewURL);
				setPreviewURL(null);
				return;
			}
			if (previewURL) URL.revokeObjectURL(previewURL);
			try {
				const url = await previewURLFromZip(zip, active.path);
				if (!cancelled) setPreviewURL(url);
			} catch {
				if (!cancelled) setPreviewURL(null);
			}
		})();
		return () => { cancelled = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, isOpen]);

	// ---- ENFORCED FILTER LOGIC ----
	// If allowChangeFormat is false, we always use defaultFilter (ignore UI).
	const effectiveFilter = allowChangeFormat ? extFilter : defaultFilter;
	const effectiveCustomExt = allowChangeFormat ? customExt : '';
	const allowedExts = resolveExts(effectiveFilter, effectiveCustomExt);

	// Visible list (search + enforced filter)
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return all.filter(it => {
			if (q && !it.name.toLowerCase().includes(q)) return false;
			if (effectiveFilter === 'all') return true;
			return allowedExts.includes(extOf(it.name));
		});
	}, [all, query, effectiveFilter, allowedExts]);

	function handleKeyDown(e) {
		if (!isOpen) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose?.();
		}
		if (!filtered.length) return;
		const idx = Math.max(0, filtered.findIndex(f => f.path === active?.path));
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			const next = filtered[Math.min(idx + 1, filtered.length - 1)];
			setActive(next);
			scrollIntoView(next);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			const prev = filtered[Math.max(idx - 1, 0)];
			setActive(prev);
			scrollIntoView(prev);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (active) tryCommitSelect(active.name);
		}
	}

	function scrollIntoView(item) {
		const container = listRef.current;
		if (!container) return;
		const child = container.querySelector(`[data-path="${item.path}"]`);
		if (child) child.scrollIntoView({ block: 'nearest' });
	}

	function tryCommitSelect(name) {
		// If format change is disallowed, block wrong extensions
		if (effectiveFilter !== 'all' && !allowedExts.includes(extOf(name))) {
			const msg = `This field only accepts: ${allowedExts.join(', ')}`;
			window._editor?.showError?.(msg) ?? alert(msg);
			return;
		}
		onSelect?.(name);
		onClose?.();
	}

	async function handleImport(ev) {
		const file = ev.target.files?.[0];
		ev.target.value = ''; // allow re-choosing same file
		if (!file) return;

		// Enforce allowed types on import too
		if (effectiveFilter !== 'all' && !allowedExts.includes(extOf(file.name))) {
			const msg = `Only ${allowedExts.join(', ')} can be imported here.`;
			window._editor?.showError?.(msg) ?? alert(msg);
			return;
		}

		const buf = await file.arrayBuffer();
		const targetPath = `${folder}${file.name}`;
		zip.file(targetPath, buf);

		const items = listAssetsFromZip(zip, folder);
		setAll(items);
		const added = items.find(i => i.path === targetPath);
		if (added) {
			setActive(added);
			scrollIntoView(added);
		}
	}

	if (!isOpen) return null;

	const activeAllowed =
		!active ? false :
		effectiveFilter === 'all' ? true :
		allowedExts.includes(extOf(active.name));

	return (
		<div className="asset-dialog" onKeyDown={handleKeyDown} role="dialog" aria-modal="true">
			<div className="asset-dialog__window">
				<div className="asset-dialog__header">
					<div className="asset-dialog__title">Select Asset</div>
					<button className="asset-dialog__close" onClick={onClose} aria-label="Close">
						<MdClose />
					</button>
				</div>

				<div className="asset-dialog__toolbar">
					<input
						className="tf"
						placeholder="Search assets…"
						value={query}
						onChange={e => setQuery(e.target.value)}
					/>
					<select
						className="tf"
						value={extFilter}
						onChange={e => setExtFilter(e.target.value)}
						disabled={!allowChangeFormat} /* locked when enforcing */
					>
						<option value="all">All</option>
						<option value="model">3D Models</option>
						<option value="material">Materials</option>
						<option value="anim">Animation Clips</option>
						<option value="img">Images</option>
						<option value="audio">Audio</option>
						<option value="html">HTML</option>
						<option value="json">JSON</option>
						<option value="txt">Text / CSV / MD</option>
						<option value="custom">Custom ext…</option>
					</select>
					{extFilter === 'custom' && allowChangeFormat && (
						<input
							className="tf"
							placeholder=".ext"
							value={customExt}
							onChange={e => setCustomExt(e.target.value)}
							style={{ width: 90 }}
						/>
					)}
					{allowImport && (
						<>
							<input
								ref={fileInputRef}
								type="file"
								style={{ display: 'none' }}
								onChange={handleImport}
								accept={
									effectiveFilter !== 'all' && allowedExts.length
										? allowedExts.join(',')
										: undefined
								}
							/>
							<button
								className="btn"
								type="button"
								onClick={() => fileInputRef.current?.click()}
							>
								Import…
							</button>
						</>
					)}
				</div>

				<div className="asset-dialog__body">
					<div className="asset-dialog__list" ref={listRef}>
						{filtered.map(it => {
							const isActive = it.path === active?.path;
							const ext = getExtension(it.path);
							return (
								<div
									key={it.path}
									data-path={it.path}
									className={`asset-row${isActive ? ' is-active' : ''}`}
									onClick={() => setActive(it)}
									onDoubleClick={() => tryCommitSelect(it.name)}
									title={it.path.slice(folder.length)}
								>
									<div className="asset-row__name">
									  <span className="asset-row__path">
										{it.name
										  .split('/')
										  .slice(0, -1)
										  .map(n => fileNameNoExt(n))
										  .join('/') + '/'}
									  </span>
									<span className="asset-row__file">
										<div className='ib vm mrvs'>
											{drawIconForExt(ext)}
										</div>
										<div className='ib vm'>
											{fileNameNoExt(it.name.split('/').pop())}
										</div>
									</span>
								</div>
								</div>
							);
						})}
						{!filtered.length && <div className="asset-empty">No assets</div>}
					</div>

					<div className="asset-dialog__preview">
						{active ? (
							<PreviewPane name={active.name} url={previewURL} />
						) : (
							<div className="asset-preview__placeholder">Select an asset</div>
						)}
					</div>
				</div>

				<div className="asset-dialog__footer">
					<button className="btn btn--ghost" onClick={onClose}>Cancel</button>
					<button
						className="btn"
						disabled={!active || !activeAllowed}
						onClick={() => { if (active) tryCommitSelect(active.name); }}
						title={!activeAllowed ? `Allowed: ${allowedExts.join(', ')}` : undefined}
					>
						Select
					</button>
				</div>
			</div>
		</div>
	);
}

/* --- preview --- */
function PreviewPane({ name, url }) {
	const lower = (name || '').toLowerCase();
	const isImg = /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower) && url;
	const isText = /\.(txt|md|csv|json)$/.test(lower) && url;
	const isAudio = /\.(mp3|ogg|wav|m4a|flac)$/.test(lower) && url;
	const isMat = /\.mat$/.test(lower) && url;
	
	if (isMat) 
		return <MaterialSphere url={url} />;
	if (isImg) 
		return <img className="asset-preview__image" src={url} alt={name} />;
	if (isAudio) 
		return <audio className="asset-preview__audio" src={url} controls />;
	if (isText) 
		return <iframe className="asset-preview__text" src={url} title={name} />;
	
	return <div className="asset-preview__placeholder">No preview</div>;
}