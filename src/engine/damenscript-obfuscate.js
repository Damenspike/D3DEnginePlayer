// damenscript-obfuscator.js
// DamenScript-aware minifier + identifier obfuscator.
//
// - Understands DamenScript tokens (??, =>, async/await, spread, etc.).
// - Removes comments.
// - Rebuilds code with minimal whitespace.
// - Obfuscates declared vars/functions safely.
//
// Usage:
//   import { obfuscateDamenScript } from './damenscript-obfuscator.js';
//
//   const out = obfuscateDamenScript(src, {
//     rename: true,
//     externals: ['Math', 'Tween'], // things to *not* rename
//   });

import {
	FORBIDDEN_KEYWORDS,
	FORBIDDEN_PROPS,
	NO_OBFUSCATE
} from './damenscript-schema.js';

// ---------- Low-level helpers (copied from DamenScript) ----------

const isWS = c => c === ' ' || c === '\t' || c === '\r' || c === '\n';
const isIdStart = c => /[A-Za-z_$]/.test(c);
const isId = c => /[A-Za-z0-9_$]/.test(c);
const isDigit = c => /[0-9]/.test(c);

const DS_KEYWORDS = new Set([
	'let','const','var','if','else','while','for','true','false','null',
	'function','return','undefined','NaN','Infinity','in','of','async','await'
]);

const PUNCT = new Set(['(',')','{','}','[',']',';',',','.',':','?']);

const TWO_CHAR_OPS = new Set([
	'==','!=','<=','>=','&&','||','===','!==','++','--','=>',
	'+=','-=','*=','/=','%=', '??'
]);

const ONE_CHAR_OPS = new Set(['=','+','-','*','/','%','<','>','!']);

// ---------- DamenScript lexer (same behaviour as interpreter) ----------

function lexDamenScript(input) {
	let i = 0, line = 1, col = 1;
	const tokens = [];

	const peek = (k = 0) => input[i + k] ?? '';
	const adv = (n = 1) => {
		let ch = '';
		while (n--) {
			ch = input[i++] ?? '';
			if (ch === '\n') {
				line++;
				col = 1;
			} else {
				col++;
			}
		}
		return ch;
	};
	const add = (type, value) => tokens.push({ type, value, line, col });

	const skipWSandComments = () => {
		while (true) {
			if (isWS(peek())) {
				adv();
				continue;
			}
			// // line comments
			if (peek() === '/' && peek(1) === '/') {
				while (peek() && peek() !== '\n') adv();
				continue;
			}
			// /* block comments */
			if (peek() === '/' && peek(1) === '*') {
				adv(2);
				while (peek() && !(peek() === '*' && peek(1) === '/')) adv();
				if (peek()) adv(2);
				continue;
			}
			break;
		}
	};

	while (i < input.length) {
		skipWSandComments();
		const ch = peek();
		if (!ch) break;

		// spread ...
		if (ch === '.' && peek(1) === '.' && peek(2) === '.') {
			add('spread', '...');
			adv(3);
			continue;
		}

		// strings: "..." or '...'
		if (ch === '"' || ch === '\'') {
			const q = adv();
			let s = '';
			while (peek() && peek() !== q) {
				const c = adv();
				if (c === '\\') {
					const n = adv();
					const map = {
						n: '\n', r: '\r', t: '\t',
						'"': '"', "'": "'", '\\': '\\'
					};
					s += map[n] ?? n;
				} else {
					s += c;
				}
			}
			if (peek() !== q) {
				throw new Error('DamenScript lex: Unterminated string');
			}
			adv(); // closing quote
			add('str', s);
			continue;
		}

		// numbers: 123, 1.23, .5, 1e3 etc.
		if (isDigit(ch) || (ch === '.' && isDigit(peek(1)))) {
			let num = '';
			if (ch === '.') num += adv();
			while (isDigit(peek())) num += adv();

			if (peek() === '.') {
				num += adv();
				while (isDigit(peek())) num += adv();
			}

			if (/[eE]/.test(peek())) {
				num += adv();
				if (/[+-]/.test(peek())) num += adv();
				while (isDigit(peek())) num += adv();
			}

			add('num', Number(num));
			continue;
		}

		// identifier / keyword
		if (isIdStart(ch)) {
			let id = adv();
			while (isId(peek())) id += adv();
			if (DS_KEYWORDS.has(id)) {
				add('kw', id);
			} else {
				add('ident', id);
			}
			continue;
		}

		// operators (multi-char first)
		const two = ch + (peek(1) ?? '');
		const three = ch + (peek(1) ?? '') + (peek(2) ?? '');

		if (TWO_CHAR_OPS.has(three)) {
			add('op', three);
			adv(3);
			continue;
		}
		if (TWO_CHAR_OPS.has(two)) {
			add('op', two);
			adv(2);
			continue;
		}
		if (ONE_CHAR_OPS.has(ch)) {
			add('op', adv());
			continue;
		}

		// punctuation
		if (PUNCT.has(ch)) {
			add('punc', adv());
			continue;
		}

		throw new Error(`DamenScript lex: Unexpected character '${ch}' at ${line}:${col}`);
	}

	tokens.push({ type: 'eof', value: '<eof>', line, col });
	return tokens;
}

