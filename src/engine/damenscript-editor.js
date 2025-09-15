// DamenScript installer for Monaco
// - Registers language + Monarch tokens
// - Defines (does NOT set) a theme that renders banned tokens in red
// - No use of getEncodedLanguageId, no early setTheme
import { 
	KEYWORDS,
	TYPE_KEYWORDS,
	D3D_OBJECT_SCHEMA,
	FORBIDDEN_KEYWORDS,
	FORBIDDEN_PROPS
} from './damenscript-schema.js';

export function installDamenScript(monaco) {
	// prevent double-register
	try {
		const langs = monaco.languages.getLanguages?.() || [];
		if (langs.some(l => l.id === 'damenscript')) return;
	} catch (_) {}
	
	// 2) Simple predicate: when user types IDENTIFIER.<here>, offer D3DObject props
	function isDotAccess(model, position) {
		const line = model.getLineContent(position.lineNumber);
		const left = line.slice(0, position.column - 1); // up to char before caret
		return /\b[A-Za-z_]\w*\.\s*$/.test(left);
	}
	
	function isDotAccess(model, position) {
		const line = model.getLineContent(position.lineNumber);
		const left = line.slice(0, position.column - 1); // text before the dot
	
		// basic "identifier." check
		if (!/\b([A-Za-z_]\w*)\.\s*$/.test(left)) return null;
	
		// extract the identifier before the dot
		const match = left.match(/([A-Za-z_]\w*)\.\s*$/);
		return match ? match[1] : null;
	}
	
	// crude scope: only treat certain variables as D3DObjects
	function isD3DObjectVar(name) {
		// adjust this list/pattern to your environment
		return (
			name === 'this' ||
			name === 'object' ||
			name === 'self' ||
			name === 'root' ||
			name === '_root' ||
			name === 'parent' ||
			name.endsWith('_obj') ||
			name.endsWith('_d3d')
		);
	}
	
	monaco.languages.registerCompletionItemProvider('damenscript', {
		triggerCharacters: ['.'],
		provideCompletionItems(model, position) {
			const ident = isDotAccess(model, position);
			if (!ident) return { suggestions: [] };
	
			// only fire if the identifier looks like a D3DObject
			if (!isD3DObjectVar(ident)) return { suggestions: [] };
	
			const suggestions = Object.entries(D3D_OBJECT_SCHEMA).map(([key, meta]) => ({
				label: key,
				kind: meta.type.startsWith('Function')
					? monaco.languages.CompletionItemKind.Method
					: monaco.languages.CompletionItemKind.Property,
				insertText: key,
				detail: meta.type,
				documentation: meta.doc,
				range: {
					startLineNumber: position.lineNumber,
					startColumn: position.column,
					endLineNumber: position.lineNumber,
					endColumn: position.column
				}
			}));
			return { suggestions };
		}
	});
	
	// 4) Hover provider (show docs when you hover a known prop)
	monaco.languages.registerHoverProvider('damenscript', {
		provideHover(model, position) {
			const word = model.getWordAtPosition(position);
			if (!word) return null;
			const meta = D3D_OBJECT_SCHEMA[word.word];
			if (!meta) return null;
			return {
				range: new monaco.Range(
					position.lineNumber, word.startColumn,
					position.lineNumber, word.endColumn
				),
				contents: [
					{ value: `**${word.word}** \`${meta.type}\`` },
					{ value: meta.doc || '' }
				]
			};
		}
	});

	// --- language ---
	monaco.languages.register({
		id: 'damenscript',
		aliases: ['DamenScript', 'ds'],
		extensions: ['.ds', '.dms'],
		mimetypes: ['text/damenscript']
	});

	// --- tokens (Monarch) ---
	monaco.languages.setMonarchTokensProvider('damenscript', {
		defaultToken: '',
		tokenPostfix: '.ds',
		keywords: KEYWORDS,
		typeKeywords: TYPE_KEYWORDS,
		banned: [...FORBIDDEN_KEYWORDS, ...FORBIDDEN_PROPS], // <- paint these red
		operators: ['=','>','<','!','~','?','::',':','==','<=','>=','!=','&&','||','++','--','+','-','*','/','&','|','^','%','<<','>>','>>>'],
		symbols: /[=><!~?:&|+\-*/^%]+/,
		escapes: /\\(?:[abfnrtv\\"'`]|x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4})/,
		tokenizer: {
			root: [
				[/[a-zA-Z_]\w*/, {
					cases: {
						'@banned': 'banned',      // <- custom token
						'@keywords': 'keyword',
						'@typeKeywords': 'type',
						'@default': 'identifier'
					}
				}],
				{ include: '@whitespace' },
				[/[{}()[\]]/, '@brackets'],
				[/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
				[/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
				[/0[xX][0-9a-fA-F]+/, 'number.hex'],
				[/\d+/, 'number'],
				[/"([^"\\]|\\.)*$/, 'string.invalid'],
				[/"/, 'string', '@string'],
				[/'[^\\']'/, 'string'],
				[/'/, 'string.invalid']
			],
			whitespace: [
				[/[ \t\r\n]+/, 'white'],
				[/\/\/.*$/, 'comment'],
				[/\/\*.*?\*\//, 'comment']
			],
			string: [
				[/[^\\"]+/, 'string'],
				[/@escapes/, 'string.escape'],
				[/\\./, 'string.escape.invalid'],
				[/"/, 'string']
			]
		}
	});

	// --- language config ---
	monaco.languages.setLanguageConfiguration('damenscript', {
		autoClosingPairs: [
			{ open: '{', close: '}' },
			{ open: '[', close: ']' },
			{ open: '(', close: ')' },
			{ open: '"', close: '"', notIn: ['string'] }
		],
		comments: { lineComment: '//', blockComment: ['/*', '*/'] },
		brackets: [['{','}'],['[',']'],['(',')']]
	});

	// --- theme (define only; DO NOT set here) ---
	monaco.editor.defineTheme('damenscript-dark', {
		base: 'vs-dark',
		inherit: true,
		rules: [
			{ token: 'banned', foreground: 'ff5555', fontStyle: 'bold' } // red + bold
		],
		// add base colors to avoid "editor.foreground" crash on some builds
		colors: {
			'editor.background': '#1e1e1e',
			'editor.foreground': '#cccccc'
		}
	});
}

// (optional) helper to add red squiggles for banned words
export function applyBannedMarkers(editor, monaco) {
	const model = editor.getModel?.();
	if (!model) return;

	const text = model.getValue();
	const re = /\b(document|window|eval)\b/g;
	const markers = [];
	let m;
	while ((m = re.exec(text))) {
		const start = model.getPositionAt(m.index);
		const end = model.getPositionAt(m.index + m[0].length);
		markers.push({
			startLineNumber: start.lineNumber,
			startColumn: start.column,
			endLineNumber: end.lineNumber,
			endColumn: end.column,
			severity: monaco.MarkerSeverity.Error,
			message: `Banned identifier: ${m[0]}`
		});
	}
	monaco.editor.setModelMarkers(model, 'damenscript-banned', markers);
}