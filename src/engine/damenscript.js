/* DamenScript — safe, tiny JS-like interpreter (with default parameters)
   ----------------------------------------------------------------------
   Blocks: window, document, globalThis, eval, Function, require, process, import, new
   `this` is an alias of `self` (provide self in env as needed)
*/

import {
  FORBIDDEN_KEYWORDS,
  FORBIDDEN_PROPS
} from './damenscript-schema.js';

import D3DMath from './d3dmath.js'; // (kept for compatibility, even if unused)

const BLOCKED_PROPS = new Set([...FORBIDDEN_PROPS]);
const FORBIDDEN_NAMES = new Set([...FORBIDDEN_KEYWORDS]);

const SAFE_MATH = Object.freeze({
  // angles
  tan: Math.tan, atan: Math.atan, degToRad: (d) => d * Math.PI / 180,
  // general
  PI: Math.PI, abs: Math.abs, min: Math.min, max: Math.max,
  sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sin: Math.sin, cos: Math.cos, pow: Math.pow
});

const BASIC_ENV = Object.freeze({
  isFinite,
  Math: SAFE_MATH
});

const DS_BIND_CACHE = Symbol.for('DamenScript.bindCache');

const isWS = c => c === ' ' || c === '\t' || c === '\r' || c === '\n';
const isIdStart = c => /[A-Za-z_$]/.test(c);
const isId = c => /[A-Za-z0-9_$]/.test(c);
const isDigit = c => /[0-9]/.test(c);

/* ------------------------------------------------------------------ */
/*   Error factories (per-context)                                     */
/* ------------------------------------------------------------------ */

function makeErrorFactory(contextId) {
  const prefix = contextId ? `[${contextId}] ` : '';

  function DSyntax(msg, line = 0, col = 0) {
	const hasLoc = line > 0 && col > 0;
	const full = prefix + msg + (hasLoc ? ` (line ${line}, col ${col})` : '');
	const e = new Error(full);
	e.name = 'DamenScriptSyntaxError';
	e.contextId = contextId ?? null;
	e.line = line || 0;
	e.col = col || 0;
	return e;
  }

  function DRuntime(msg, line = 0, col = 0) {
	const hasLoc = line > 0 && col > 0;
	const full = prefix + msg + (hasLoc ? ` (line ${line}, col ${col})` : '');
	const e = new Error(full);
	e.name = 'DamenScriptRuntimeError';
	e.contextId = contextId ?? null;
	e.line = line || 0;
	e.col = col || 0;
	return e;
  }

  return { DSyntax, DRuntime };
}

/* ------------------------------------------------------------------ */
/*   Core DamenScript implementation (parametrised by DSyntax/DRuntime) */
/* ------------------------------------------------------------------ */