// ---------- Name generator (a, b, c, ..., aa, ab, ...) ----------

function makeNameGenerator() {
	const firstChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_';
	const restChars = firstChars + '0123456789';
	let index = 0;

	return (used) => {
		while (true) {
			let n = index++;
			let s = '';
			let chars = firstChars;
			let first = true;

			do {
				const base = chars.length;
				const c = chars[n % base];
				s = c + s;
				n = Math.floor(n / base);
				if (first) {
					first = false;
					chars = restChars;
				}
			} while (n > 0);

			if (!used.has(s)) return s;
		}
	};
}

// ---------- Build rename map from tokens ----------

function buildRenameMap(tokens, externals = []) {
	const forbidden = new Set([
		// DamenScript keywords
		...DS_KEYWORDS,
		// Engine-level forbidden names
		...FORBIDDEN_KEYWORDS,
		// Props that the runtime blocks (just in case)
		...FORBIDDEN_PROPS,
		// Special identifiers to never mangle
		'this',
		'self',
	]);

	// Builtins that usually live in env
	const BUILTINS = [
		'Math',
		'isFinite',
		'Tween',
	];

	for (const b of BUILTINS) forbidden.add(b);
	for (const e of externals) forbidden.add(e);

	const used = new Set(forbidden);
	const genName = makeNameGenerator();
	const rename = new Map();

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.type !== 'ident') continue;

		const name = t.value;
		const prev = tokens[i - 1] || null;

		let isDecl = false;

		// ---- direct declarations: let foo / const foo / var foo / function foo ----
		if (prev && prev.type === 'kw' && (
			prev.value === 'let' ||
			prev.value === 'const' ||
			prev.value === 'var' ||
			prev.value === 'function'
		)) {
			// skip destructuring like: let { foo } = ...
			const next = tokens[i + 1] || null;
			if (!(prev.value !== 'function' &&
				  next && next.type === 'punc' &&
				  (next.value === '{' || next.value === '['))) {
				isDecl = true;
			}
		}

		// ---- declarations after commas: let foo, bar ----
		else if (prev && prev.type === 'punc' && prev.value === ',') {
			let sawDestructureBrace = false;

			for (let j = i - 1; j >= 0; j--) {
				const tj = tokens[j];

				// if we see '{' or '[' before hitting the keyword, this is
				// a destructuring pattern: let { a, b } = obj;
				if (tj.type === 'punc' && (tj.value === '{' || tj.value === '[')) {
					sawDestructureBrace = true;
				}

				// reached the declaration keyword
				if (tj.type === 'kw' && (
					tj.value === 'let' ||
					tj.value === 'const' ||
					tj.value === 'var'
				)) {
					// only treat as a simple var-list if there was NO '{' or '[' between
					// the keyword and this identifier
					if (!sawDestructureBrace) {
						isDecl = true;
					}
					break;
				}

				// bail out if we hit a statement / init boundary first
				if (tj.type === 'punc' && (tj.value === ';' || tj.value === '=' || tj.value === ')')) {
					break;
				}
			}
		}

		if (!isDecl) continue;
		if (forbidden.has(name)) continue;

		if (!rename.has(name)) {
			const n = genName(used);
			rename.set(name, n);
			used.add(n);
		}
	}

	return rename;
}

