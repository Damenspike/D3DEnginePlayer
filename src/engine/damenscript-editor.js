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
		banned: [...FORBIDDEN_KEYWORDS, ...FORBIDDEN_PROPS],
		operators: ['=','>','<','!','~','?','::',':','==','<=','>=','!=','&&','||','++','--','+','-','*','/','&','|','^','%','<<','>>','>>>'],
		symbols: /[=><!~?:&|+\-*/^%]+/,
		escapes: /\\(?:[abfnrtv\\"'`]|x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4})/,
	
		tokenizer: {
			root: [
				// --- comments (multi-line via state) ---
				[/\/\*/, 'comment', '@comment'],
				[/\/\/.*$/, 'comment'],
	
				// --- identifiers/keywords ---
				[/[A-Za-z_]\w*/, {
					cases: {
						'@banned': 'banned',
						'@keywords': 'keyword',
						'@typeKeywords': 'type',
						'@default': 'identifier'
					}
				}],
	
				{ include: '@whitespace' },
	
				// --- brackets & operators ---
				[/[{}()[\]]/, '@brackets'],
				[/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
	
				// --- numbers ---
				[/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
				[/0[xX][0-9a-fA-F]+/, 'number.hex'],
				[/\d+/, 'number'],
	
				// --- strings ---
				[/"([^"\\]|\\.)*$/, 'string.invalid'],  // unterminated (for highlighting)
				[/"/, 'string', '@string'],
				[/'([^'\\]|\\.)*$/, 'string.invalid'],
				[/'/, 'string', '@stringSingle'],
			],
	
			// multiline comments that span lines
			comment: [
				[/[^/*]+/, 'comment'],
				[/\*\//, 'comment', '@pop'],
				[/[/*]/, 'comment']
			],
	
			whitespace: [
				[/[ \t\r\n]+/, 'white'],
				// (line comments handled in root)
			],
	
			string: [
				[/[^\\"]+/, 'string'],
				[/@escapes/, 'string.escape'],
				[/\\./, 'string.escape.invalid'],
				[/"/, 'string', '@pop']          // <-- pop!
			],
	
			stringSingle: [
				[/[^\\']+/, 'string'],
				[/@escapes/, 'string.escape'],
				[/\\./, 'string.escape.invalid'],
				[/'/, 'string', '@pop']
			],
		}
	});

	// --- language config ---
	monaco.languages.setLanguageConfiguration('damenscript', {
		autoClosingPairs: [
			{ open: '{', close: '}' },
			{ open: '[', close: ']' },
			{ open: '(', close: ')' },
			{ open: '"', close: '"', notIn: ['string'] },
			{ open: "'", close: "'", notIn: ['string'] }
		],
		comments: { lineComment: '//', blockComment: ['/*', '*/'] },
		brackets: [['{','}'],['[',']'],['(',')']]
	});

	// --- theme (define only; DO NOT set here) ---
	monaco.editor.defineTheme('damenscript-light', {
		base: 'vs',        // light base
		inherit: true,
		rules: [
			{ token: 'banned', foreground: 'ff5555', fontStyle: 'bold' }
		],
		colors: {
			'editor.background': '#ffffff',
			'editor.foreground': '#1e1e1e',
			'editorLineNumber.foreground': '#999999',
			'editor.selectionBackground': '#cce8ff',
			'editor.inactiveSelectionBackground': '#e6f2ff',
			'editor.lineHighlightBackground': '#f7f7f7',
			'editorCursor.foreground': '#000000'
		}
	});
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