/* DamenScript — safe, tiny JS-like interpreter (with default parameters)
   ----------------------------------------------------------------------
   Blocks: window, document, globalThis, eval, Function, require, process, import, new
   `this` is an alias of `self` (provide self in env as needed)
*/

import { 
	FORBIDDEN_KEYWORDS,
	FORBIDDEN_PROPS
} from './damenscript-schema.js';

Math.lerp = (a, b, time, easeFn) => {
	const fn = easeFn || Tween.Linear;
	const u  = Math.max(0, Math.min(1, time));
	return a + (b - a) * fn(u);
};

const DamenScript = (() => {
  // ===== Utilities / Guards =====
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
  	isFinite, Math: SAFE_MATH
  });

  const isWS = c => c === ' ' || c === '\t' || c === '\r' || c === '\n';
  const isIdStart = c => /[A-Za-z_$]/.test(c);
  const isId = c => /[A-Za-z0-9_$]/.test(c);
  const isDigit = c => /[0-9]/.test(c);

  function DSyntax(msg, line=0, col=0) {
	  const e = new Error(`${msg}${line ? ` (line ${line}, col ${col})` : ''}`);
	  e.name = 'DamenScriptSyntaxError';
	  return e;
  }
  
  function DRuntime(msg, line=0, col=0) {
	  const e = new Error(`${msg}${line && col ? ` (line ${line}, col ${col})` : ''}`);
	  e.name = 'DamenScriptRuntimeError';
	  return e;
  }

  // ===== Lexer =====
  const KEYWORDS = new Set([
	'let','const','var','if','else','while','for','true','false','null',
	'function','return','undefined','NaN','Infinity'
  ]);
  const PUNCT = new Set(['(',')','{','}','[',']',';',',','.',':','?']);
  const TWO_CHAR_OPS = new Set([
	'==','!=','<=','>=','&&','||','===','!==','++','--','=>',
	'+=','-=','*=','/=','%=', '??'
  ]);
  const ONE_CHAR_OPS = new Set(['=','+','-','*','/','%','<','>','!']);

  function lex(input) {
	let i=0, line=1, col=1;
	const tokens=[];
	const peek=(k=0)=>input[i+k] ?? '';
	const adv=(n=1)=>{
	  let ch=''; while(n--){ ch=input[i++] ?? ''; if(ch==='\n'){line++; col=1;} else col++; }
	  return ch;
	};
	const add=(type,value)=>tokens.push({type,value,line,col});

	const skipWS = () => {
	  while (true) {
		if (isWS(peek())) { adv(); continue; }
		if (peek()==='/' && peek(1)==='/') { while (peek() && peek()!=='\n') adv(); continue; }
		if (peek()==='/' && peek(1)==='*') { adv(2); while (peek() && !(peek()==='*'&&peek(1)==='/')) adv(); if (peek()) adv(2); continue; }
		break;
	  }
	};

	while (i < input.length) {
	  skipWS();
	  const ch = peek();
	  if (!ch) break;

	  // spread ...
	  if (ch==='.' && peek(1)==='.' && peek(2)==='.') { add('spread','...'); adv(3); continue; }

	  // string
	  if (ch === '"' || ch === "'") {
		const q=adv(); let s='';
		while (peek() && peek() !== q) {
		  const c = adv();
		  if (c === '\\') {
			const n = adv();
			const map={n:'\n',r:'\r',t:'\t','"':'"',"\'":"'",'\\':'\\'};
			s += map[n] ?? n;
		  } else s += c;
		}
		if (peek() !== q) throw DSyntax('Unterminated string', line, col);
		adv(); add('str', s); continue;
	  }

	  // number
	  if (isDigit(ch) || (ch==='.' && isDigit(peek(1)))) {
		let num=''; if (ch === '.') num += adv();
		while (isDigit(peek())) num += adv();
		if (peek() === '.') { num += adv(); while (isDigit(peek())) num += adv(); }
		if (/[eE]/.test(peek())) { num += adv(); if (/[+-]/.test(peek())) num += adv(); while (isDigit(peek())) num += adv(); }
		add('num', Number(num)); continue;
	  }

	  // identifier / keyword
	  if (isIdStart(ch)) {
		let id = adv();
		while (isId(peek())) id += adv();
		if (KEYWORDS.has(id)) add('kw', id); else add('ident', id);
		continue;
	  }

	  // punctuation
	  if (PUNCT.has(ch)) { add('punc', adv()); continue; }

	  // operators
	  const three = ch + (peek(1) ?? '') + (peek(2) ?? '');
	  const two = ch + (peek(1) ?? '');
	  if (TWO_CHAR_OPS.has(three)) { add('op', three); adv(3); continue; }
	  if (TWO_CHAR_OPS.has(two)) { add('op', two); adv(2); continue; }
	  if (ONE_CHAR_OPS.has(ch)) { add('op', adv()); continue; }

	  throw DSyntax(`Unexpected character '${ch}'`, line, col);
	}
	tokens.push({type:'eof', value:'<eof>', line, col});
	return tokens;
  }

  // Token-aware preflight
  function preflight(code) {
	const tokens = lex(code);
	for (const t of tokens) {
	  if ((t.type==='ident' || t.type==='kw') && FORBIDDEN_NAMES.has(t.value)) {
		if (t.value === 'new') throw DSyntax("DamenScript: 'new' is not supported; use factory functions (e.g., Vector3())", t.line, t.col);
		if (t.value === 'import') throw DSyntax("DamenScript: 'import' is not supported", t.line, t.col);
		throw DSyntax(`DamenScript: forbidden identifier: ${t.value}`, t.line, t.col);
	  }
	}
  }

  // ===== Parser =====
  function parse(code) {
	const tokens = lex(code);
	let pos=0;
	const peek=()=>tokens[pos];
	const next=()=>tokens[pos++];
	const match=(type,value)=>{ const t=peek(); if(t.type===type && (value===undefined || t.value===value)){ next(); return true; } return false; };
	const expect=(type,value)=>{ const t=next(); if(!t || t.type!==type || (value!==undefined && t.value!==value)){ throw DSyntax(`Expected ${value ?? type} but got ${t?.value ?? t?.type}`, t?.line ?? 0, t?.col ?? 0); } return t; };

	function Program(){ const body=[]; while(peek().type!=='eof') body.push(Statement()); return {type:'Program', body}; }

	function Statement(){
	  const t=peek();
	  if (t.type==='kw' && t.value==='function') return parseFunction(true);
	  if (t.type==='kw' && (t.value==='let'||t.value==='const'||t.value==='var')) return VarDecl();
	  if (t.type==='kw' && t.value==='if') return IfStmt();
	  if (t.type==='kw' && t.value==='while') return WhileStmt();
	  if (t.type==='kw' && t.value==='for') return ForStmt();
	  if (t.type==='kw' && t.value==='return') {
		next();
		const hasExpr = !(peek().type==='punc' && peek().value===';');
		const argument = hasExpr ? Expression() : null;
		match('punc',';');
		return { type:'ReturnStatement', argument };
	  }
	  if (t.type==='punc' && t.value==='{') return Block();
	  const expr = Expression(); match('punc',';'); return { type:'ExpressionStatement', expression:expr };
	}

	function Block(){ expect('punc','{'); const body=[]; while(!(peek().type==='punc'&&peek().value==='}')) body.push(Statement()); expect('punc','}'); return {type:'BlockStatement', body}; }

	function VarDecl(){
	  const kind=next().value; const declarations=[];
	  do {
		const idTok=expect('ident'); let init=null;
		if (match('op','=')) init=Expression();
		declarations.push({ type:'VariableDeclarator', id:{type:'Identifier',name:idTok.value}, init });
	  } while (match('punc',','));
	  match('punc',';');
	  return { type:'VariableDeclaration', kind, declarations };
	}

	function IfStmt(){
	  expect('kw','if'); expect('punc','('); const test=Expression(); expect('punc',')');
	  const consequent=Statement(); let alternate=null; if (match('kw','else')) alternate=Statement();
	  return { type:'IfStatement', test, consequent, alternate };
	}

	function WhileStmt(){
	  expect('kw','while'); expect('punc','('); const test=Expression(); expect('punc',')'); const body=Statement();
	  return { type:'WhileStatement', test, body };
	}

	function ForStmt(){
	  expect('kw','for'); expect('punc','(');
	  let init=null, test=null, update=null;
	  if (!match('punc',';')){
		if (peek().type==='kw' && (peek().value==='let'||peek().value==='const'||peek().value==='var')) init=VarDecl();
		else { init=Expression(); match('punc',';'); }
	  }
	  if (!match('punc',';')) { test=Expression(); expect('punc',';'); }
	  if (!match('punc',')')) { update=Expression(); expect('punc',')'); }
	  const body=Statement();
	  return { type:'ForStatement', init, test, update, body };
	}

	// ---- Param list with defaults: returns [{name, default:null|expr}, ...]
	function parseParamList() {
	  const params=[];
	  if (!(peek().type==='punc' && peek().value===')')) {
		do {
		  const idTok = expect('ident');
		  let def = null;
		  if (match('op','=')) {
			def = Expression(); // default expression
		  }
		  params.push({ type:'Param', name:idTok.value, default:def });
		} while (match('punc',','));
	  }
	  expect('punc',')');
	  return params;
	}

	// ---- Functions ----
	function parseFunction(isDeclaration){
	  expect('kw','function');
	  let id=null;
	  if (isDeclaration) {
		const nameTok = expect('ident');
		id = { type:'Identifier', name:nameTok.value };
	  } else {
		if (peek().type==='ident') { const nameTok=next(); id={type:'Identifier', name:nameTok.value}; }
	  }
	  expect('punc','(');
	  const params = parseParamList(); // supports defaults
	  expect('punc','{');
	  const body=[];
	  while (!(peek().type==='punc' && peek().value==='}')) body.push(Statement());
	  expect('punc','}');
	  if (isDeclaration) return { type:'FunctionDeclaration', id, params, body:{type:'BlockStatement', body} };
	  return { type:'FunctionExpression', id, params, body:{type:'BlockStatement', body} };
	}

	// ---- Expressions ----
	function Expression(){ return Assignment(); }

	function Assignment(){
	  const left = Conditional();
	  const t = peek();
	  if (t.type==='op' && ['=','+=','-=','*=','/=','%='].includes(t.value)) {
		next();
		const right = Assignment(); // right-assoc
		if (!(left.type==='Identifier' || left.type==='MemberExpression')) throw DSyntax('Invalid assignment target', t.line, t.col);
		return { type:'AssignmentExpression', operator:t.value, left, right };
	  }
	  return left;
	}

	function Conditional(){
		let test = Nullish();
		if (match('punc','?')) {
			const consequent = Expression();
			expect('punc',':');
			const alternate = Conditional();
			return { type:'ConditionalExpression', test, consequent, alternate };
		}
		return test;
	}
	
	function Nullish(){
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

	function LogicalOr(){ let n=LogicalAnd(); while(match('op','||')) n={type:'LogicalExpression',operator:'||',left:n,right:LogicalAnd()}; return n; }
	function LogicalAnd(){ let n=Equality();   while(match('op','&&')) n={type:'LogicalExpression',operator:'&&',left:n,right:Equality()};   return n; }

	function Equality(){ let n=Relational(); while(true){ const t=peek(); if(t.type==='op'&&(['==','!=','===','!=='].includes(t.value))){ next(); n={type:'BinaryExpression',operator:t.value,left:n,right:Relational()}; } else break; } return n; }
	function Relational(){ let n=Additive(); while(true){ const t=peek(); if(t.type==='op'&&(['<','<=','>','>='].includes(t.value))){ next(); n={type:'BinaryExpression',operator:t.value,left:n,right:Additive()}; } else break; } return n; }
	function Additive(){ let n=Multiplicative(); while(true){ const t=peek(); if(t.type==='op'&&(['+','-'].includes(t.value))){ next(); n={type:'BinaryExpression',operator:t.value,left:n,right:Multiplicative()}; } else break; } return n; }
	function Multiplicative(){ let n=Unary(); while(true){ const t=peek(); if(t.type==='op'&&(['*','/','%'].includes(t.value))){ next(); n={type:'BinaryExpression',operator:t.value,left:n,right:Unary()}; } else break; } return n; }

	function Unary(){
	  const t=peek();
	  if (t.type==='op' && (t.value==='!'||t.value==='+'||t.value==='-')) { next(); return { type:'UnaryExpression', operator:t.value, argument: Unary() }; }
	  if (t.type==='op' && (t.value==='++'||t.value==='--')) { next(); const arg=Postfix(); if(!(arg.type==='Identifier'||arg.type==='MemberExpression')) throw DSyntax('Invalid update target', t.line, t.col); return { type:'UpdateExpression', operator:t.value, argument:arg, prefix:true }; }
	  return Postfix();
	}

	function Postfix(){
		let node = Primary();
	
		// postfix ++/--
		if (peek().type==='op' && (peek().value==='++'||peek().value==='--')) {
			const t = next();
			if (!(node.type==='Identifier'||node.type==='MemberExpression'))
				throw DSyntax('Invalid update target', t.line, t.col);
			node = { type:'UpdateExpression', operator:t.value, argument:node, prefix:false };
		}
	
		// chain: member/call (with optional chaining support)
		while (true) {
			// OPTIONAL MEMBER: a?.b
			if (peek().type==='punc' && peek().value==='?' &&
				tokens[pos+1] && tokens[pos+1].type==='punc' && tokens[pos+1].value==='.' &&
				tokens[pos+2] && tokens[pos+2].type==='ident') {
				next(); // '?'
				next(); // '.'
				const id = expect('ident').value;
				node = {
					type: 'MemberExpression',
					object: node,
					property: { type:'Identifier', name:id },
					computed: false,
					optional: true
				};
				continue;
			}
	
			// OPTIONAL COMPUTED MEMBER: a?.[expr]
			if (peek().type==='punc' && peek().value==='?' &&
				tokens[pos+1] && tokens[pos+1].type==='punc' && tokens[pos+1].value==='.' &&
				tokens[pos+2] && tokens[pos+2].type==='punc' && tokens[pos+2].value==='[') {
				next(); // '?'
				next(); // '.'
				expect('punc','[');
				const prop = Expression();
				expect('punc',']');
				node = {
					type: 'MemberExpression',
					object: node,
					property: prop,
					computed: true,
					optional: true
				};
				continue;
			}
	
			// OPTIONAL CALL on current node: a?.(args) or a.b?.(args)
			if (peek().type==='punc' && peek().value==='?' &&
				tokens[pos+1] && tokens[pos+1].type==='punc' && tokens[pos+1].value==='.' &&
				tokens[pos+2] && tokens[pos+2].type==='punc' && tokens[pos+2].value==='(') {
				next(); // '?'
				next(); // '.'
				expect('punc','(');
				const args = [];
				if (!(peek().type==='punc' && peek().value===')')) {
					do {
						if (match('spread','...'))
							args.push({ type:'SpreadElement', argument:Expression() });
						else
							args.push(Expression());
					} while (match('punc',','));
				}
				expect('punc',')');
				node = { type:'CallExpression', callee: node, arguments: args, optional: true };
				continue;
			}
	
			// NORMAL MEMBER: a.b
			if (match('punc','.')) {
				const id = expect('ident').value;
				node = { type:'MemberExpression', object:node, property:{type:'Identifier',name:id}, computed:false };
				continue;
			}
	
			// NORMAL COMPUTED MEMBER: a[expr]
			if (match('punc','[')) {
				const prop = Expression();
				expect('punc',']');
				node = { type:'MemberExpression', object:node, property:prop, computed:true };
				continue;
			}
	
			// NORMAL CALL: a(...)
			if (match('punc','(')) {
				const args=[];
				if (!(peek().type==='punc' && peek().value===')')) {
					do {
						if (match('spread','...'))
							args.push({type:'SpreadElement',argument:Expression()});
						else
							args.push(Expression());
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

	// Arrow helpers
	function ArrowFromParams(params){
	  expect('op','=>');
	  if (match('punc','{')) {
		const body=[]; while(!(peek().type==='punc'&&peek().value==='}')) body.push(Statement());
		expect('punc','}');
		return { type:'ArrowFunctionExpression', params, body:{type:'BlockStatement', body}, expression:false };
	  } else {
		const bodyExpr = Expression();
		return { type:'ArrowFunctionExpression', params, body: bodyExpr, expression:true };
	  }
	}

	function Primary(){
	  const t=peek();

	  // literals
	  if (t.type==='num') { next(); return {type:'Literal', value:t.value}; }
	  if (t.type==='str') { next(); return {type:'Literal', value:t.value}; }
	  if (t.type==='kw' && t.value==='true')  { next(); return {type:'Literal', value:true}; }
	  if (t.type==='kw' && t.value==='false') { next(); return {type:'Literal', value:false}; }
	  if (t.type==='kw' && t.value==='null')  { next(); return {type:'Literal', value:null}; }
	  if (t.type==='kw' && t.value==='undefined') { next(); return {type:'Literal', value:undefined}; }
	  if (t.type==='kw' && t.value==='NaN') { next(); return {type:'Literal', value:NaN}; }
	  if (t.type==='kw' && t.value==='Infinity') { next(); return {type:'Literal', value:Infinity}; }
	  
	  // function expression
	  if (t.type==='kw' && t.value==='function') return parseFunction(false);

	  // single-ident arrow: x => ...   (no defaults in single-ident form)
	  if (t.type==='ident' && tokens[pos+1] && tokens[pos+1].type==='op' && tokens[pos+1].value==='=>') {
		const id = next(); return ArrowFromParams([{type:'Param', name:id.value, default:null}]);
	  }
	  // identifier
	  if (t.type==='ident') { next(); return {type:'Identifier', name:t.value}; }

	  // parenthesized exp OR arrow params with defaults
	  if (match('punc','(')) {
		// () => ...
		if (peek().type==='punc' && peek().value===')' && tokens[pos+1] && tokens[pos+1].type==='op' && tokens[pos+1].value==='=>') {
		  expect('punc',')'); return ArrowFromParams([]); // zero params
		}
		// (a=1,b=2) => ...
		const save = pos;
		if (peek().type==='ident') {
		  const tmpParams=[]; let ok=true; const save2=pos;
		  try {
			do {
			  const p = expect('ident');
			  let def = null;
			  if (match('op','=')) def = Expression();
			  tmpParams.push({ type:'Param', name:p.value, default:def });
			} while (match('punc',','));
			if (match('punc',')') && peek().type==='op' && peek().value==='=>') {
			  return ArrowFromParams(tmpParams);
			}
		  } catch(_){ ok=false; }
		  pos = save2; // not an arrow; reset
		}
		// normal (expr)
		const e = Expression(); expect('punc',')'); return e;
	  }

	  // array
	  if (match('punc','[')) {
		const elements=[]; if (!(peek().type==='punc'&&peek().value===']')) { do { if (match('spread','...')) elements.push({type:'SpreadElement',argument:Expression()}); else elements.push(Expression()); } while (match('punc',',')); }
		expect('punc',']'); return { type:'ArrayExpression', elements };
	  }

	  // object (with shorthand + spread + method shorthand with defaults)
	  if (match('punc','{')) {
		const properties=[];
		if (!(peek().type==='punc'&&peek().value==='}')) {
		  do {
			if (match('spread','...')) {
			  properties.push({ type:'SpreadElement', argument: Expression() });
			} else {
			  const keyTok = next();
			  if (keyTok.type!=='ident' && keyTok.type!=='str') throw DSyntax('Invalid object key (identifier/string required)', keyTok.line, keyTok.col);
			  const keyName = keyTok.value;

			  // method shorthand: key '(' params[=default] ')' '{' body '}'
			  if (peek().type==='punc' && peek().value==='(') {
				expect('punc','(');
				const params = [];
				if (!(peek().type==='punc' && peek().value===')')) {
				  do {
					const p = expect('ident');
					let def=null;
					if (match('op','=')) def = Expression();
					params.push({ type:'Param', name:p.value, default:def });
				  } while (match('punc',','));
				}
				expect('punc',')');
				expect('punc','{');
				const body=[]; while (!(peek().type==='punc' && peek().value==='}')) body.push(Statement());
				expect('punc','}');
				properties.push({
				  type:'Property',
				  key:{type:'Identifier',name:keyName},
				  value:{ type:'FunctionExpression', id:null, params, body:{type:'BlockStatement', body} },
				  computed:false, shorthand:false
				});
			  } else if (match('punc',':')) {
				const value = Expression();
				properties.push({ type:'Property', key:{type:'Identifier',name:keyName}, value, computed:false, shorthand:false });
			  } else {
				// shorthand { foo }
				properties.push({ type:'Property', key:{type:'Identifier',name:keyName}, value:{type:'Identifier',name:keyName}, computed:false, shorthand:true });
			  }
			}
		  } while (match('punc',','));
		}
		expect('punc','}'); return { type:'ObjectExpression', properties };
	  }

	  throw DSyntax(`Unexpected token ${t.value}`, t.line, t.col);
	}

	return Program();
  }

  // ===== Evaluator =====
  class Scope {
	  constructor(parent=null){
		  this.parent = parent;
		  this.map = Object.create(null);
		  this.consts = new Set();
	  }
	  
	  hasLocal(n){
		  return Object.prototype.hasOwnProperty.call(this.map, n);
	  }
	  
	  _getSelf(){
		  let s = this;
		  
		  while (s) {
			  if (s.hasLocal('self'))
				  return s.map['self'];
			  
			  s = s.parent;
		  }
		  
		  return undefined;
	  }
	  
	  get(n){
		  if (n === 'this')
			  return this.get('self'); // `this` -> `self`
		  
		  if (this.hasLocal(n))
			  return this.map[n];
		  
		  if (this.parent)
			  return this.parent.get(n);
		  
		  // --- fallback: resolve from `self` (aka `this`) if present
		  const selfObj = this._getSelf();
		  
		  if (selfObj && typeof selfObj === 'object') {
			  if (BLOCKED_PROPS.has(n))
				  throw DRuntime(`Forbidden property: ${n}`);
			  
			  if (Object.prototype.hasOwnProperty.call(selfObj, n))
				  return selfObj[n];
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
		  if (this.parent)
			  return this.parent.set(n, v);
	  
		  // fallback: assign into self (even if not present yet)
		  const selfObj = this._getSelf();
		  if (selfObj && typeof selfObj === 'object') {
			  if (BLOCKED_PROPS.has(n))
				  throw DRuntime(`Forbidden property: ${n}`);
			  selfObj[n] = v; // <-- create or update
			  return v;
		  }
	  
		  throw DRuntime(`Unknown identifier: ${n}`);
	  }
	  
	  declare(kind, n, v){
		  if (this.hasLocal(n))
			  throw DRuntime(`Identifier already declared: ${n}`);
		  
		  this.map[n] = v;
		  
		  if (kind === 'const')
			  this.consts.add(n);
	  }
  }

  function coerceKey(k){ if (typeof k==='number') return String(k); if (typeof k==='string') return k; throw DRuntime('Computed key must be string or number'); }

  function evalProgram(ast, rootEnv, { maxSteps = 50_000, maxMillis = null } = {}) {
	let steps = 0;
	let start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
	const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  
	const bump = () => {
	  steps++;
	  if (maxMillis != null && (now() - start) > maxMillis) {
		throw DRuntime('DamenScript: script exceeded time budget');
	  }
	  if (steps > maxSteps) {
		throw DRuntime('DamenScript: script too complex');
	  }
	};
  
	const resetBudget = () => {
	  steps = 0;
	  start = now();
	};

	const top = new Scope(null);
	if (rootEnv && typeof rootEnv==='object') for (const k of Object.keys(rootEnv)) top.declare('const', k, rootEnv[k]);

	const getProp=(obj,key,computed=false)=>{ const prop=computed?coerceKey(key):key; if (BLOCKED_PROPS.has(prop)) throw DRuntime(`Forbidden property: ${prop}`); return obj[prop]; };
	const setProp=(obj,key,val,computed=false)=>{ const prop=computed?coerceKey(key):key; if (BLOCKED_PROPS.has(prop)) throw DRuntime(`Forbidden property: ${prop}`); obj[prop]=val; return val; };

	const RETURN = Symbol('return');

	function bindParams(params, args, parentScope) {
	  const fnScope = new Scope(parentScope);
	  for (let i = 0; i < params.length; i++) {
		const p = params[i];
		let val;
		if (i < args.length && args[i] !== undefined) val = args[i];
		else if (p.default != null) val = evalNode(p.default, fnScope);
		else val = undefined;
	
		fnScope.declare('let', p.name, val);   // <- changed to 'let'
	  }
	
	  // Optional: JS-like 'arguments'
	  fnScope.declare('let', 'arguments', args);
	
	  return fnScope;
	}

	function createCallable(params, bodyBlock, parentScope) {
	  return function(...args){
		resetBudget();
		const fnScope = bindParams(params, args, parentScope);
		try {
		  let result; for (const stmt of bodyBlock.body) result = evalNode(stmt, fnScope);
		  return result;
		} catch (e) {
		  if (e && e.__kind === RETURN) return e.value;
		  throw e;
		}
	  };
	}

	function evalNode(node, scope=top){
	  bump();
	  switch (node.type) {
		case 'Program': { let last; for (const s of node.body) last=evalNode(s,scope); return last; }
		case 'BlockStatement': { const inner=new Scope(scope); let last; for (const s of node.body) last=evalNode(s,inner); return last; }
		case 'ExpressionStatement': return evalNode(node.expression, scope);

		case 'ReturnStatement': {
		  const val = node.argument ? evalNode(node.argument, scope) : undefined;
		  throw { __kind: RETURN, value: val };
		}

		case 'FunctionDeclaration': {
		  const fn = createCallable(node.params, node.body, scope);
		  scope.declare('const', node.id.name, fn);
		  return undefined;
		}
		case 'FunctionExpression': {
		  return createCallable(node.params, node.body, scope);
		}

		case 'VariableDeclaration': {
		  for (const d of node.declarations) {
			const n=d.id.name; const v=d.init?evalNode(d.init,scope):undefined;
			scope.declare(node.kind,n,v);
		  }
		  return undefined;
		}

		case 'IfStatement': return truthy(evalNode(node.test, scope)) ? evalNode(node.consequent, scope) : (node.alternate ? evalNode(node.alternate, scope) : undefined);

		case 'WhileStatement': { let r; while (truthy(evalNode(node.test, scope))) { bump(); r = evalNode(node.body, scope); } return r; }

		case 'ForStatement': {
		  const inner=new Scope(scope);
		  if (node.init) evalNode(node.init, inner);
		  let r;
		  while (node.test ? truthy(evalNode(node.test, inner)) : true) { bump(); r = evalNode(node.body, inner); if (node.update) evalNode(node.update, inner); }
		  return r;
		}

		case 'ConditionalExpression': return truthy(evalNode(node.test, scope)) ? evalNode(node.consequent, scope) : evalNode(node.alternate, scope);

		case 'Literal': return node.value;
		case 'Identifier': return scope.get(node.name);

		case 'ArrayExpression': {
		  const out=[]; for (const el of node.elements) {
			if (!el) { out.push(undefined); continue; }
			if (el.type==='SpreadElement') { const v=evalNode(el.argument, scope); if (Array.isArray(v)) out.push(...v); else throw DRuntime('Spread in array requires an array'); }
			else out.push(evalNode(el, scope));
		  } return out;
		}

		case 'ObjectExpression': {
		  const o=Object.create(null);
		  for (const p of node.properties) {
			if (p.type==='SpreadElement') {
			  const src=evalNode(p.argument, scope);
			  if (src && typeof src==='object') { for (const k of Object.keys(src)) { if (BLOCKED_PROPS.has(k)) throw DRuntime(`Forbidden property: ${k}`); o[k]=src[k]; } }
			  else throw DRuntime('Spread in object requires an object');
			} else {
			  const key=p.key.name; setProp(o, key, evalNode(p.value, scope), false);
			}
		  } return o;
		}

		case 'MemberExpression': {
			const obj = evalNode(node.object, scope);
		
			if (node.optional && (obj == null))
				return undefined;
		
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
		
			function evalArgs(){
				const out = [];
				for (const a of node.arguments) {
					if (a.type === 'SpreadElement') {
						const v = evalNode(a.argument, scope);
						if (Array.isArray(v)) out.push(...v);
						else throw DRuntime('Spread in call requires an array');
					} else {
						out.push(evalNode(a, scope));
					}
				}
				return out;
			}
		
			if (calleeNode.type === 'MemberExpression') {
				const obj = evalNode(calleeNode.object, scope);
		
				if (calleeNode.optional && (obj == null))
					return undefined;
		
				let fn;
				if (calleeNode.computed) {
					const key = evalNode(calleeNode.property, scope);
					fn = getProp(obj, key, true);
				} else {
					const key = calleeNode.property.name;
					fn = getProp(obj, key, false);
				}
		
				if (node.optional && (fn == null))
					return undefined;
		
				if (typeof fn !== 'function')
					throw DRuntime('Attempt to call non-function ' + (calleeNode.computed ? '' : calleeNode.property.name));
		
				const args = evalArgs();
				return fn.apply(obj, args);
			}
		
			const fn = evalNode(calleeNode, scope);
		
			if (node.optional && (fn == null))
				return undefined;
		
			if (typeof fn !== 'function')
				throw DRuntime('Attempt to call non-function');
		
			const args = evalArgs();
			return fn.apply(undefined, args);
		}
		
		case 'NullishCoalesceExpression': {
			const l = evalNode(node.left, scope);
			if (l !== null && l !== undefined)
				return l;
			return evalNode(node.right, scope);
		}

		case 'ArrowFunctionExpression': {
		  const parentScope=scope;
		  return function(...args){
			resetBudget();
			const fnScope = bindParams(node.params, args, parentScope);
			if (node.expression) return evalNode(node.body, fnScope);
			try {
			  let result; for (const stmt of node.body.body) result=evalNode(stmt, fnScope);
			  return result;
			} catch (e) {
			  if (e && e.__kind===RETURN) return e.value;
			  throw e;
			}
		  };
		}

		case 'UnaryExpression': {
		  const v=evalNode(node.argument, scope);
		  switch(node.operator){ case '!': return !v; case '+': return +v; case '-': return -v; default: throw DRuntime(`Unsupported unary ${node.operator}`); }
		}

		case 'UpdateExpression': {
		  const op=node.operator, delta=(op==='++')?1:-1;
		  function read(arg){
			if (arg.type==='Identifier') return {kind:'id', name:arg.name, value:scope.get(arg.name)};
			if (arg.type==='MemberExpression'){ const obj=evalNode(arg.object, scope); if (arg.computed){ const key=evalNode(arg.property,scope); return {kind:'mem', obj, key, computed:true, value:getProp(obj,key,true)}; } else { const key=arg.property.name; return {kind:'mem', obj, key, computed:false, value:getProp(obj,key,false)}; } }
			throw DRuntime('Invalid update target');
		  }
		  const tgt=read(node.argument); const old=Number(tgt.value); if(!Number.isFinite(old)) throw DRuntime('Update operator on non-number');
		  const val=old+delta; if (tgt.kind==='id') scope.set(tgt.name,val); else setProp(tgt.obj,tgt.key,val,tgt.computed); return node.prefix?val:old;
		}

		case 'BinaryExpression': {
		  const l=evalNode(node.left, scope), r=evalNode(node.right, scope);
		  switch(node.operator){
			case '+': return l+r; case '-': return l-r; case '*': return l*r; case '/': return l/r; case '%': return l%r;
			case '==': return l==r; case '!=': return l!=r; case '===': return l===r; case '!==': return l!==r;
			case '<': return l<r; case '<=': return l<=r; case '>': return l>r; case '>=': return l>=r;
			default: throw DRuntime(`Unsupported binary ${node.operator}`);
		  }
		}

		case 'LogicalExpression': {
		  if (node.operator==='&&'){ const l=evalNode(node.left, scope); return l ? evalNode(node.right, scope) : l; }
		  if (node.operator==='||'){ const l=evalNode(node.left, scope); return l ? l : evalNode(node.right, scope); }
		  throw DRuntime(`Unsupported logical ${node.operator}`);
		}

		case 'AssignmentExpression': {
		  const op=node.operator; const rhs=evalNode(node.right, scope);
		  const apply=(op,a,b)=>{ switch(op){ case '=':return b; case '+=':return a+b; case '-=':return a-b; case '*=':return a*b; case '/=':return a/b; case '%=':return a%b; default: throw DRuntime(`Unsupported assignment operator ${op}`); } };

		  if (node.left.type==='Identifier'){ const name=node.left.name; const cur=(op==='=')?undefined:scope.get(name); const val=apply(op,cur,rhs); return scope.set(name,val); }
		  if (node.left.type==='MemberExpression'){ const obj=evalNode(node.left.object, scope);
			if (node.left.computed){ const key=evalNode(node.left.property, scope); const cur=(op==='=')?undefined:getProp(obj,key,true); const val=apply(op,cur,rhs); return setProp(obj,key,val,true); }
			else { const key=node.left.property.name; const cur=(op==='=')?undefined:getProp(obj,key,false); const val=apply(op,cur,rhs); return setProp(obj,key,val,false); }
		  }
		  throw DRuntime('Invalid assignment target');
		}

		default: throw DRuntime(`Unsupported node type ${node.type}`);
	  }
	}

	const truthy=v=>!!v;
	return evalNode(ast, top);
  }

  // ===== Public API =====
  function run(code, env={}, opts) {
	preflight(code);
	const ast = parse(code);
	
	env = {
		...BASIC_ENV,
		...env
	};
	
	return evalProgram(ast, env, opts);
  }

  return { parse, run };
})();

export default DamenScript;