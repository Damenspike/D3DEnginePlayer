// MaterialEditor.jsx
import React, { useEffect, useRef, useState } from 'react';
import { fileName } from '../../../engine/d3dutility.js';
import { MdFolderOpen, MdDelete } from 'react-icons/md';

const DEFAULTS = {
	type: 'MeshStandardMaterial',
	color: 0xffffff,
	metalness: 0.2,
	roughness: 0.6,
	emissive: 0x000000,
	emissiveIntensity: 0,
	opacity: 1,
	transparent: false,
	wireframe: false,
	side: 'FrontSide',
	map: '',
	mapOffset: [0, 0],
	mapRepeat: [1, 1],
	normalMap: '',
	normalMapOffset: [0, 0],
	normalMapRepeat: [1, 1],
	roughnessMap: '',
	metalnessMap: '',
	emissiveMap: '',
	alphaMap: '',
	envMapIntensity: 1
};

const autoBlur = (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();
		e.currentTarget.blur();
	}
};

let timer;

function numToInput(n) {
	const v = Math.max(0, Math.min(0xffffff, Number(n) || 0));
	return `#${v.toString(16).padStart(6, '0')}`;
}
function inputToNum(s) {
	const hex = (s || '#ffffff').replace('#', '').slice(0, 6);
	const v = parseInt(hex || 'ffffff', 16);
	return Number.isFinite(v) ? v : 0xffffff;
}
function normalizeColor(c) {
	if (typeof c === 'number') return Math.max(0, Math.min(0xffffff, c));
	if (typeof c === 'string') {
		if (c.startsWith('#')) return inputToNum(c);
		if (c.startsWith('0x') || c.startsWith('0X')) return parseInt(c.slice(2), 16) >>> 0;
		const n = Number(c);
		if (Number.isFinite(n)) return Math.max(0, Math.min(0xffffff, n));
	}
	return DEFAULTS.color;
}
function ensureDefaults(val) {
	const v = { ...(val || {}) };
	v.type = v.type || DEFAULTS.type;
	v.color = normalizeColor(v.color ?? DEFAULTS.color);
	v.emissive = normalizeColor(v.emissive ?? DEFAULTS.emissive);
	v.metalness = Number.isFinite(+v.metalness) ? +v.metalness : DEFAULTS.metalness;
	v.roughness = Number.isFinite(+v.roughness) ? +v.roughness : DEFAULTS.roughness;
	v.emissiveIntensity = Number.isFinite(+v.emissiveIntensity) ? +v.emissiveIntensity : DEFAULTS.emissiveIntensity;
	v.opacity = Number.isFinite(+v.opacity) ? +v.opacity : DEFAULTS.opacity;
	v.transparent = !!v.transparent;
	v.wireframe = !!v.wireframe;
	v.side = v.side || DEFAULTS.side;
	v.map = v.map || '';
	v.normalMap = v.normalMap || '';
	v.roughnessMap = v.roughnessMap || '';
	v.metalnessMap = v.metalnessMap || '';
	v.emissiveMap = v.emissiveMap || '';
	v.alphaMap = v.alphaMap || '';
	v.envMapIntensity = Number.isFinite(+v.envMapIntensity) ? +v.envMapIntensity : DEFAULTS.envMapIntensity;
	v.mapOffset = Array.isArray(v.mapOffset) ? v.mapOffset : [0, 0];
	v.mapRepeat = Array.isArray(v.mapRepeat) ? v.mapRepeat : [1, 1];
	v.normalMapOffset = Array.isArray(v.normalMapOffset) ? v.normalMapOffset : [0, 0];
	v.normalMapRepeat = Array.isArray(v.normalMapRepeat) ? v.normalMapRepeat : [1, 1];
	return v;
}
function clamp01(v) {
	v = Number(v) || 0;
	if (v < 0) return 0;
	if (v > 1) return 1;
	return v;
}