function createCore(DSyntax, DRuntime) {

  /* ========================= LEXER ========================= */

  const KEYWORDS = new Set([
	'let','const','var','if','else','while','for','true','false','null',
	'function','return','undefined','NaN','Infinity','in','of','async','await',
	'try','catch','finally','throw','delete'
  ]);
  const PUNCT = new Set(['(',')','{','}','[',']',';',',','.',':','?']);
  const TWO_CHAR_OPS = new Set([
	'==','!=','<=','>=','&&','||','===','!==','++','--','=>',
	'+=','-=','*=','/=','%=', '??'
  ]);
  const ONE_CHAR_OPS = new Set(['=','+','-','*','/','%','<','>','!']);

  function DS_lexTemplateLiteral(input, startIndex, startLine, startCol) {
	const len = input.length;
	let idx   = startIndex + 1;
	let line  = startLine;
	let col   = startCol + 1;

	const pieces = [];
	let textBuf  = '';

	const MODE_NORMAL = 0;
	const MODE_SQ     = 1; // '
	const MODE_DQ     = 2; // "
	const MODE_LINE   = 3; // //
	const MODE_BLOCK  = 4; // /* */
	let mode = MODE_NORMAL;

	const adv = () => {
	  const ch = input[idx++];
	  if (ch === '\n') { line++; col = 1; }
	  else col++;
	  return ch;
	};

	const peek = (k = 0) => input[idx + k] ?? '';

	function flushText() {
	  if (textBuf.length > 0) {
		pieces.push({ kind: 'text', value: textBuf });
		textBuf = '';
	  }
	}

	function readExpr() {
	  let depth = 1;
	  let expr  = '';

	  while (idx < len && depth > 0) {
		const ch = adv();

		if (mode === MODE_NORMAL) {
		  if (ch === "'") { mode = MODE_SQ;  expr += ch; continue; }
		  if (ch === '"') { mode = MODE_DQ;  expr += ch; continue; }

		  if (ch === '/' && peek() === '/') {
			mode = MODE_LINE; expr += ch; expr += adv(); continue;
		  }
		  if (ch === '/' && peek() === '*') {
			mode = MODE_BLOCK; expr += ch; expr += adv(); continue;
		  }

		  if (ch === '{') { depth++; expr += ch; continue; }
		  if (ch === '}') {
			depth--;
			if (depth === 0) break;
			expr += ch;
			continue;
		  }

		  expr += ch;
		  continue;
		}

		if (mode === MODE_SQ) {
		  expr += ch;
		  if (ch === '\\' && idx < len) { expr += adv(); }
		  else if (ch === "'") mode = MODE_NORMAL;
		  continue;
		}

		if (mode === MODE_DQ) {
		  expr += ch;
		  if (ch === '\\' && idx < len) { expr += adv(); }
		  else if (ch === '"') mode = MODE_NORMAL;
		  continue;
		}

		if (mode === MODE_LINE) {
		  expr += ch;
		  if (ch === '\n') mode = MODE_NORMAL;
		  continue;
		}

		if (mode === MODE_BLOCK) {
		  expr += ch;
		  if (ch === '*' && peek() === '/') {
			expr += adv();
			mode = MODE_NORMAL;
		  }
		  continue;
		}
	  }

	  if (depth !== 0)
		throw DSyntax('Unterminated ${...} in template literal', line, col);

	  return expr.trim();
	}

	while (idx < len) {
	  const ch = peek();

	  if (ch === '`') {
		adv();
		flushText();
		break;
	  }

	  if (ch === '$' && peek(1) === '{') {
		adv(); adv();
		flushText();
		const exprCode = readExpr();
		pieces.push({ kind: 'expr', value: exprCode });
		continue;
	  }

	  const c = adv();
	  textBuf += c;
	}

	if (idx > len)
	  throw DSyntax('Unterminated template literal', line, col);

	const tokens = [];

	const pushStr = (s) => {
	  if (!s) return;
	  tokens.push({
		type:  'str',
		value: s,
		line:  startLine,
		col:   startCol
	  });
	};

	const pushPunc = (v) => {
	  tokens.push({
		type:  'punc',
		value: v,
		line:  startLine,
		col:   startCol
	  });
	};

	const pushOp = (v) => {
	  tokens.push({
		type:  'op',
		value: v,
		line:  startLine,
		col:   startCol
	  });
	};

	const pushExprTokens = (code, baseLine, baseCol) => {
		if(!code.trim()) return;
		pushPunc('(');
	
		const inner = lex(code);
		for(const t of inner) {
			if(t.type === 'eof') continue;
			t.line = baseLine + (t.line - 1);
			t.col  = (t.line === 1) ? (baseCol + (t.col - 1)) : t.col;
			tokens.push(t);
		}
	
		pushPunc(')');
	};

	pushPunc('(');
	let first = true;

	for (const p of pieces) {
	  if (p.kind === 'text') {
		if (!p.value) continue;
		if (!first) pushOp('+');
		pushStr(p.value);
		first = false;
	  } else {
		if (!first) pushOp('+');
		pushExprTokens(p.value);
		first = false;
	  }
	}

	if (first) {
	  pushStr('');
	}

	pushPunc(')');

	return {
	  tokens,
	  newIndex: idx,
	  newLine:  line,
	  newCol:   col
	};
  }

  function lex(input) {
	let i = 0, line = 1, col = 1;
	const tokens = [];
	const peek = (k = 0) => input[i + k] ?? '';
	const adv = (n = 1) => {
	  let ch = '';
	  while (n--) {
		ch = input[i++] ?? '';
		if (ch === '\n') { line++; col = 1; }
		else col++;
	  }
	  return ch;
	};
	const add = (type, value) => tokens.push({ type, value, line, col });

	const skipWS = () => {
	  while (true) {
		if (isWS(peek())) { adv(); continue; }
		if (peek() === '/' && peek(1) === '/') { while (peek() && peek() !== '\n') adv(); continue; }
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
	  skipWS();
	  const ch = peek();
	  if (!ch) break;

	  if (ch === '`') {
		const tpl = DS_lexTemplateLiteral(input, i, line, col);
		tokens.push(...tpl.tokens);
		i    = tpl.newIndex;
		line = tpl.newLine;
		col  = tpl.newCol;
		continue;
	  }

	  if (ch === '.' && peek(1) === '.' && peek(2) === '.') {
		add('spread', '...');
		adv(3);
		continue;
	  }

	  if (ch === '"' || ch === "'") {
		const q = adv(); let s = '';
		while (peek() && peek() !== q) {
		  const c = adv();
		  if (c === '\\') {
			const n = adv();
			const map = { n:'\n', r:'\r', t:'\t', '"':'"', "'":"'", '\\':'\\' };
			s += map[n] ?? n;
		  } else s += c;
		}
		if (peek() !== q) throw DSyntax('Unterminated string', line, col);
		adv(); add('str', s);
		continue;
	  }

	  if (isDigit(ch) || (ch === '.' && isDigit(peek(1)))) {
		let num = '';
		if (ch === '.') num += adv();
		while (isDigit(peek())) num += adv();
		if (peek() === '.') { num += adv(); while (isDigit(peek())) num += adv(); }
		if (/[eE]/.test(peek())) {
		  num += adv();
		  if (/[+-]/.test(peek())) num += adv();
		  while (isDigit(peek())) num += adv();
		}
		add('num', Number(num));
		continue;
	  }

	  if (isIdStart(ch)) {
		let id = adv();
		while (isId(peek())) id += adv();
		if (KEYWORDS.has(id)) add('kw', id);
		else add('ident', id);
		continue;
	  }

	  const three = ch + (peek(1) ?? '') + (peek(2) ?? '');
	  const two   = ch + (peek(1) ?? '');
	  if (TWO_CHAR_OPS.has(three)) { add('op', three); adv(3); continue; }
	  if (TWO_CHAR_OPS.has(two))   { add('op', two);   adv(2); continue; }

	  if (ONE_CHAR_OPS.has(ch)) { add('op', adv()); continue; }

	  if (PUNCT.has(ch)) { add('punc', adv()); continue; }

	  throw DSyntax(`Unexpected character '${ch}'`, line, col);
	}

	tokens.push({ type:'eof', value:'<eof>', line, col });
	return tokens;
  }

  function preflight(code) {
	  const tokens = lex(code);
	  let hasAwait = false;
	  let hasAsync = false;
  
	  for(const t of tokens) {
		  if((t.type === 'ident' || t.type === 'kw') && FORBIDDEN_NAMES.has(t.value)) {
			  if(t.value === 'new')     throw DSyntax("DamenScript: 'new' is not supported; use a factory", t.line, t.col);
			  if(t.value === 'import')  throw DSyntax("DamenScript: 'import' is not supported", t.line, t.col);
			  throw DSyntax(`DamenScript: forbidden identifier: ${t.value}`, t.line, t.col);
		  }
		  if(t.type === 'kw' && t.value === 'await') hasAwait = true;
		  if(t.type === 'kw' && t.value === 'async') hasAsync = true;
	  }
	  return { tokens, hasAwait, hasAsync };
  }

  /* ========================= PARSER ========================= */

  function parseTokens(tokens) {
	  let pos = 0;
	  
	  const peek = () => tokens[pos];
	  const next = () => tokens[pos++];
	  const match = (type, value) => {
		  const t = peek();
		  if(t.type === type && (value === undefined || t.value === value)) {
			  next();
			  return true;
		  }
		  return false;
	  };
	  const expect = (type, value) => {
		  const t = next();
		  if(!t || t.type !== type || (value !== undefined && t.value !== value)) {
			  throw DSyntax(`Expected ${value ?? type} but got ${t?.value ?? t?.type}`, t?.line ?? 0, t?.col ?? 0);
		  }
		  return t;
	  };
  
	  function Program() {
		  const body = [];
		  while(peek().type !== 'eof') body.push(Statement());
		  return { type: 'Program', body };
	  }
  
	  function Statement() {
		const t = peek();
		if (t.type === 'kw' && t.value === 'function') return parsePossiblyAsyncFunction(true);
		if (t.type === 'kw' && t.value === 'async' &&
			tokens[pos+1] && tokens[pos+1].type === 'kw' && tokens[pos+1].value === 'function') {
		  return parsePossiblyAsyncFunction(true);
		}
		if (t.type === 'kw' && (t.value === 'let' || t.value === 'const' || t.value === 'var')) return VarDecl();
		if (t.type === 'kw' && t.value === 'if') return IfStmt();
		if (t.type === 'kw' && t.value === 'while') return WhileStmt();
		if (t.type === 'kw' && t.value === 'for') return ForStmt();
		if (t.type === 'kw' && t.value === 'try') return TryStmt();
		if (t.type === 'kw' && t.value === 'throw') return ThrowStmt();
		if (t.type === 'kw' && t.value === 'return') {
		  next();
		  const hasExpr = !(peek().type === 'punc' && peek().value === ';');
		  const argument = hasExpr ? Expression() : null;
		  match('punc',';');
		  return { type:'ReturnStatement', argument };
		}
		if (t.type === 'punc' && t.value === '{') return Block();
		const expr = Expression();
		match('punc',';');
		return { type:'ExpressionStatement', expression:expr };
	  }
  
	  function Block() {
		expect('punc','{');
		const body = [];
		while (!(peek().type === 'punc' && peek().value === '}')) body.push(Statement());
		expect('punc','}');
		return { type:'BlockStatement', body };
	  }
  
	  function VarDecl() {
		const kind = next().value;
		const declarations = [];
		do {
		  let idNode;
		  if (peek().type === 'punc' && (peek().value === '{' || peek().value === '[')) {
			idNode = BindingPattern();
		  } else {
			const idTok = expect('ident');
			idNode = { type:'Identifier', name:idTok.value, line:idTok.line, col:idTok.col };
		  }
		  let init = null;
		  if (match('op','=')) init = Expression();
		  declarations.push({ type:'VariableDeclarator', id:idNode, init });
		} while (match('punc',','));
		match('punc',';');
		return { type:'VariableDeclaration', kind, declarations };
	  }
  
	  function IfStmt() {
		expect('kw','if');
		expect('punc','(');
		const test = Expression();
		expect('punc',')');
		const consequent = Statement();
		let alternate = null;
		if (match('kw','else')) alternate = Statement();
		return { type:'IfStatement', test, consequent, alternate };
	  }
  
	  function WhileStmt() {
		expect('kw','while');
		expect('punc','(');
		const test = Expression();
		expect('punc',')');
		const body = Statement();
		return { type:'WhileStatement', test, body };
	  }
  
	  function ForStmt() {
		expect('kw','for');
		expect('punc','(');
  
		let init = null;
		let test = null;
		let update = null;
		let body = null;
		const savePos = pos;
  
		if (peek().type === 'kw' && (peek().value === 'let' || peek().value === 'const' || peek().value === 'var')) {
		  const kind = next().value;
		  if (peek().type === 'ident') {
			const idTok = next();
			const id = { type:'Identifier', name:idTok.value, line:idTok.line, col:idTok.col };
  
			if (peek().type === 'kw' && peek().value === 'in') {
			  next();
			  const right = Expression();
			  expect('punc',')');
			  body = Statement();
			  return { type:'ForInStatement', left:{ kind, id }, right, body };
			}
  
			if (peek().type === 'kw' && peek().value === 'of') {
			  next();
			  const right = Expression();
			  expect('punc',')');
			  body = Statement();
			  return { type:'ForOfStatement', left:{ kind, id }, right, body };
			}
		  }
		  pos = savePos;
		  init = VarDecl();
		} else {
		  if (peek().type === 'ident') {
			const idTok = next();
			const id = { type:'Identifier', name:idTok.value, line:idTok.line, col:idTok.col };
  
			if (peek().type === 'kw' && (peek().value === 'in' || peek().value === 'of')) {
			  const mode = next().value;
			  const right = Expression();
			  expect('punc',')');
			  body = Statement();
			  return {
				type: mode === 'in' ? 'ForInStatement' : 'ForOfStatement',
				left: id,
				right,
				body
			  };
			}
			pos--;
		  }
  
		  if (!match('punc',';')) {
			init = Expression();
			expect('punc',';');
		  }
		}
  
		if (!match('punc',';')) {
		  test = Expression();
		  expect('punc',';');
		}
  
		if (!match('punc',')')) {
		  update = Expression();
		  expect('punc',')');
		}
  
		body = Statement();
		return { type:'ForStatement', init, test, update, body };
	  }
  
	  function TryStmt() {
		expect('kw','try');
		const block = Block();
		let handler = null;
		let finalizer = null;
  
		if (match('kw','catch')) {
		  let param = null;
		  if (match('punc','(')) {
			const idTok = expect('ident');
			param = { type:'Identifier', name:idTok.value, line:idTok.line, col:idTok.col };
			expect('punc',')');
		  }
		  const body = Block();
		  handler = { type:'CatchClause', param, body };
		}
  
		if (match('kw','finally')) {
		  finalizer = Block();
		}
  
		if (!handler && !finalizer) {
		  const t = peek();
		  throw DSyntax('Missing catch or finally after try', t.line, t.col);
		}
  
		return { type:'TryStatement', block, handler, finalizer };
	  }
  
	  function ThrowStmt() {
		expect('kw','throw');
		const argument = Expression();
		match('punc',';');
		return { type:'ThrowStatement', argument };
	  }
  
	  function parseParam() {
		let pattern;
		if (peek().type === 'punc' && (peek().value === '{' || peek().value === '[')) {
		  pattern = BindingPattern();
		} else if (peek().type === 'ident') {
		  pattern = BindingPattern();
		} else {
		  const t = peek();
		  throw DSyntax(`Unexpected token in parameter list: ${t.value}`, t.line, t.col);
		}
  
		let def = null;
		if (match('op','=')) {
		  def = Expression();
		}
  
		return { type:'Param', pattern, default: def };
	  }
  
	  function parseParamList() {
		const params = [];
		if (!(peek().type === 'punc' && peek().value === ')')) {
		  do {
			params.push(parseParam());
		  } while (match('punc',','));
		}
		expect('punc',')');
		return params;
	  }
  
	  function parsePossiblyAsyncFunction(isDeclaration) {
		let isAsync = false;
		if (peek().type === 'kw' && peek().value === 'async') {
		  next(); isAsync = true;
		}
		expect('kw','function');
		let id = null;
		if (isDeclaration) {
		  const nameTok = expect('ident');
		  id = { type:'Identifier', name:nameTok.value, line:nameTok.line, col:nameTok.col };
		} else if (peek().type === 'ident') {
		  const nameTok = next();
		  id = { type:'Identifier', name:nameTok.value, line:nameTok.line, col:nameTok.col };
		}
		expect('punc','(');
		const params = parseParamList();
		expect('punc','{');
		const body = [];
		while (!(peek().type === 'punc' && peek().value === '}')) body.push(Statement());
		expect('punc','}');
		return isDeclaration
		  ? { type:'FunctionDeclaration', id, params, body:{type:'BlockStatement', body}, async:isAsync }
		  : { type:'FunctionExpression', id, params, body:{type:'BlockStatement', body}, async:isAsync };
	  }
  
	  function Expression() { return Assignment(); }
  
	  function Assignment() {
		const left = Conditional();
		const t = peek();
		if (t.type === 'op' && ['=','+=','-=','*=','/=','%='].includes(t.value)) {
		  next();
		  const right = Assignment();
		  if (t.value !== '=') {
			if (!(left.type === 'Identifier' || left.type === 'MemberExpression'))
			  throw DSyntax('Invalid assignment target for compound operator', t.line, t.col);
			return { type:'AssignmentExpression', operator:t.value, left, right };
		  }
		  if (left.type === 'Identifier' || left.type === 'MemberExpression') {
			return { type:'AssignmentExpression', operator:'=', left, right };
		  }
		  if (left.type === 'ObjectExpression' || left.type === 'ArrayExpression') {
			const pattern = ExpressionToBindingPattern(left);
			return { type:'DestructuringAssignment', pattern, right };
		  }
		  throw DSyntax('Invalid assignment target', t.line, t.col);
		}
		return left;
	  }
  
	  function Conditional() {
		let test = Nullish();
		if (match('punc','?')) {
		  const consequent = Expression();
		  expect('punc',':');
		  const alternate = Conditional();
		  return { type:'ConditionalExpression', test, consequent, alternate };
		}
		return test;
	  }
  
	  function Nullish() {
		let n = LogicalOr();
		while (true) {
		  const t = peek();
		  if (t.type === 'op' && t.value === '??') {
			next();
			n = { type:'NullishCoalesceExpression', left:n, right:LogicalOr() };
			continue;
		  }
		  break;
		}
		return n;
	  }
  
	  function LogicalOr() {
		let n = LogicalAnd();
		while (match('op','||')) n = { type:'LogicalExpression', operator:'||', left:n, right:LogicalAnd() };
		return n;
	  }
  
	  function LogicalAnd() {
		let n = Equality();
		while (match('op','&&')) n = { type:'LogicalExpression', operator:'&&', left:n, right:Equality() };
		return n;
	  }
  
	  function Equality() {
		let n = Relational();
		while (true) {
		  const t = peek();
		  if (t.type === 'op' && ['==','!=','===','!=='].includes(t.value)) {
			next();
			n = { type:'BinaryExpression', operator:t.value, left:n, right:Relational() };
		  } else break;
		}
		return n;
	  }
  
	  function Relational() {
		let n = Additive();
		while (true) {
		  const t = peek();
		  if (t.type === 'op' && ['<','<=','>','>='].includes(t.value)) {
			next();
			n = { type:'BinaryExpression', operator:t.value, left:n, right:Additive() };
		  } else break;
		}
		return n;
	  }
  
	  function Additive() {
		let n = Multiplicative();
		while (true) {
		  const t = peek();
		  if (t.type === 'op' && ['+','-'].includes(t.value)) {
			next();
			n = { type:'BinaryExpression', operator:t.value, left:n, right:Multiplicative() };
		  } else break;
		}
		return n;
	  }
  
	  function Multiplicative() {
		let n = Unary();
		while (true) {
		  const t = peek();
		  if (t.type === 'op' && ['*','/','%'].includes(t.value)) {
			next();
			n = { type:'BinaryExpression', operator:t.value, left:n, right:Unary() };
		  } else break;
		}
		return n;
	  }
  
	  function Unary() {
		const t = peek();
  
		if (t.type === 'kw' && t.value === 'await') {
		  next();
		  const arg = Unary();
		  return { type:'AwaitExpression', argument: arg };
		}
  
		if (t.type === 'kw' && t.value === 'delete') {
		  next();
		  const arg = Unary();
		  return { type:'UnaryExpression', operator:'delete', argument: arg };
		}
  
		if (t.type === 'op' && (t.value === '!' || t.value === '+' || t.value === '-')) {
		  next();
		  return { type:'UnaryExpression', operator:t.value, argument: Unary() };
		}
  
		if (t.type === 'op' && (t.value === '++' || t.value === '--')) {
		  next();
		  const arg = Postfix();
		  if (!(arg.type === 'Identifier' || arg.type === 'MemberExpression'))
			throw DSyntax('Invalid update target', t.line, t.col);
		  return { type:'UpdateExpression', operator:t.value, argument:arg, prefix:true };
		}
  
		return Postfix();
	  }
  
	  function Postfix() {
		let node = Primary();
  
		if (peek().type === 'op' && (peek().value === '++' || peek().value === '--')) {
		  const t = next();
		  if (!(node.type === 'Identifier' || node.type === 'MemberExpression'))
			throw DSyntax('Invalid update target', t.line, t.col);
		  node = { type:'UpdateExpression', operator:t.value, argument:node, prefix:false };
		}
  
		while (true) {
		  if (peek().type === 'punc' && peek().value === '?' &&
			  tokens[pos+1]?.type === 'punc' && tokens[pos+1]?.value === '.' &&
			  tokens[pos+2]?.type === 'ident') {
			next(); next();
			const id = expect('ident');
			node = {
			  type:'MemberExpression',
			  object: node,
			  property: { type:'Identifier', name:id.value, line:id.line, col:id.col },
			  computed:false,
			  optional:true
			};
			continue;
		  }
  
		  if (peek().type === 'punc' && peek().value === '?' &&
			  tokens[pos+1]?.type === 'punc' && tokens[pos+1]?.value === '.' &&
			  tokens[pos+2]?.type === 'punc' && tokens[pos+2]?.value === '[') {
			next(); next();
			expect('punc','[');
			const prop = Expression();
			expect('punc',']');
			node = {
			  type:'MemberExpression',
			  object: node,
			  property: prop,
			  computed:true,
			  optional:true
			};
			continue;
		  }
  
		  if (peek().type === 'punc' && peek().value === '?' &&
			  tokens[pos+1]?.type === 'punc' && tokens[pos+1]?.value === '.' &&
			  tokens[pos+2]?.type === 'punc' && tokens[pos+2]?.value === '(') {
			next(); next();
			expect('punc','(');
			const args = [];
			if (!(peek().type === 'punc' && peek().value === ')')) {
			  do {
				if (match('spread','...')) args.push({ type:'SpreadElement', argument:Expression() });
				else args.push(Expression());
			  } while (match('punc',','));
			}
			expect('punc',')');
			node = { type:'CallExpression', callee:node, arguments:args, optional:true };
			continue;
		  }
  
		  if (match('punc','.')) {
			const id = expect('ident');
			node = {
			  type:'MemberExpression',
			  object:node,
			  property:{ type:'Identifier', name:id.value, line:id.line, col:id.col },
			  computed:false
			};
			continue;
		  }
  
		  if (match('punc','[')) {
			const prop = Expression();
			expect('punc',']');
			node = { type:'MemberExpression', object:node, property:prop, computed:true };
			continue;
		  }
  
		  if (match('punc','(')) {
			const args = [];
			if (!(peek().type === 'punc' && peek().value === ')')) {
			  do {
				if (match('spread','...')) args.push({ type:'SpreadElement', argument:Expression() });
				else args.push(Expression());
			  } while (match('punc',','));
			}
			expect('punc',')');
			node = { type:'CallExpression', callee:node, arguments:args };
			continue;
		  }
  
		  break;
		}
		return node;
	  }
  
	  function ArrowFromParams(params, isAsync = false) {
		expect('op','=>');
		if (match('punc','{')) {
		  const body = [];
		  while (!(peek().type === 'punc' && peek().value === '}')) body.push(Statement());
		  expect('punc','}');
		  return {
			type:'ArrowFunctionExpression',
			params,
			body:{ type:'BlockStatement', body },
			expression:false,
			async:isAsync
		  };
		} else {
		  const bodyExpr = Expression();
		  return {
			type:'ArrowFunctionExpression',
			params,
			body:bodyExpr,
			expression:true,
			async:isAsync
		  };
		}
	  }
  
	  function Primary() {
		const t = peek();
  
		if (t.type === 'num') { next(); return { type:'Literal', value:t.value }; }
		if (t.type === 'str') { next(); return { type:'Literal', value:t.value }; }
		if (t.type === 'kw' && t.value === 'true')  { next(); return { type:'Literal', value:true }; }
		if (t.type === 'kw' && t.value === 'false') { next(); return { type:'Literal', value:false }; }
		if (t.type === 'kw' && t.value === 'null')  { next(); return { type:'Literal', value:null }; }
		if (t.type === 'kw' && t.value === 'undefined') { next(); return { type:'Literal', value:undefined }; }
		if (t.type === 'kw' && t.value === 'NaN') { next(); return { type:'Literal', value:NaN }; }
		if (t.type === 'kw' && t.value === 'Infinity') { next(); return { type:'Literal', value:Infinity }; }
  
		if (t.type === 'kw' && t.value === 'async' &&
			tokens[pos+1]?.type === 'ident' &&
			tokens[pos+2]?.type === 'op' && tokens[pos+2]?.value === '=>') {
		  next();
		  const id = next();
		  const pattern = { type:'Identifier', name:id.value, line:id.line, col:id.col };
		  return ArrowFromParams([{ type:'Param', pattern, default:null }], true);
		}
  
		if (t.type === 'kw' && t.value === 'async' &&
			tokens[pos+1]?.type === 'punc' && tokens[pos+1]?.value === '(') {
		  next();
		  expect('punc','(');
		  const params = parseParamList();
		  return ArrowFromParams(params, true);
		}
  
		if (t.type === 'kw' && t.value === 'async' &&
			tokens[pos+1]?.type === 'kw' && tokens[pos+1]?.value === 'function') {
		  return parsePossiblyAsyncFunction(false);
		}
  
		if (t.type === 'kw' && t.value === 'function') return parsePossiblyAsyncFunction(false);
  
		if (t.type === 'ident' &&
			tokens[pos+1]?.type === 'op' && tokens[pos+1]?.value === '=>') {
		  const id = next();
		  const pattern = { type:'Identifier', name:id.value, line:id.line, col:id.col };
		  return ArrowFromParams([{ type:'Param', pattern, default:null }]);
		}
  
		if (t.type === 'ident') {
		  const tok = next();
		  return { type:'Identifier', name:tok.value, line:tok.line, col:tok.col };
		}
  
		if (match('punc','(')) {
		  if (peek().type === 'punc' && peek().value === ')' &&
			  tokens[pos+1]?.type === 'op' && tokens[pos+1]?.value === '=>') {
			expect('punc',')');
			return ArrowFromParams([]);
		  }
  
		  const save = pos;
		  try {
			const tmpParams = [];
			if (!(peek().type === 'punc' && peek().value === ')')) {
			  do {
				tmpParams.push(parseParam());
			  } while (match('punc',','));
			}
			if (match('punc',')') && peek().type === 'op' && peek().value === '=>') {
			  return ArrowFromParams(tmpParams);
			}
		  } catch (_) { /* fall through */ }
		  pos = save;
		  const e = Expression();
		  expect('punc',')');
		  return e;
		}
  
		if (match('punc','[')) {
		  const elements = [];
		  if (!(peek().type === 'punc' && peek().value === ']')) {
			do {
			  if (match('spread','...')) {
				elements.push({ type:'SpreadElement', argument:Expression() });
			  } else {
				elements.push(Expression());
			  }
			} while (match('punc',','));
		  }
		  expect('punc',']');
		  return { type:'ArrayExpression', elements };
		}
  
		if (match('punc','{')) {
		  const properties = [];
		  if (!(peek().type === 'punc' && peek().value === '}')) {
			do {
			  if (match('spread','...')) {
				properties.push({ type:'SpreadElement', argument: Expression() });
			  } else {
				const keyTok = next();
				if (keyTok.type !== 'ident' && keyTok.type !== 'str')
				  throw DSyntax('Invalid object key (identifier/string required)', keyTok.line, keyTok.col);
				const keyName = keyTok.value;
  
				if (peek().type === 'punc' && peek().value === '(') {
				  expect('punc','(');
				  const params = [];
				  if (!(peek().type === 'punc' && peek().value === ')')) {
					do {
					  const p = expect('ident');
					  let def = null;
					  if (match('op','=')) def = Expression();
					  params.push({
						type:'Param',
						pattern:{ type:'Identifier', name:p.value, line:p.line, col:p.col },
						default:def
					  });
					} while (match('punc',','));
				  }
				  expect('punc',')');
				  expect('punc','{');
				  const body = [];
				  while (!(peek().type === 'punc' && peek().value === '}')) body.push(Statement());
				  expect('punc','}');
				  properties.push({
					type:'Property',
					key:{ type:'Identifier', name:keyName, line:keyTok.line, col:keyTok.col },
					value:{ type:'FunctionExpression', id:null, params, body:{ type:'BlockStatement', body } },
					computed:false,
					shorthand:false
				  });
				} else if (match('punc',':')) {
				  const value = Expression();
				  properties.push({
					type:'Property',
					key:{ type:'Identifier', name:keyName, line:keyTok.line, col:keyTok.col },
					value,
					computed:false,
					shorthand:false
				  });
				} else {
				  properties.push({
					type:'Property',
					key:{ type:'Identifier', name:keyName, line:keyTok.line, col:keyTok.col },
					value:{ type:'Identifier', name:keyName, line:keyTok.line, col:keyTok.col },
					computed:false,
					shorthand:true
				  });
				}
			  }
			} while (match('punc',','));
		  }
		  expect('punc','}');
		  return { type:'ObjectExpression', properties };
		}
  
		throw DSyntax(`Unexpected token ${t.value}`, t.line, t.col);
	  }
  
	  function BindingIdentifier() {
		const idTok = expect('ident');
		return { type:'Identifier', name:idTok.value, line:idTok.line, col:idTok.col };
	  }
  
	  function BindingPattern() {
		const t = peek();
		if (t.type === 'punc' && t.value === '{') return ObjectBindingPattern();
		if (t.type === 'punc' && t.value === '[') return ArrayBindingPattern();
		return BindingIdentifier();
	  }
  
	  function ObjectBindingPattern() {
		expect('punc','{');
		const props = [];
		if (!(peek().type === 'punc' && peek().value === '}')) {
		  do {
			if (match('spread','...')) {
			  const arg = BindingIdentifier();
			  props.push({ type:'RestElement', argument: arg });
			  break;
			}
  
			const keyTok = next();
			if (keyTok.type !== 'ident' && keyTok.type !== 'str')
			  throw DSyntax('Invalid object binding key', keyTok.line, keyTok.col);
			const keyName = keyTok.value;
  
			let target;
			if (match('punc',':')) {
			  target = BindingPattern();
			} else {
			  target = { type:'Identifier', name:keyName, line:keyTok.line, col:keyTok.col };
			}
  
			let def = null;
			if (match('op','=')) def = Expression();
  
			props.push({ type:'PatternProperty', key:keyName, target, default:def });
  
		  } while (match('punc',','));
		}
		expect('punc','}');
		return { type:'ObjectPattern', properties: props };
	  }
  
	  function ArrayBindingPattern() {
		expect('punc','[');
		const elements = [];
		if (!(peek().type === 'punc' && peek().value === ']')) {
		  do {
			if (peek().type === 'punc' && peek().value === ',') {
			  elements.push(null);
			  continue;
			}
			if (match('spread','...')) {
			  const arg = BindingPattern();
			  elements.push({ type:'RestElement', argument: arg });
			  break;
			}
			let target = BindingPattern();
			let def = null;
			if (match('op','=')) def = Expression();
			elements.push({ type:'PatternElement', target, default:def });
		  } while (match('punc',','));
		}
		expect('punc',']');
		return { type:'ArrayPattern', elements };
	  }
  
	  function ExpressionToBindingPattern(node) {
		if (node.type === 'ObjectExpression') {
		  const props = [];
		  for (const p of node.properties) {
			if (p.type === 'SpreadElement') {
			  if (p.argument.type !== 'Identifier')
				throw DSyntax('Object rest element must be an identifier');
			  props.push({
				type:'RestElement',
				argument:{ type:'Identifier', name:p.argument.name, line:p.argument.line, col:p.argument.col }
			  });
			} else {
			  const key = p.key.name;
			  let target;
			  let def = null;
  
			  if (p.value.type === 'Identifier') {
				target = { type:'Identifier', name:p.value.name, line:p.value.line, col:p.value.col };
			  } else if (p.value.type === 'AssignmentExpression' && p.value.operator === '=') {
				if (p.value.left.type === 'Identifier') {
				  target = {
					type:'Identifier',
					name:p.value.left.name,
					line:p.value.left.line,
					col:p.value.left.col
				  };
				  def = p.value.right;
				} else {
				  throw DSyntax('Invalid default in object destructuring');
				}
			  } else if (p.value.type === 'ObjectExpression' || p.value.type === 'ArrayExpression') {
				target = ExpressionToBindingPattern(p.value);
			  } else {
				throw DSyntax('Invalid object destructuring target');
			  }
  
			  props.push({ type:'PatternProperty', key, target, default:def });
			}
		  }
		  return { type:'ObjectPattern', properties: props };
		}
  
		if (node.type === 'ArrayExpression') {
		  const elements = [];
		  for (const el of node.elements) {
			if (!el) { elements.push(null); continue; }
			if (el.type === 'SpreadElement') {
			  if (el.argument.type !== 'Identifier')
				throw DSyntax('Array rest element must be an identifier');
			  elements.push({
				type:'RestElement',
				argument:{ type:'Identifier', name:el.argument.name, line:el.argument.line, col:el.argument.col }
			  });
			  continue;
			}
			if (el.type === 'AssignmentExpression' && el.operator === '=') {
			  let target;
			  if (el.left.type === 'Identifier') {
				target = { type:'Identifier', name:el.left.name, line:el.left.line, col:el.left.col };
			  } else if (el.left.type === 'ObjectExpression' || el.left.type === 'ArrayExpression') {
				target = ExpressionToBindingPattern(el.left);
			  } else {
				throw DSyntax('Invalid array destructuring target with default');
			  }
			  elements.push({ type:'PatternElement', target, default:el.right });
			  continue;
			}
			if (el.type === 'Identifier') {
			  elements.push({
				type:'PatternElement',
				target:{ type:'Identifier', name:el.name, line:el.line, col:el.col },
				default:null
			  });
			} else if (el.type === 'ObjectExpression' || el.type === 'ArrayExpression') {
			  elements.push({
				type:'PatternElement',
				target:ExpressionToBindingPattern(el),
				default:null
			  });
			} else {
			  throw DSyntax('Invalid array destructuring element');
			}
		  }
		  return { type:'ArrayPattern', elements };
		}
  
		throw DSyntax('Invalid destructuring left-hand side');
	  }
  
	  return Program();
	}
	function parse(code) {
		return parseTokens(lex(code));
	}

  /* ========================= RUNTIME ========================= */

  class Scope {
	constructor(parent = null) {
	  this.parent = parent;
	  this.map = Object.create(null);
	  this.consts = new Set();
	}

	hasLocal(n) {
	  return Object.prototype.hasOwnProperty.call(this.map, n);
	}

	_getSelf() {
	  let s = this;
	  while (s) {
		if (s.hasLocal('self')) return s.map['self'];
		s = s.parent;
	  }
	  return undefined;
	}

	_getGlobalStore() {
	  return typeof window !== 'undefined' ? window.__global : undefined;
	}

	get(n) {
	  if (n === 'this') return this.get('self');

	  if (this.hasLocal(n)) return this.map[n];

	  if (this.parent) {
		try {
		  return this.parent.get(n);
		} catch (e) {
		  if (!(e && /Unknown identifier/.test(String(e.message)))) throw e;
		}
	  }

	  const selfObj = this._getSelf();
	  if (selfObj && typeof selfObj === 'object') {
		if (BLOCKED_PROPS.has(n))
		  throw DRuntime(`Forbidden property: ${n}`);

		let v = selfObj[n];

		if (typeof v === 'function') {
		  let cache = selfObj[DS_BIND_CACHE];
		  if (!cache) {
			cache = new WeakMap();
			Object.defineProperty(selfObj, DS_BIND_CACHE, {
			  value: cache, configurable:false, enumerable:false, writable:false
			});
		  }
		  let bound = cache.get(v);
		  if (!bound) {
			bound = v.bind(selfObj);
			cache.set(v, bound);
		  }
		  return bound;
		}

		if (v !== undefined) return v;
	  }

	  const g = this._getGlobalStore();
	  if (g && typeof g === 'object') {
		if (BLOCKED_PROPS.has(n))
		  throw DRuntime(`Forbidden property: ${n}`);

		const v = g[n];
		if (v !== undefined) return v;
	  }

	  throw DRuntime(`Unknown identifier: ${n}`);
	}

	set(n, v) {
	  if (this.hasLocal(n)) {
		if (this.consts.has(n))
		  throw DRuntime(`Cannot assign to const ${n}`);
		this.map[n] = v;
		return v;
	  }
	  if (this.parent) return this.parent.set(n, v);

	  const selfObj = this._getSelf();
	  if (selfObj && typeof selfObj === 'object') {
		if (BLOCKED_PROPS.has(n))
		  throw DRuntime(`Forbidden property: ${n}`);
		selfObj[n] = v;
		return v;
	  }

	  throw DRuntime(`Unknown identifier: ${n}`);
	}

	declare(kind, n, v) {
	  if (this.hasLocal(n))
		throw DRuntime(`Identifier already declared: ${n}`);
	  this.map[n] = v;
	  if (kind === 'const') this.consts.add(n);
	}
  }

  function coerceKey(k) {
	if (typeof k === 'number') return String(k);
	if (typeof k === 'string') return k;
	throw DRuntime('Computed key must be string or number');
  }

  const truthy = v => !!v;

  function safeOwnKeys(obj) {
	return Object.keys(obj).filter(k => !BLOCKED_PROPS.has(k));
  }

  function safeGet(obj, key) {
	if (BLOCKED_PROPS.has(key)) throw DRuntime(`Forbidden property: ${key}`);
	return obj[key];
  }

  function evalProgram(ast, rootEnv, { maxSteps = 50_000, maxMillis = null } = {}) {
	let steps = 0;
	let start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
	const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
	const bump = () => {
	  steps++;
	  if (maxMillis != null && (now() - start) > maxMillis)
		throw DRuntime('DamenScript: script exceeded time budget');
	  if (steps > maxSteps)
		throw DRuntime('DamenScript: script too complex');
	};
	const resetBudget = () => {
	  steps = 0;
	  start = now();
	};

	const top = new Scope(null);
	if (rootEnv && typeof rootEnv === 'object')
	  for (const k of Object.keys(rootEnv)) top.declare('const', k, rootEnv[k]);

	const getProp = (obj, key, computed = false) => {
	  const prop = computed ? coerceKey(key) : key;
	  if (BLOCKED_PROPS.has(prop)) throw DRuntime(`Forbidden property: ${prop}`);
	  return obj[prop];
	};
	const setProp = (obj, key, val, computed = false) => {
	  const prop = computed ? coerceKey(key) : key;
	  if (BLOCKED_PROPS.has(prop)) throw DRuntime(`Forbidden property: ${prop}`);
	  obj[prop] = val;
	  return val;
	};
	const deleteProp = (obj, key, computed = false) => {
	  const prop = computed ? coerceKey(key) : key;
	  if (BLOCKED_PROPS.has(prop)) throw DRuntime(`Forbidden property: ${prop}`);
	  return delete obj[prop];
	};

	const RETURN = Symbol('return');

	function bindPatternDeclare(kind, pattern, value, scope) {
	  if (pattern.type === 'ObjectPattern') {
		if (value == null || typeof value !== 'object')
		  throw DRuntime('Cannot destructure non-object');
		const used = new Set();
		for (const p of pattern.properties) {
		  if (p.type === 'RestElement') {
			const out = Object.create(null);
			for (const k of safeOwnKeys(value)) {
			  if (!used.has(k)) out[k] = safeGet(value, k);
			}
			if (p.argument.type !== 'Identifier')
			  throw DRuntime('Object rest must bind to identifier');
			scope.declare(kind, p.argument.name, out);
		  } else {
			const k = p.key;
			const v = Object.prototype.hasOwnProperty.call(value, k) ? safeGet(value, k) : undefined;
			used.add(k);
			const bound = (v === undefined && p.default != null) ? evalNode(p.default, scope) : v;
			bindPatternDeclare(kind, p.target, bound, scope);
		  }
		}
		return;
	  }

	  if (pattern.type === 'ArrayPattern') {
		if (!Array.isArray(value))
		  throw DRuntime('Cannot destructure non-array');
		let i = 0;
		for (const el of pattern.elements) {
		  if (el === null) { i++; continue; }
		  if (el.type === 'RestElement') {
			if (el.argument.type !== 'Identifier')
			  throw DRuntime('Array rest must bind to identifier');
			const restArr = value.slice(i);
			scope.declare(kind, el.argument.name, restArr);
			i = value.length;
			break;
		  }
		  const got = value[i++];
		  const bound = (got === undefined && el.default != null) ? evalNode(el.default, scope) : got;
		  bindPatternDeclare(kind, el.target, bound, scope);
		}
		return;
	  }

	  if (pattern.type === 'Identifier') {
		scope.declare(kind, pattern.name, value);
		return;
	  }

	  throw DRuntime('Unsupported binding pattern');
	}

	function assignPattern(pattern, value, scope) {
	  if (pattern.type === 'ObjectPattern') {
		if (value == null || typeof value !== 'object')
		  throw DRuntime('Cannot destructure non-object');
		const used = new Set();
		for (const p of pattern.properties) {
		  if (p.type === 'RestElement') {
			if (p.argument.type !== 'Identifier')
			  throw DRuntime('Object rest must bind to identifier');
			const out = Object.create(null);
			for (const k of safeOwnKeys(value)) {
			  if (!used.has(k)) out[k] = safeGet(value, k);
			}
			scope.set(p.argument.name, out);
		  } else {
			const k = p.key;
			const v = Object.prototype.hasOwnProperty.call(value, k) ? safeGet(value, k) : undefined;
			used.add(k);
			const bound = (v === undefined && p.default != null) ? evalNode(p.default, scope) : v;
			assignPattern(p.target, bound, scope);
		  }
		}
		return value;
	  }

	  if (pattern.type === 'ArrayPattern') {
		if (!Array.isArray(value))
		  throw DRuntime('Cannot destructure non-array');
		let i = 0;
		for (const el of pattern.elements) {
		  if (el === null) { i++; continue; }
		  if (el.type === 'RestElement') {
			if (el.argument.type !== 'Identifier')
			  throw DRuntime('Array rest must bind to identifier');
			const restArr = value.slice(i);
			scope.set(el.argument.name, restArr);
			i = value.length;
			break;
		  }
		  const got = value[i++];
		  const bound = (got === undefined && el.default != null) ? evalNode(el.default, scope) : got;
		  assignPattern(el.target, bound, scope);
		}
		return value;
	  }

	  if (pattern.type === 'Identifier') {
		return scope.set(pattern.name, value);
	  }

	  throw DRuntime('Unsupported destructuring assignment');
	}

	function bindParams(params, args, parentScope) {
	  const fnScope = new Scope(parentScope);

	  for (let i = 0; i < params.length; i++) {
		const p = params[i];
		const pattern = p.pattern || (p.name ? { type:'Identifier', name:p.name } : null);
		if (!pattern) continue;

		let val;
		if (i < args.length && args[i] !== undefined) {
		  val = args[i];
		} else if (p.default != null) {
		  val = evalNode(p.default, fnScope);
		} else {
		  val = undefined;
		}

		bindPatternDeclare('let', pattern, val, fnScope);
	  }

	  fnScope.declare('let', 'arguments', args);

	  return fnScope;
	}

	function createCallable(params, bodyBlock, parentScope, isAsync = false) {
	  const runner = (...args) => {
		resetBudget();
		const fnScope = bindParams(params, args, parentScope);
		try {
		  let result;
		  if (bodyBlock.type === 'BlockStatement') {
			for (const stmt of bodyBlock.body) result = evalNode(stmt, fnScope);
			return result;
		  }
		  return evalNode(bodyBlock, fnScope);
		} catch (e) {
		  if (e && e.__kind === RETURN) return e.value;
		  throw e;
		}
	  };

	  if (isAsync) {
		return async (...args) => runner(...args);
	  }
	  return runner;
	}

	function evalNode(node, scope = top) {
	  bump();
	  switch (node.type) {
		case 'Program': {
		  let last;
		  for (const s of node.body) last = evalNode(s, scope);
		  return last;
		}
		case 'BlockStatement': {
		  const inner = new Scope(scope);
		  let last;
		  for (const s of node.body) last = evalNode(s, inner);
		  return last;
		}
		case 'ExpressionStatement':
		  return evalNode(node.expression, scope);

		case 'AwaitExpression':
		  throw DRuntime("await is only valid inside async functions", node.line, node.col);

		case 'ReturnStatement': {
		  const val = node.argument ? evalNode(node.argument, scope) : undefined;
		  throw { __kind: RETURN, value: val };
		}

		case 'FunctionDeclaration': {
		  const fn = createCallable(node.params, node.body, scope, !!node.async);
		  scope.declare('const', node.id.name, fn);
		  return undefined;
		}
		case 'FunctionExpression':
		  return createCallable(node.params, node.body, scope, !!node.async);

		case 'VariableDeclaration': {
		  for (const d of node.declarations) {
			if (d.id.type === 'Identifier') {
			  const n = d.id.name;
			  const v = d.init ? evalNode(d.init, scope) : undefined;
			  scope.declare(node.kind, n, v);
			} else if (d.id.type === 'ObjectPattern' || d.id.type === 'ArrayPattern') {
			  if (!d.init) throw DRuntime('Destructuring declaration requires an initializer', node.line, node.col);
			  const v = evalNode(d.init, scope);
			  bindPatternDeclare(node.kind, d.id, v, scope);
			} else {
			  throw DRuntime('Invalid declaration target', node.line, node.col);
			}
		  }
		  return undefined;
		}

		case 'IfStatement':
		  return truthy(evalNode(node.test, scope))
			? evalNode(node.consequent, scope)
			: (node.alternate ? evalNode(node.alternate, scope) : undefined);

		case 'WhileStatement': {
		  let r;
		  while (truthy(evalNode(node.test, scope))) {
			bump();
			r = evalNode(node.body, scope);
		  }
		  return r;
		}

		case 'ForStatement': {
		  const inner = new Scope(scope);
		  if (node.init) evalNode(node.init, inner);
		  let r;
		  while (node.test ? truthy(evalNode(node.test, inner)) : true) {
			bump();
			r = evalNode(node.body, inner);
			if (node.update) evalNode(node.update, inner);
		  }
		  return r;
		}

		case 'ConditionalExpression':
		  return truthy(evalNode(node.test, scope))
			? evalNode(node.consequent, scope)
			: evalNode(node.alternate, scope);

		case 'Literal':
		  return node.value;

		case 'Identifier': {
		  try {
			return scope.get(node.name);
		  } catch (e) {
			if (
			  typeof e?.message === 'string' &&
			  e.message.includes('Unknown identifier:')
			) {
			  throw DRuntime(`Unknown identifier: ${node.name}`, node.line, node.col);
			}
			throw e;
		  }
		}

		case 'ArrayExpression': {
		  const out = [];
		  for (const el of node.elements) {
			if (!el) { out.push(undefined); continue; }
			if (el.type === 'SpreadElement') {
			  const v = evalNode(el.argument, scope);
			  if (Array.isArray(v)) out.push(...v);
			  else throw DRuntime('Spread in array requires an array', node.line, node.col);
			} else {
			  out.push(evalNode(el, scope));
			}
		  }
		  return out;
		}

		case 'ObjectExpression': {
		  const o = Object.create(null);
		  for (const p of node.properties) {
			if (p.type === 'SpreadElement') {
			  const src = evalNode(p.argument, scope);
			  if (src && typeof src === 'object') {
				for (const k of Object.keys(src)) {
				  if (BLOCKED_PROPS.has(k)) throw DRuntime(`Forbidden property: ${k}`, node.line, node.col);
				  o[k] = src[k];
				}
			  } else throw DRuntime('Spread in object requires an object', node.line, node.col);
			} else {
			  const key = p.key.name;
			  o[key] = evalNode(p.value, scope);
			}
		  }
		  return o;
		}

		case 'MemberExpression': {
		  const obj = evalNode(node.object, scope);
		  if (node.optional && (obj == null)) return undefined;
		  if (node.computed) {
			const key = evalNode(node.property, scope);
			return getProp(obj, key, true);
		  } else {
			const key = node.property.name;
			return getProp(obj, key, false);
		  }
		}

		case 'CallExpression': {
		  const calleeNode = node.callee;

		  function evalArgs() {
			const out = [];
			for (const a of node.arguments) {
			  if (a.type === 'SpreadElement') {
				const v = evalNode(a.argument, scope);
				if (Array.isArray(v)) out.push(...v);
				else throw DRuntime('Spread in call requires an array', node.line, node.col);
			  } else {
				out.push(evalNode(a, scope));
			  }
			}
			return out;
		  }

		  if (calleeNode.type === 'MemberExpression') {
			const obj = evalNode(calleeNode.object, scope);
			if (calleeNode.optional && (obj == null)) return undefined;

			let fn;
			if (calleeNode.computed) {
			  const key = evalNode(calleeNode.property, scope);
			  fn = getProp(obj, key, true);
			} else {
			  const key = calleeNode.property.name;
			  fn = getProp(obj, key, false);
			}

			if (node.optional && (fn == null)) return undefined;
			if (typeof fn !== 'function')
			  throw DRuntime('Attempt to call non-function ' + (calleeNode.computed ? '' : calleeNode.property.name), node.line, node.col);

			const args = evalArgs();
			return fn.apply(obj, args);
		  }

		  const fn = evalNode(calleeNode, scope);
		  if (node.optional && (fn == null)) return undefined;
		  if (typeof fn !== 'function') throw DRuntime('Attempt to call non-function', node.line, node.col);
		  const args = evalArgs();
		  return fn.apply(undefined, args);
		}

		case 'NullishCoalesceExpression': {
		  const l = evalNode(node.left, scope);
		  if (l !== null && l !== undefined) return l;
		  return evalNode(node.right, scope);
		}

		case 'ArrowFunctionExpression': {
		  const parentScope = scope;
		  if (node.expression) {
			const runner = (...args) => {
			  resetBudget();
			  const fnScope = bindParams(node.params, args, parentScope);
			  return evalNode(node.body, fnScope);
			};
			return node.async
			  ? async (...args) => runner(...args)
			  : runner;
		  }
		  return createCallable(node.params, node.body, scope, !!node.async);
		}

		case 'UnaryExpression': {
		  if (node.operator === 'delete') {
			const arg = node.argument;

			if (arg.type === 'MemberExpression') {
			  const obj = evalNode(arg.object, scope);
			  if (arg.computed) {
				const key = evalNode(arg.property, scope);
				return deleteProp(obj, key, true);
			  } else {
				const key = arg.property.name;
				return deleteProp(obj, key, false);
			  }
			}

			if (arg.type === 'Identifier') {
			  throw DRuntime('Cannot delete variable binding', node.line, node.col);
			}

			evalNode(arg, scope);
			return true;
		  }

		  const v = evalNode(node.argument, scope);
		  switch (node.operator) {
			case '!': return !v;
			case '+': return +v;
			case '-': return -v;
			default: throw DRuntime(`Unsupported unary ${node.operator}`, node.line, node.col);
		  }
		}

		case 'UpdateExpression': {
		  const op = node.operator;
		  const delta = (op === '++') ? 1 : -1;

		  function read(arg) {
			if (arg.type === 'Identifier')
			  return { kind:'id', name:arg.name, value:scope.get(arg.name) };
			if (arg.type === 'MemberExpression') {
			  const obj = evalNode(arg.object, scope);
			  if (arg.computed) {
				const key = evalNode(arg.property, scope);
				return { kind:'mem', obj, key, computed:true, value:getProp(obj, key, true) };
			  } else {
				const key = arg.property.name;
				return { kind:'mem', obj, key, computed:false, value:getProp(obj, key, false) };
			  }
			}
			throw DRuntime('Invalid update target', node.line, node.col);
		  }

		  const tgt = read(node.argument);
		  const old = Number(tgt.value);
		  if (!Number.isFinite(old)) throw DRuntime('Update operator on non-number', node.line, node.col);
		  const val = old + delta;
		  if (tgt.kind === 'id') scope.set(tgt.name, val);
		  else setProp(tgt.obj, tgt.key, val, tgt.computed);
		  return node.prefix ? val : old;
		}

		case 'BinaryExpression': {
		  const l = evalNode(node.left, scope);
		  const r = evalNode(node.right, scope);
		  switch (node.operator) {
			case '+': return l + r;
			case '-': return l - r;
			case '*': return l * r;
			case '/': return l / r;
			case '%': return l % r;
			case '==': return l == r;
			case '!=': return l != r;
			case '===': return l === r;
			case '!==': return l !== r;
			case '<': return l < r;
			case '<=': return l <= r;
			case '>': return l > r;
			case '>=': return l >= r;
			default: throw DRuntime(`Unsupported binary ${node.operator}`, node.line, node.col);
		  }
		}

		case 'LogicalExpression': {
		  if (node.operator === '&&') {
			const l = evalNode(node.left, scope);
			return l ? evalNode(node.right, scope) : l;
		  }
		  if (node.operator === '||') {
			const l = evalNode(node.left, scope);
			return l ? l : evalNode(node.right, scope);
		  }
		  throw DRuntime(`Unsupported logical ${node.operator}`, node.line, node.col);
		}

		case 'AssignmentExpression': {
		  const op = node.operator;
		  const rhs = evalNode(node.right, scope);
		  const apply = (op, a, b) => {
			switch (op) {
			  case '=':  return b;
			  case '+=': return a + b;
			  case '-=': return a - b;
			  case '*=': return a * b;
			  case '/=': return a / b;
			  case '%=': return a % b;
			  default: throw DRuntime(`Unsupported assignment operator ${op}`, node.line, node.col);
			}
		  };

		  if (node.left.type === 'Identifier') {
			const name = node.left.name;
			const cur = (op === '=') ? undefined : scope.get(name);
			const val = apply(op, cur, rhs);
			return scope.set(name, val);
		  }
		  if (node.left.type === 'MemberExpression') {
			const obj = evalNode(node.left.object, scope);
			if (node.left.computed) {
			  const key = evalNode(node.left.property, scope);
			  const cur = (op === '=') ? undefined : getProp(obj, key, true);
			  const val = apply(op, cur, rhs);
			  return setProp(obj, key, val, true);
			} else {
			  const key = node.left.property.name;
			  const cur = (op === '=') ? undefined : getProp(obj, key, false);
			  const val = apply(op, cur, rhs);
			  return setProp(obj, key, val, false);
			}
		  }
		  throw DRuntime('Invalid assignment target', node.line, node.col);
		}

		case 'DestructuringAssignment': {
		  const v = evalNode(node.right, scope);
		  return assignPattern(node.pattern, v, scope);
		}

		case 'ForInStatement': {
		  const obj = evalNode(node.right, scope);
		  if (obj == null || typeof obj !== 'object') return undefined;
		  const loopScope = new Scope(scope);

		  const setLoopVar = (val) => {
			if (node.left && node.left.kind) {
			  loopScope.declare(node.left.kind, node.left.id.name, val);
			} else {
			  const name = node.left.name;
			  try { loopScope.set(name, val); }
			  catch { loopScope.declare('let', name, val); }
			}
		  };

		  for (const k in obj) {
			if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
			const iterScope = new Scope(loopScope);
			setLoopVar(k);
			evalNode(node.body, iterScope);
		  }
		  return undefined;
		}

		case 'ForOfStatement': {
		  const iterable = evalNode(node.right, scope);
		  if (iterable == null) return undefined;
		  if (typeof iterable[Symbol.iterator] !== 'function')
			throw DRuntime('Right-hand side of for-of is not iterable', node.line, node.col);
		  const loopScope = new Scope(scope);

		  const setLoopVar = (val) => {
			if (node.left && node.left.kind) {
			  loopScope.declare(node.left.kind, node.left.id.name, val);
			} else {
			  const name = node.left.name;
			  try { loopScope.set(name, val); }
			  catch { loopScope.declare('let', name, val); }
			}
		  };

		  for (const v of iterable) {
			const iterScope = new Scope(loopScope);
			setLoopVar(v);
			evalNode(node.body, iterScope);
		  }
		  return undefined;
		}

		case 'ThrowStatement': {
		  const val = node.argument ? evalNode(node.argument, scope) : undefined;
		  throw val;
		}

		case 'TryStatement': {
		  let result;
		  let pending = null;

		  try {
			try {
			  result = evalNode(node.block, scope);
			} catch (e) {
			  if (e && e.__kind === RETURN) {
				pending = e;
			  } else if (node.handler) {
				const catchScope = new Scope(scope);
				if (node.handler.param) {
				  catchScope.declare('let', node.handler.param.name, e);
				}
				result = evalNode(node.handler.body, catchScope);
			  } else {
				pending = e;
			  }
			}
		  } finally {
			if (node.finalizer) {
			  result = evalNode(node.finalizer, scope);
			}
		  }

		  if (pending) throw pending;
		  return result;
		}

		default:
		  throw DRuntime(`Unsupported node type ${node.type}`, node.line, node.col);
	  }
	}

	return evalNode(ast, top);
  }

  async function evalProgramAsync(ast, rootEnv, { maxSteps = 50_000, maxMillis = null } = {}) {
	let steps = 0;
	let start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
	const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
	const bump = () => {
	  steps++;
	  if (maxMillis != null && (now() - start) > maxMillis)
		throw DRuntime('DamenScript: script exceeded time budget');
	  if (steps > maxSteps)
		throw DRuntime('DamenScript: script too complex');
	};
	const resetBudget = () => {
	  steps = 0;
	  start = now();
	};

	const top = new Scope(null);
	if (rootEnv && typeof rootEnv === 'object')
	  for (const k of Object.keys(rootEnv)) top.declare('const', k, rootEnv[k]);

	const getProp = (obj, key, computed = false) => {
	  const prop = computed ? coerceKey(key) : key;
	  if (BLOCKED_PROPS.has(prop)) throw DRuntime(`Forbidden property: ${prop}`);
	  return obj[prop];
	};
	const setProp = (obj, key, val, computed = false) => {
	  const prop = computed ? coerceKey(key) : key;
	  if (BLOCKED_PROPS.has(prop)) throw DRuntime(`Forbidden property: ${prop}`);
	  obj[prop] = val;
	  return val;
	};
	const deleteProp = (obj, key, computed = false) => {
	  const prop = computed ? coerceKey(key) : key;
	  if (BLOCKED_PROPS.has(prop)) throw DRuntime(`Forbidden property: ${prop}`);
	  return delete obj[prop];
	};

	const RETURN = Symbol('return');

	async function bindPatternDeclare(kind, pattern, value, scope) {
	  if (pattern.type === 'ObjectPattern') {
		if (value == null || typeof value !== 'object')
		  throw DRuntime('Cannot destructure non-object');
		const used = new Set();
		for (const p of pattern.properties) {
		  if (p.type === 'RestElement') {
			if (p.argument.type !== 'Identifier')
			  throw DRuntime('Object rest must bind to identifier');
			const out = Object.create(null);
			for (const k of safeOwnKeys(value)) {
			  if (!used.has(k)) out[k] = safeGet(value, k);
			}
			scope.declare(kind, p.argument.name, out);
		  } else {
			const k = p.key;
			const v = Object.prototype.hasOwnProperty.call(value, k) ? safeGet(value, k) : undefined;
			used.add(k);
			const bound = (v === undefined && p.default != null) ? await evalNode(p.default, scope) : v;
			await bindPatternDeclare(kind, p.target, bound, scope);
		  }
		}
		return;
	  }

	  if (pattern.type === 'ArrayPattern') {
		if (!Array.isArray(value))
		  throw DRuntime('Cannot destructure non-array');
		let i = 0;
		for (const el of pattern.elements) {
		  if (el === null) { i++; continue; }
		  if (el.type === 'RestElement') {
			if (el.argument.type !== 'Identifier')
			  throw DRuntime('Array rest must bind to identifier');
			const restArr = value.slice(i);
			scope.declare(kind, el.argument.name, restArr);
			i = value.length;
			break;
		  }
		  const got = value[i++];
		  const bound = (got === undefined && el.default != null) ? await evalNode(el.default, scope) : got;
		  await bindPatternDeclare(kind, el.target, bound, scope);
		}
		return;
	  }

	  if (pattern.type === 'Identifier') {
		scope.declare(kind, pattern.name, value);
		return;
	  }

	  throw DRuntime('Unsupported binding pattern');
	}

	async function assignPattern(pattern, value, scope) {
	  if (pattern.type === 'ObjectPattern') {
		if (value == null || typeof value !== 'object')
		  throw DRuntime('Cannot destructure non-object');
		const used = new Set();
		for (const p of pattern.properties) {
		  if (p.type === 'RestElement') {
			if (p.argument.type !== 'Identifier')
			  throw DRuntime('Object rest must bind to identifier');
			const out = Object.create(null);
			for (const k of safeOwnKeys(value)) {
			  if (!used.has(k)) out[k] = safeGet(value, k);
			}
			scope.set(p.argument.name, out);
		  } else {
			const k = p.key;
			const v = Object.prototype.hasOwnProperty.call(value, k) ? safeGet(value, k) : undefined;
			used.add(k);
			const bound = (v === undefined && p.default != null) ? await evalNode(p.default, scope) : v;
			await assignPattern(p.target, bound, scope);
		  }
		}
		return value;
	  }

	  if (pattern.type === 'ArrayPattern') {
		if (!Array.isArray(value))
		  throw DRuntime('Cannot destructure non-array');
		let i = 0;
		for (const el of pattern.elements) {
		  if (el === null) { i++; continue; }
		  if (el.type === 'RestElement') {
			if (el.argument.type !== 'Identifier')
			  throw DRuntime('Array rest must bind to identifier');
			const restArr = value.slice(i);
			scope.set(el.argument.name, restArr);
			i = value.length;
			break;
		  }
		  const got = value[i++];
		  const bound = (got === undefined && el.default != null) ? await evalNode(el.default, scope) : got;
		  await assignPattern(el.target, bound, scope);
		}
		return value;
	  }

	  if (pattern.type === 'Identifier') {
		return scope.set(pattern.name, value);
	  }

	  throw DRuntime('Unsupported destructuring assignment');
	}

	async function bindParams(params, args, parentScope) {
	  const fnScope = new Scope(parentScope);

	  for (let i = 0; i < params.length; i++) {
		const p = params[i];
		const pattern = p.pattern || (p.name ? { type:'Identifier', name:p.name } : null);
		if (!pattern) continue;

		let val;
		if (i < args.length && args[i] !== undefined) {
		  val = args[i];
		} else if (p.default != null) {
		  val = await evalNode(p.default, fnScope);
		} else {
		  val = undefined;
		}

		await bindPatternDeclare('let', pattern, val, fnScope);
	  }

	  fnScope.declare('let', 'arguments', args);
	  return fnScope;
	}

	function createCallable(params, bodyBlock, parentScope, isAsync = false) {
	  const runner = async (...args) => {
		resetBudget();
		const fnScope = await bindParams(params, args, parentScope);
		try {
		  let result;
		  if (bodyBlock.type === 'BlockStatement') {
			for (const stmt of bodyBlock.body) result = await evalNode(stmt, fnScope);
			return result;
		  }
		  return await evalNode(bodyBlock, fnScope);
		} catch (e) {
		  if (e && e.__kind === RETURN) return e.value;
		  throw e;
		}
	  };

	  return isAsync
		? runner
		: function (...args) { return runner(...args); };
	}

	async function evalNode(node, scope = top) {
	  bump();
	  switch (node.type) {
		case 'Program': {
		  let last;
		  for (const s of node.body) last = await evalNode(s, scope);
		  return last;
		}
		case 'BlockStatement': {
		  const inner = new Scope(scope);
		  let last;
		  for (const s of node.body) last = await evalNode(s, inner);
		  return last;
		}
		case 'ExpressionStatement':
		  return await evalNode(node.expression, scope);

		case 'ReturnStatement': {
		  const val = node.argument ? await evalNode(node.argument, scope) : undefined;
		  throw { __kind: RETURN, value: val };
		}

		case 'FunctionDeclaration': {
		  const fn = createCallable(node.params, node.body, scope, !!node.async);
		  scope.declare('const', node.id.name, fn);
		  return undefined;
		}
		case 'FunctionExpression':
		  return createCallable(node.params, node.body, scope, !!node.async);

		case 'ArrowFunctionExpression': {
		  const isAsync = !!node.async;

		  if (node.expression) {
			const parentScope = scope;
			const runner = async (...args) => {
			  resetBudget();
			  const fnScope = await bindParams(node.params, args, parentScope);
			  return await evalNode(node.body, fnScope);
			};
			return isAsync
			  ? runner
			  : function (...args) { return runner(...args); };
		  }

		  return createCallable(node.params, node.body, scope, isAsync);
		}

		case 'AwaitExpression':
		  return await evalNode(node.argument, scope);

		case 'VariableDeclaration': {
		  for (const d of node.declarations) {
			if (d.id.type === 'Identifier') {
			  const n = d.id.name;
			  const v = d.init ? await evalNode(d.init, scope) : undefined;
			  scope.declare(node.kind, n, v);
			} else if (d.id.type === 'ObjectPattern' || d.id.type === 'ArrayPattern') {
			  if (!d.init) throw DRuntime('Destructuring declaration requires an initializer', node.line, node.col);
			  const v = await evalNode(d.init, scope);
			  await bindPatternDeclare(node.kind, d.id, v, scope);
			} else {
			  throw DRuntime('Invalid declaration target', node.line, node.col);
			}
		  }
		  return undefined;
		}

		case 'IfStatement':
		  return truthy(await evalNode(node.test, scope))
			? await evalNode(node.consequent, scope)
			: (node.alternate ? await evalNode(node.alternate, scope) : undefined);

		case 'WhileStatement': {
		  let r;
		  while (truthy(await evalNode(node.test, scope))) {
			bump();
			r = await evalNode(node.body, scope);
		  }
		  return r;
		}

		case 'ForStatement': {
		  const inner = new Scope(scope);
		  if (node.init) await evalNode(node.init, inner);
		  let r;
		  while (node.test ? truthy(await evalNode(node.test, inner)) : true) {
			bump();
			r = await evalNode(node.body, inner);
			if (node.update) await evalNode(node.update, inner);
		  }
		  return r;
		}

		case 'ConditionalExpression':
		  return truthy(await evalNode(node.test, scope))
			? await evalNode(node.consequent, scope)
			: await evalNode(node.alternate, scope);

		case 'Literal':
		  return node.value;

		case 'Identifier': {
		  try {
			return scope.get(node.name);
		  } catch (e) {
			if (
			  typeof e?.message === 'string' &&
			  e.message.includes('Unknown identifier:')
			) {
			  throw DRuntime(`Unknown identifier: ${node.name}`, node.line, node.col);
			}
			throw e;
		  }
		}

		case 'ArrayExpression': {
		  const out = [];
		  for (const el of node.elements) {
			if (!el) { out.push(undefined); continue; }
			if (el.type === 'SpreadElement') {
			  const v = await evalNode(el.argument, scope);
			  if (Array.isArray(v)) out.push(...v);
			  else throw DRuntime('Spread in array requires an array', node.line, node.col);
			} else {
			  out.push(await evalNode(el, scope));
			}
		  }
		  return out;
		}

		case 'ObjectExpression': {
		  const o = Object.create(null);
		  for (const p of node.properties) {
			if (p.type === 'SpreadElement') {
			  const src = await evalNode(p.argument, scope);
			  if (src && typeof src === 'object') {
				for (const k of Object.keys(src)) {
				  if (BLOCKED_PROPS.has(k)) throw DRuntime(`Forbidden property: ${k}`, node.line, node.col);
				  o[k] = src[k];
				}
			  } else throw DRuntime('Spread in object requires an object', node.line, node.col);
			} else {
			  const key = p.key.name;
			  o[key] = await evalNode(p.value, scope);
			}
		  }
		  return o;
		}

		case 'MemberExpression': {
		  const obj = await evalNode(node.object, scope);
		  if (node.optional && (obj == null)) return undefined;
		  if (node.computed) {
			const key = await evalNode(node.property, scope);
			return getProp(obj, key, true);
		  } else {
			const key = node.property.name;
			return getProp(obj, key, false);
		  }
		}

		case 'CallExpression': {
		  const calleeNode = node.callee;

		  async function evalArgs() {
			const out = [];
			for (const a of node.arguments) {
			  if (a.type === 'SpreadElement') {
				const v = await evalNode(a.argument, scope);
				if (Array.isArray(v)) out.push(...v);
				else throw DRuntime('Spread in call requires an array', node.line, node.col);
			  } else {
				out.push(await evalNode(a, scope));
			  }
			}
			return out;
		  }

		  if (calleeNode.type === 'MemberExpression') {
			const obj = await evalNode(calleeNode.object, scope);
			if (calleeNode.optional && (obj == null)) return undefined;

			let fn;
			if (calleeNode.computed) {
			  const key = await evalNode(calleeNode.property, scope);
			  fn = getProp(obj, key, true);
			} else {
			  const key = calleeNode.property.name;
			  fn = getProp(obj, key, false);
			}

			if (node.optional && (fn == null)) return undefined;
			if (typeof fn !== 'function')
			  throw DRuntime('Attempt to call non-function ' + (calleeNode.computed ? '' : calleeNode.property.name), node.line, node.col);

			const args = await evalArgs();
			const result = fn.apply(obj, args);
			if (result && typeof result.then === 'function')
			  return await result;
			return result;
		  }

		  const fn = await evalNode(calleeNode, scope);
		  if (node.optional && (fn == null)) return undefined;
		  if (typeof fn !== 'function') throw DRuntime('Attempt to call non-function', node.line, node.col);

		  const args = await evalArgs();
		  const result = fn.apply(undefined, args);
		  if (result && typeof result.then === 'function')
			return await result;
		  return result;
		}

		case 'NullishCoalesceExpression': {
		  const l = await evalNode(node.left, scope);
		  if (l !== null && l !== undefined) return l;
		  return await evalNode(node.right, scope);
		}

		case 'UnaryExpression': {
		  if (node.operator === 'delete') {
			const arg = node.argument;

			if (arg.type === 'MemberExpression') {
			  const obj = await evalNode(arg.object, scope);
			  if (arg.computed) {
				const key = await evalNode(arg.property, scope);
				return deleteProp(obj, key, true);
			  } else {
				const key = arg.property.name;
				return deleteProp(obj, key, false);
			  }
			}

			if (arg.type === 'Identifier') {
			  throw DRuntime('Cannot delete variable binding', node.line, node.col);
			}

			await evalNode(arg, scope);
			return true;
		  }

		  const v = await evalNode(node.argument, scope);
		  switch (node.operator) {
			case '!': return !v;
			case '+': return +v;
			case '-': return -v;
			default: throw DRuntime(`Unsupported unary ${node.operator}`, node.line, node.col);
		  }
		}

		case 'UpdateExpression': {
		  const op = node.operator;
		  const delta = (op === '++') ? 1 : -1;

		  async function read(arg) {
			if (arg.type === 'Identifier')
			  return { kind:'id', name:arg.name, value:scope.get(arg.name) };
			if (arg.type === 'MemberExpression') {
			  const obj = await evalNode(arg.object, scope);
			  if (arg.computed) {
				const key = await evalNode(arg.property, scope);
				return { kind:'mem', obj, key, computed:true, value:getProp(obj, key, true) };
			  } else {
				const key = arg.property.name;
				return { kind:'mem', obj, key, computed:false, value:getProp(obj, key, false) };
			  }
			}
			throw DRuntime('Invalid update target', node.line, node.col);
		  }

		  const tgt = await read(node.argument);
		  const old = Number(tgt.value);
		  if (!Number.isFinite(old)) throw DRuntime('Update operator on non-number', node.line, node.col);
		  const val = old + delta;
		  if (tgt.kind === 'id') scope.set(tgt.name, val);
		  else setProp(tgt.obj, tgt.key, val, tgt.computed);
		  return node.prefix ? val : old;
		}

		case 'BinaryExpression': {
		  const l = await evalNode(node.left, scope);
		  const r = await evalNode(node.right, scope);
		  switch (node.operator) {
			case '+': return l + r;
			case '-': return l - r;
			case '*': return l * r;
			case '/': return l / r;
			case '%': return l % r;
			case '==': return l == r;
			case '!=': return l != r;
			case '===': return l === r;
			case '!==': return l !== r;
			case '<': return l < r;
			case '<=': return l <= r;
			case '>': return l > r;
			case '>=': return l >= r;
			default: throw DRuntime(`Unsupported binary ${node.operator}`, node.line, node.col);
		  }
		}

		case 'LogicalExpression': {
		  if (node.operator === '&&') {
			const l = await evalNode(node.left, scope);
			return l ? await evalNode(node.right, scope) : l;
		  }
		  if (node.operator === '||') {
			const l = await evalNode(node.left, scope);
			return l ? l : await evalNode(node.right, scope);
		  }
		  throw DRuntime(`Unsupported logical ${node.operator}`, node.line, node.col);
		}

		case 'AssignmentExpression': {
		  const op = node.operator;
		  const rhs = await evalNode(node.right, scope);
		  const apply = (op, a, b) => {
			switch (op) {
			  case '=':  return b;
			  case '+=': return a + b;
			  case '-=': return a - b;
			  case '*=': return a * b;
			  case '/=': return a / b;
			  case '%=': return a % b;
			  default: throw DRuntime(`Unsupported assignment operator ${op}`, node.line, node.col);
			}
		  };

		  if (node.left.type === 'Identifier') {
			const name = node.left.name;
			const cur = (op === '=') ? undefined : scope.get(name);
			const val = apply(op, cur, rhs);
			return scope.set(name, val);
		  }
		  if (node.left.type === 'MemberExpression') {
			const obj = await evalNode(node.left.object, scope);
			if (node.left.computed) {
			  const key = await evalNode(node.left.property, scope);
			  const cur = (op === '=') ? undefined : getProp(obj, key, true);
			  const val = apply(op, cur, rhs);
			  return setProp(obj, key, val, true);
			} else {
			  const key = node.left.property.name;
			  const cur = (op === '=') ? undefined : getProp(obj, key, false);
			  const val = apply(op, cur, rhs);
			  return setProp(obj, key, val, false);
			}
		  }
		  throw DRuntime('Invalid assignment target', node.line, node.col);
		}

		case 'DestructuringAssignment': {
		  const v = await evalNode(node.right, scope);
		  return await assignPattern(node.pattern, v, scope);
		}

		case 'ForInStatement': {
		  const obj = await evalNode(node.right, scope);
		  if (obj == null || typeof obj !== 'object') return undefined;
		  const loopScope = new Scope(scope);

		  const setLoopVar = async (val) => {
			if (node.left && node.left.kind) {
			  loopScope.declare(node.left.kind, node.left.id.name, val);
			} else {
			  const name = node.left.name;
			  try { loopScope.set(name, val); }
			  catch { loopScope.declare('let', name, val); }
			}
		  };

		  for (const k in obj) {
			if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
			const iterScope = new Scope(loopScope);
			await setLoopVar(k);
			await evalNode(node.body, iterScope);
		  }
		  return undefined;
		}

		case 'ForOfStatement': {
		  const iterable = await evalNode(node.right, scope);
		  if (iterable == null) return undefined;
		  if (typeof iterable[Symbol.iterator] !== 'function')
			throw DRuntime('Right-hand side of for-of is not iterable', node.line, node.col);
		  const loopScope = new Scope(scope);

		  const setLoopVar = async (val) => {
			if (node.left && node.left.kind) {
			  loopScope.declare(node.left.kind, node.left.id.name, val);
			} else {
			  const name = node.left.name;
			  try { loopScope.set(name, val); }
			  catch { loopScope.declare('let', name, val); }
			}
		  };

		  for (const v of iterable) {
			const iterScope = new Scope(loopScope);
			await setLoopVar(v);
			await evalNode(node.body, iterScope);
		  }
		  return undefined;
		}

		case 'ThrowStatement': {
		  const val = node.argument ? await evalNode(node.argument, scope) : undefined;
		  throw val;
		}

		case 'TryStatement': {
		  let result;
		  let pending = null;

		  try {
			try {
			  result = await evalNode(node.block, scope);
			} catch (e) {
			  if (e && e.__kind === RETURN) {
				pending = e;
			  } else if (node.handler) {
				const catchScope = new Scope(scope);
				if (node.handler.param) {
				  catchScope.declare('let', node.handler.param.name, e);
				}
				result = await evalNode(node.handler.body, catchScope);
			  } else {
				pending = e;
			  }
			}
		  } finally {
			if (node.finalizer) {
			  result = await evalNode(node.finalizer, scope);
			}
		  }

		  if (pending) throw pending;
		  return result;
		}

		default:
		  throw DRuntime(`Unsupported node type ${node.type}`, node.line, node.col);
	  }
	}

	return await evalNode(ast, top);
  }

  function hasTopLevelAwait(ast) {
	let found = false;
	(function walk(node, inFunc) {
	  if (!node || found) return;
	  if (node.type === 'AwaitExpression' && !inFunc) {
		found = true; return;
	  }
	  const entersFunc =
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression';
	  for (const k in node) {
		const v = node[k];
		if (!v || typeof v !== 'object') continue;
		if (Array.isArray(v)) {
		  for (const ch of v) walk(ch, inFunc || entersFunc);
		} else {
		  walk(v, inFunc || entersFunc);
		}
	  }
	})(ast, false);
	return found;
  }

  return {
	  lex,
	  preflight,
	  parse,
	  parseTokens,
	  evalProgram,
	  evalProgramAsync,
	  hasTopLevelAwait
  };
}

/* ------------------------------------------------------------------ */
/*   Public API                                                       */
/* ------------------------------------------------------------------ */

// Default core (no contextId) for parse()
const defaultErrors = makeErrorFactory(null);
const defaultCore = createCore(defaultErrors.DSyntax, defaultErrors.DRuntime);

const DS_COMPILE_CACHE = new Map(); // key -> { pf, ast, isAsync }
const DS_CORE_CACHE = new Map();

function getCoreForContext(contextId) {
	const key = contextId ?? '';
	let core = DS_CORE_CACHE.get(key);
	if(core)
		return core;

	const errs = makeErrorFactory(contextId ?? null);
	core = createCore(errs.DSyntax, errs.DRuntime);

	DS_CORE_CACHE.set(key, core);
	return core;
}
function compile(code, opts = {}) {
	const {
		contextId = null
	} = opts || {};

	const core = getCoreForContext(contextId);

	// cache key: context + exact code
	const key = (contextId ?? '') + '\n' + code;

	let c = DS_COMPILE_CACHE.get(key);
	if(c)
		return c;

	const pf = core.preflight(code);
	const ast = core.parseTokens ? core.parseTokens(pf.tokens) : core.parse(code);

	c = {
		contextId,
		pf,
		ast,
		isAsync: !!(pf.hasAwait || pf.hasAsync)
	};

	DS_COMPILE_CACHE.set(key, c);
	return c;
}

async function run(code, env = {}, opts = {}) {
	const {
		contextId = null,
		maxSteps = 50_000,
		maxMillis = null
	} = opts || {};

	const core = getCoreForContext(contextId);
	const c = compile(code, { contextId });

	// cheaper than spread (also avoids creating intermediate objects)
	const mergedEnv = Object.create(null);
	Object.assign(mergedEnv, BASIC_ENV, env);

	if(c.isAsync)
		return await core.evalProgramAsync(c.ast, mergedEnv, { maxSteps, maxMillis });

	return core.evalProgram(c.ast, mergedEnv, { maxSteps, maxMillis });
}

const DamenScript = {
	parse: defaultCore.parse,
	compile,
	run
};

export default DamenScript;