// ---------- Helpers for deciding when NOT to rename a token ----------

function isPropertyPosition(tokens, index) {
	const t = tokens[index];
	if (!t || t.type !== 'ident') return false;

	const prev = tokens[index - 1] || null;
	const next = tokens[index + 1] || null;

	// obj.foo
	if (prev && prev.type === 'punc' && prev.value === '.') return true;

	// { foo: ... }
	if (next && next.type === 'punc' && next.value === ':') {
		if (prev && prev.type === 'punc' &&
			(prev.value === '{' || prev.value === ',')) {
			return true;
		}
	}

	// { foo() { ... } }  – method shorthand
	if (next && next.type === 'punc' && next.value === '(') {
		if (prev && prev.type === 'punc' &&
			(prev.value === '{' || prev.value === ',')) {
			return true;
		}
	}

	return false;
}

// ---------- String encoder (for minified output) ----------

function encodeString(s) {
	let out = '"';
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		switch (ch) {
			case '"': out += '\\"'; break;
			case '\\': out += '\\\\'; break;
			case '\n': out += '\\n'; break;
			case '\r': out += '\\r'; break;
			case '\t': out += '\\t'; break;
			default: {
				const code = ch.charCodeAt(0);
				if (code < 32) {
					out += '\\x' + code.toString(16).padStart(2, '0');
				} else {
					out += ch;
				}
			}
		}
	}
	out += '"';
	return out;
}

// ---------- Whitespace rules for rebuilding code ----------

function needsSpace(prev, cur) {
	if (!prev) return false;

	const wordish = t =>
		t.type === 'ident' ||
		t.type === 'kw' ||
		t.type === 'num';

	// foo bar / let x / 10 async / etc.
	if (wordish(prev) && wordish(cur)) return true;

	// Avoid things like "+ +", "- -", "= =", "&& ||" merging into single ops.
	if (prev.type === 'op' && cur.type === 'op') return true;

	return false;
}

// ---------- Main API ----------

export function obfuscate(source, options = {}) {
	return obfuscateDamenScript(source, {
		...options,
		externals: [...NO_OBFUSCATE]
	})
}
export function obfuscateDamenScript(source, options = {}) {
	const {
		rename = true,
		externals = []
	} = options;

	// 1) Lex using DamenScript rules (comments removed here)
	const tokens = lexDamenScript(source);

	// 2) Build rename map from declarations
	const renameMap = rename ? buildRenameMap(tokens, externals) : new Map();

	// 3) Rebuild code from tokens with:
	//    - identifier renaming
	//    - minimal whitespace
	let out = '';
	let prev = null;

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.type === 'eof') break;

		if (needsSpace(prev, t)) out += ' ';

		let v;

		if (t.type === 'str') {
			v = encodeString(t.value);
		} else if (t.type === 'num') {
			v = String(t.value);
		} else if (t.type === 'ident' && renameMap.size > 0) {
			// don't rename if it's being used as a property / method name
			if (!isPropertyPosition(tokens, i)) {
				const mapped = renameMap.get(t.value);
				v = mapped || t.value;
			} else {
				v = t.value;
			}
		} else {
			v = t.value;
		}

		out += v;
		prev = t;
	}

	return out;
}

// Convenience alias: "minify but don't rename"
export function minifyDamenScript(source) {
	return obfuscateDamenScript(source, {
		rename: false
	});
}