export default function MaterialEditor({ uri, date, onSave, openAsset }) {
	const [mat, setMat] = useState(ensureDefaults(null));
	const [error, setError] = useState('');
	const [showAdvanced, setShowAdvanced] = useState(false);
	const prevRef = useRef(JSON.stringify(ensureDefaults(null)));

	// load material on uri change
	useEffect(() => {
		let cancelled = false;
		(async () => {
			setError('');
			try {
				const text = await _editor.readFile(uri);
				let parsed = {};
				try { parsed = JSON.parse(text || '{}'); } catch {}
				const withDefaults = ensureDefaults(parsed);
				if (!cancelled) {
					setMat(withDefaults);
					prevRef.current = JSON.stringify(withDefaults);
				}
			} catch (e) {
				console.error('[MaterialEditor] read fail', uri, e);
				if (!cancelled) {
					setMat(ensureDefaults(null));
					setError('Failed to load material');
				}
			}
		})();
		return () => { cancelled = true; };
	}, [uri, date]);

	// commit single source of truth: updates baseline then calls parent onSave(prev,next)
	const commit = (next) => {
		const prev = JSON.parse(prevRef.current || '{}');
		prevRef.current = JSON.stringify(next);
		onSave?.(prev, next);
	};

	// local patch; optionally commit
	const patch = (patchObj, commitChange = false) => {
		const next = ensureDefaults({ ...mat, ...patchObj });
		setMat(next);
		if (commitChange) commit(next);
	};

	const fileRow = (label, field, acceptFormat = 'img') => {
		const uuid = mat[field] || '';
		const filePath = uuid ? _root.resolvePathNoAssets(uuid) : '';
		const fname = fileName(filePath);

		const browse = () => openAsset?.({
			format: acceptFormat,
			selectedAsset: filePath,
			onSelect: (assetPath) => {
				const newUuid = _root.resolveAssetId(assetPath);
				patch({ [field]: newUuid }, true);
			}
		});

		return (
			<div className="material-editor-row field">
				<label className="material-editor-label">{label}</label>
				<div className="file-field">
					<input
						className="tf"
						type="text"
						readOnly
						value={fname}
						placeholder="No asset"
						onClick={browse}
					/>
					<button title="Browse" onClick={browse}>
						<MdFolderOpen />
					</button>
					{uuid ? (
						<button title="Clear" onClick={() => patch({ [field]: '' }, true)}>
							<MdDelete />
						</button>
					) : null}
				</div>
			</div>
		);
	};

	const spacer = () => <div style={{ height: 20 }} />;

	if (!mat) return <div className="material-editor">Loading material…</div>;
	if (error) return <div className="material-editor error">{error}</div>;

	const isBasic = mat.type === 'MeshBasicMaterial';

	return (
		<div className="material-editor">
			{/* BASIC */}
			<div className="material-editor-row field">
				<label className="material-editor-label">Color</label>
				<input
					type="color"
					value={numToInput(mat.color)}
					onClick={(e) => { e.target.oldValueNum = mat.color; }}
					onChange={(e) => {
						const val = inputToNum(e.target.value);
						patch({ color: val });
						clearTimeout(timer);
						timer = setTimeout(() => {
							commit({ ...mat, color: val });
						}, 100);
					}}
					onBlur={(e) => {
						const val = inputToNum(e.target.value);
						commit({ ...mat, color: val });
					}}
				/>
			</div>

			{!isBasic && (
				<div className="material-editor-row field">
					<label className="material-editor-label">Metalness</label>
					<div className="material-editor-slider">
						<input
							type="range" min={0} max={1} step={0.01}
							value={Number(mat.metalness) || 0}
							onChange={(e) => patch({ metalness: clamp01(e.target.value) })}
							onMouseUp={(e) => patch({ metalness: clamp01(e.target.value) }, true)}
							onTouchEnd={(e) => patch({ metalness: clamp01(e.target.value) }, true)}
						/>
						<div className="slider-value">{(Number(mat.metalness) || 0).toFixed(2)}</div>
					</div>
				</div>
			)}

			{!isBasic && (
				<div className="material-editor-row field">
					<label className="material-editor-label">Roughness</label>
					<div className="material-editor-slider">
						<input
							type="range" min={0} max={1} step={0.01}
							value={Number(mat.roughness) || 0}
							onChange={(e) => patch({ roughness: clamp01(e.target.value) })}
							onMouseUp={(e) => patch({ roughness: clamp01(e.target.value) }, true)}
							onTouchEnd={(e) => patch({ roughness: clamp01(e.target.value) }, true)}
						/>
						<div className="slider-value">{(Number(mat.roughness) || 0).toFixed(2)}</div>
					</div>
				</div>
			)}

			<div className="material-editor-row field">
				<div></div>
				<button className="btn" type="button" onClick={() => setShowAdvanced(s => !s)}>
					{showAdvanced ? 'Hide Advanced' : 'Advanced'}
				</button>
			</div>

			{/* ADVANCED */}
			{showAdvanced && (
				<>
					{spacer()}

					<div className="material-editor-row field">
						<label className="material-editor-label">Type</label>
						<select
							className="tf"
							value={mat.type}
							onChange={(e) => patch({ type: e.target.value }, true)}
						>
							<option value="MeshStandardMaterial">Mesh Standard Material</option>
							<option value="MeshPhysicalMaterial">Mesh Physical Material</option>
							<option value="MeshBasicMaterial">Mesh Basic Material</option>
						</select>
					</div>

					<div className="material-editor-row field">
						<label className="material-editor-label">Side</label>
						<select
							className="tf"
							value={mat.side}
							onChange={(e) => patch({ side: e.target.value }, true)}
						>
							<option value="FrontSide">Front Side</option>
							<option value="BackSide">Back Side</option>
							<option value="DoubleSide">Double Side</option>
						</select>
					</div>

					{spacer()}

					<div className="material-editor-row field">
						<label className="material-editor-label">Emissive</label>
						<input
							type="color"
							value={numToInput(mat.emissive)}
							onClick={(e) => { e.target.oldValueNum = mat.emissive; }}
							onChange={(e) => {
								const val = inputToNum(e.target.value);
								patch({ emissive: val });
							}}
							onBlur={(e) => {
								const val = inputToNum(e.target.value);
								commit({ ...mat, emissive: val });
							}}
						/>
					</div>

					<div className="material-editor-row field">
						<label className="material-editor-label">Emissive Intensity</label>
						<div className="material-editor-slider">
							<input
								type="range" min={0} max={10} step={0.1}
								value={Number(mat.emissiveIntensity) || 0}
								onChange={(e) => patch({ emissiveIntensity: Math.max(0, Number(e.target.value) || 0) })}
								onMouseUp={(e) => patch({ emissiveIntensity: Math.max(0, Number(e.target.value) || 0) }, true)}
								onTouchEnd={(e) => patch({ emissiveIntensity: Math.max(0, Number(e.target.value) || 0) }, true)}
							/>
							<div className="slider-value">{(Number(mat.emissiveIntensity) || 0).toFixed(1)}</div>
						</div>
					</div>

					{spacer()}

					<div className="material-editor-row field">
						<label className="material-editor-label">Opacity</label>
						<div className="material-editor-slider">
							<input
								type="range" min={0} max={1} step={0.01}
								value={Number(mat.opacity) || 1}
								onChange={(e) => patch({ opacity: clamp01(e.target.value) })}
								onMouseUp={(e) => patch({ opacity: clamp01(e.target.value) }, true)}
								onTouchEnd={(e) => patch({ opacity: clamp01(e.target.value) }, true)}
							/>
							<div className="slider-value">{(Number(mat.opacity) || 1).toFixed(2)}</div>
						</div>
					</div>

					<div className="material-editor-row field">
						<label className="material-editor-label">Wireframe</label>
						<input
							type="checkbox"
							checked={!!mat.wireframe}
							onChange={(e) => patch({ wireframe: !!e.target.checked }, true)}
						/>
					</div>

					{spacer()}

					{fileRow('Color Map', 'map')}
					<div className="material-editor-row field subrow">
						<label className="material-editor-label">Offset</label>
						<input
							className="tf"
							type="number"
							step="0.01"
							value={mat.mapOffset[0]}
							onChange={e => patch({ mapOffset: [parseFloat(e.target.value), mat.mapOffset[1]] })}
							onBlur={() => commit({ ...mat, mapOffset: [...mat.mapOffset] })}
							onKeyDown={autoBlur}
						/>
						<input
							className="tf"
							type="number"
							step="0.01"
							value={mat.mapOffset[1]}
							onChange={e => patch({ mapOffset: [mat.mapOffset[0], parseFloat(e.target.value)] })}
							onBlur={() => commit({ ...mat, mapOffset: [...mat.mapOffset] })}
							onKeyDown={autoBlur}
						/>
					</div>
					<div className="material-editor-row field subrow">
						<label className="material-editor-label">Scale</label>
						<input
							className="tf"
							type="number"
							step="0.01"
							value={mat.mapRepeat[0]}
							onChange={e => patch({ mapRepeat: [parseFloat(e.target.value), mat.mapRepeat[1]] })}
							onBlur={() => commit({ ...mat, mapRepeat: [...mat.mapRepeat] })}
							onKeyDown={autoBlur}
						/>
						<input
							className="tf"
							type="number"
							step="0.01"
							value={mat.mapRepeat[1]}
							onChange={e => patch({ mapRepeat: [mat.mapRepeat[0], parseFloat(e.target.value)] })}
							onBlur={() => commit({ ...mat, mapRepeat: [...mat.mapRepeat] })}
							onKeyDown={autoBlur}
						/>
					</div>

					{spacer()}

					{fileRow('Normal Map', 'normalMap')}
					<div className="material-editor-row field subrow">
						<label className="material-editor-label">Offset</label>
						<input
							className="tf"
							type="number"
							step="0.01"
							value={mat.normalMapOffset[0]}
							onChange={e => patch({ normalMapOffset: [parseFloat(e.target.value), mat.normalMapOffset[1]] })}
							onBlur={() => commit({ ...mat, normalMapOffset: [...mat.normalMapOffset] })}
							onKeyDown={autoBlur}
						/>
						<input
							className="tf"
							type="number"
							step="0.01"
							value={mat.normalMapOffset[1]}
							onChange={e => patch({ normalMapOffset: [mat.normalMapOffset[0], parseFloat(e.target.value)] })}
							onBlur={() => commit({ ...mat, normalMapOffset: [...mat.normalMapOffset] })}
							onKeyDown={autoBlur}
						/>
					</div>
					<div className="material-editor-row field subrow">
						<label className="material-editor-label">Scale</label>
						<input
							className="tf"
							type="number"
							step="0.01"
							value={mat.normalMapRepeat[0]}
							onChange={e => patch({ normalMapRepeat: [parseFloat(e.target.value), mat.normalMapRepeat[1]] })}
							onBlur={() => commit({ ...mat, normalMapRepeat: [...mat.normalMapRepeat] })}
							onKeyDown={autoBlur}
						/>
						<input
							className="tf"
							type="number"
							step="0.01"
							value={mat.normalMapRepeat[1]}
							onChange={e => patch({ normalMapRepeat: [mat.normalMapRepeat[0], parseFloat(e.target.value)] })}
							onBlur={() => commit({ ...mat, normalMapRepeat: [...mat.normalMapRepeat] })}
							onKeyDown={autoBlur}
						/>
					</div>
				</>
			)}
		</div>
	);
}