/**
 * Instrumenter: parses user code with acorn and inserts tracking calls
 * (__s statement, __e/__x function enter/exit, __v value, __log console, ...)
 * without changing the program's behaviour.
 *
 * The output is plain JavaScript that runs inside a Web Worker together with
 * `runtime.js`. A source map (list of copied segments) lets us translate
 * positions in the generated code back to the user's original code.
 */
import * as acorn from 'acorn';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;

export type CovKind = 'st' | 'fn' | 'br' | 'loop' | 'end';
export interface CovNode {
  kind: CovKind;
  s: number; e: number; // offsets in original source
  sl: number; el: number; // 1-based lines
  name?: string; // for functions
  async?: boolean;
  vars?: string[]; // variables in scope (for statements)
}
export interface ValMeta {
  line: number; sline: number; s: number; e: number;
  src: string;
  deep: boolean; timing: boolean;
  expr: string | null;
  kind: 'live' | 'auto' | 'lp' | 'inline' | 'peek';
}
export interface LogMeta { line: number; m: string }
export interface Segment { g: number; o: number; len: number }
export interface InlineTarget { line: number; text: string }

export interface InstrumentOptions {
  logpoints?: Set<number>;
  logAll?: boolean;
  /** pinned expressions (Shift+F9 / inline logpoints) located by line + text */
  inline?: InlineTarget[];
  /** a single expression range to evaluate on demand (value peek of a selection) */
  peek?: { s: number; e: number } | null;
  /** same as peek, but located by line + text (used when the editor text is TypeScript) */
  peekAt?: InlineTarget | null;
}
export interface Instrumented {
  code: string;
  cov: CovNode[];
  vals: ValMeta[];
  logs: LogMeta[];
  problems: { line: number; msg: string }[];
  segments: Segment[];
  lineStarts: number[];
  peekId: number | null;
}

export class JejakSyntaxError extends Error {
  constructor(msg: string, public line: number, public col: number) { super(msg); }
}

export const CONSOLE_METHODS = new Set(['log', 'info', 'warn', 'error', 'debug', 'table', 'dir']);

export function lineStartsOf(src: string): number[] {
  const a = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) a.push(i + 1);
  return a;
}
export function lineAt(ls: number[], pos: number): number {
  let lo = 0, hi = ls.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ls[m] <= pos) lo = m; else hi = m - 1; }
  return lo + 1;
}

const isNode = (x: any): x is Node => !!x && typeof x === 'object' && typeof x.type === 'string';
function children(n: Node): Node[] {
  const out: Node[] = [];
  for (const k in n) {
    if (k === 'type' || k === 'loc' || k === 'start' || k === 'end' || k === '__p' || k === '__depth') continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const c of v) if (isNode(c)) out.push(c); }
    else if (isNode(v)) out.push(v);
  }
  return out;
}

const EXPR_TYPES = new Set(['Identifier', 'Literal', 'ArrayExpression', 'ObjectExpression', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassExpression', 'TemplateLiteral', 'TaggedTemplateExpression', 'MemberExpression', 'CallExpression', 'NewExpression', 'UpdateExpression', 'UnaryExpression', 'BinaryExpression', 'LogicalExpression', 'ConditionalExpression', 'AssignmentExpression', 'SequenceExpression', 'AwaitExpression', 'ChainExpression', 'ParenthesizedExpression', 'ThisExpression']);

/** Can this expression node be wrapped in a function call without changing semantics? */
export function canWrap(n: Node): boolean {
  if (!EXPR_TYPES.has(n.type)) return false;
  const p = n.__p; if (!p) return false;
  if ((p.type === 'CallExpression' || p.type === 'NewExpression') && p.callee === n) return false;
  if (p.type === 'TaggedTemplateExpression' && p.tag === n) return false;
  if (p.type === 'AssignmentExpression' && p.left === n) return false;
  if (p.type === 'UpdateExpression') return false;
  if (p.type === 'UnaryExpression' && (p.operator === 'delete' || p.operator === 'typeof') && n.type === 'Identifier') return false;
  if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === n && !p.computed) return false;
  if (p.type === 'Property' && p.shorthand) return false;
  if (p.type === 'MemberExpression' && p.property === n && !p.computed) return false;
  if (p.type === 'VariableDeclarator' && p.id === n) return false;
  if ((p.type === 'ForInStatement' || p.type === 'ForOfStatement') && p.left === n) return false;
  if (/Function/.test(p.type) && (p.params?.includes(n) || p.id === n)) return false;
  if (p.type === 'ChainExpression' || p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') return false;
  if ((p.type === 'ClassDeclaration' || p.type === 'ClassExpression') && p.id === n) return false;
  if (/Pattern$/.test(p.type) || p.type === 'RestElement') return false;
  if (n.type === 'Identifier' && n.name === 'arguments') return true;
  // never wrap the middle of an optional chain (a?.b.c)
  let q = p;
  while (q) {
    if (q.type === 'ChainExpression' && n.type !== 'ChainExpression') return false;
    if (!/Member|Call/.test(q.type)) break;
    q = q.__p;
  }
  return true;
}

function patternIds(p: Node, out: string[]) {
  if (!p) return;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': p.properties.forEach((pr: Node) => patternIds(pr.type === 'RestElement' ? pr.argument : pr.value, out)); break;
    case 'ArrayPattern': p.elements.forEach((e: Node) => patternIds(e, out)); break;
    case 'RestElement': patternIds(p.argument, out); break;
    case 'AssignmentPattern': patternIds(p.left, out); break;
  }
}
/** `var` + function declarations, not descending into nested functions */
function hoistedVars(body: Node[], out: string[]) {
  const visit = (n: Node) => {
    if (!isNode(n)) return;
    if (/Function/.test(n.type) && n.type !== 'FunctionDeclaration') return;
    if (n.type === 'FunctionDeclaration') { if (n.id) out.push(n.id.name); return; }
    if (n.type === 'VariableDeclaration' && n.kind === 'var') n.declarations.forEach((d: Node) => patternIds(d.id, out));
    if (n.type === 'ClassDeclaration' || n.type === 'ClassExpression') return;
    for (const c of children(n)) visit(c);
  };
  body.forEach(visit);
}
function lexicalOf(list: Node[], out: string[]) {
  for (const s of list) {
    if (s.type === 'VariableDeclaration' && s.kind !== 'var') s.declarations.forEach((d: Node) => patternIds(d.id, out));
    else if (s.type === 'ClassDeclaration' && s.id) out.push(s.id.name);
    else if (s.type === 'FunctionDeclaration' && s.id) out.push(s.id.name);
  }
}
function isConsoleCall(n: Node) {
  const c = n.callee;
  return c && c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && c.object.name === 'console' && CONSOLE_METHODS.has(c.property.name);
}

export const MAX_SCOPE_VARS = 14;

export function parse(src: string, comments?: acorn.Comment[]): Node {
  try {
    return acorn.parse(src, {
      ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true, allowHashBang: true, locations: true, preserveParens: true,
      onComment: comments,
    });
  } catch (e: any) {
    throw new JejakSyntaxError(String(e.message).replace(/\s*\(\d+:\d+\)$/, ''), e.loc?.line ?? 1, e.loc?.column ?? 0);
  }
}

export function instrument(src: string, opts: InstrumentOptions = {}): Instrumented {
  const comments: acorn.Comment[] = [];
  const ast = parse(src, comments);
  const ls = lineStartsOf(src);
  const L = (pos: number) => lineAt(ls, pos);

  const all: Node[] = [];
  (function link(n: Node, p: Node, d: number) { n.__p = p; n.__depth = d; all.push(n); for (const c of children(n)) link(c, n, d + 1); })(ast, null, 0);

  const cov: CovNode[] = [];
  const vals: ValMeta[] = [];
  const logs: LogMeta[] = [];
  const problems: { line: number; msg: string }[] = [];
  const valTargets = new Map<Node, number>();

  function addVal(node: Node, o: Partial<ValMeta>): number {
    const existing = valTargets.get(node);
    if (existing != null) return existing;
    const id = vals.length;
    vals.push({
      line: L(node.end), sline: L(node.start), s: node.start, e: node.end,
      src: src.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, 60),
      deep: !!o.deep, timing: !!o.timing, expr: o.expr ?? null, kind: o.kind ?? 'live',
    });
    valTargets.set(node, id);
    return id;
  }

  // ---- live comments: //?  /*?*/  /*?.*/  /*?+*/  //? $.length
  const byEnd = new Map<number, Node[]>();
  const byRange = new Map<string, Node[]>();
  for (const n of all) {
    if (!EXPR_TYPES.has(n.type)) continue;
    if (!byEnd.has(n.end)) byEnd.set(n.end, []);
    byEnd.get(n.end)!.push(n);
    const k = n.start + ':' + n.end;
    if (!byRange.has(k)) byRange.set(k, []);
    byRange.get(k)!.push(n);
  }
  for (const c of comments) {
    if (!c.value.startsWith('?')) continue;
    let q = c.start;
    while (q > 0 && /[\s;]/.test(src[q - 1])) q--;
    const cands = (byEnd.get(q) || []).filter(canWrap).sort((a, b) => a.start - b.start);
    if (!cands.length) continue;
    let rest = c.value.slice(1);
    const o: Partial<ValMeta> = { kind: 'live' };
    for (let i = 0; i < 2; i++) {
      if (rest.startsWith('.')) { o.timing = true; rest = rest.slice(1); }
      if (rest.startsWith('+')) { o.deep = true; rest = rest.slice(1); }
    }
    rest = rest.trim();
    if (rest && /\$/.test(rest)) {
      try { acorn.parseExpressionAt(rest, 0, { ecmaVersion: 'latest' }); o.expr = rest; }
      catch { problems.push({ line: L(c.start), msg: 'Invalid live comment expression: ' + rest }); }
    }
    addVal(cands[0], o);
  }

  // ---- pinned inline expressions & on-demand peek
  const rangeNode = (s: number, e: number) => {
    // trim whitespace around the selection
    while (s < e && /\s/.test(src[s])) s++;
    while (e > s && /\s/.test(src[e - 1])) e--;
    return (byRange.get(s + ':' + e) || []).filter(canWrap).sort((a, b) => a.__depth - b.__depth)[0] || null;
  };
  const locate = (t: InlineTarget) => {
    if (t.line < 1 || t.line > ls.length) return null;
    const lineText = src.slice(ls[t.line - 1], ls[t.line] ?? src.length);
    const idx = lineText.indexOf(t.text);
    if (idx < 0) return null;
    const s = ls[t.line - 1] + idx;
    return rangeNode(s, s + t.text.length);
  };
  for (const t of opts.inline || []) {
    const n = locate(t);
    if (n) addVal(n, { kind: 'inline' });
  }
  let peekId: number | null = null;
  const pn = opts.peek ? rangeNode(opts.peek.s, opts.peek.e) : opts.peekAt ? locate(opts.peekAt) : null;
  if (pn) peekId = addVal(pn, { kind: 'peek' });

  // ---- logpoints + identifiers on their own line
  const lp = opts.logpoints || new Set<number>();
  const logAll = !!opts.logAll;
  for (const n of all) {
    if (n.type === 'ExpressionStatement' && !n.directive) {
      let e = n.expression;
      while (e.type === 'ParenthesizedExpression') e = e.expression;
      if (e.type === 'Identifier' || e.type === 'MemberExpression' || e.type === 'ThisExpression') addVal(n.expression, { kind: 'auto' });
      else if (logAll || lp.has(L(n.start))) {
        if (!(e.type === 'CallExpression' && isConsoleCall(e))) addVal(n.expression, { kind: 'lp' });
      }
    } else if (logAll || lp.has(L(n.start))) {
      if (n.type === 'VariableDeclaration') n.declarations.forEach((d: Node) => { if (d.init && canWrap(d.init)) addVal(d.init, { kind: 'lp' }); });
      else if (n.type === 'ReturnStatement' && n.argument && canWrap(n.argument)) addVal(n.argument, { kind: 'lp' });
    }
  }

  // ---- rewrite
  interface Edit { pos: number; text: string; ord: number; skip?: number }
  const edits: Edit[] = [];
  const pre = (pos: number, text: string, d: number) => edits.push({ pos, text, ord: d });
  const suf = (pos: number, text: string, d: number) => edits.push({ pos, text, ord: -d - 1 });
  const scopes: string[][] = [];
  const fnStack: { fid: number; async: boolean }[] = [];

  const scopeNames = () => {
    const seen = new Set<string>(), out: string[] = [];
    for (let i = scopes.length - 1; i >= 0 && out.length < MAX_SCOPE_VARS; i--)
      for (const nm of scopes[i]) {
        if (!seen.has(nm) && !nm.startsWith('__')) { seen.add(nm); out.push(nm); if (out.length >= MAX_SCOPE_VARS) break; }
      }
    return out;
  };
  const newCov = (kind: CovKind, n: { start: number; end: number }, extra: Partial<CovNode> = {}) => {
    const id = cov.length;
    cov.push({ kind, s: n.start, e: n.end, sl: L(n.start), el: L(n.end), ...extra });
    return id;
  };
  const stmtCall = (n: Node, quiet = false) => {
    // quiet: count coverage but don't record a Time Machine step (e.g. `if (x) return 1` on one line)
    if (quiet) { const id = newCov('st', n, { vars: [] }); return `__q(${id});`; }
    const vars = scopeNames();
    const id = newCov('st', n, { vars });
    return `__s(${id},[${vars.map(v => `()=>${v}`).join(',')}]);`;
  };
  const fnName = (n: Node): string => {
    if (n.id) return n.id.name;
    const p = n.__p;
    if (!p) return '(anonymous)';
    if (p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
    if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key)
      return String(p.key.name ?? p.key.value ?? '(anonymous)');
    if (p.type === 'AssignmentExpression') return src.slice(p.left.start, p.left.end);
    if (p.type === 'CallExpression' || p.type === 'NewExpression' || (p.__p && p.__p.type === 'CallExpression')) {
      const call = p.type === 'CallExpression' || p.type === 'NewExpression' ? p : p.__p;
      const cs = src.slice(call.callee.start, call.callee.end);
      return 'cb ' + (cs.length > 24 ? '…' + cs.slice(-23) : cs);
    }
    return '(anonymous)';
  };
  const isTracked = (s: Node) => !(s.type === 'FunctionDeclaration' || (s.type === 'ExpressionStatement' && s.directive) || s.type === 'EmptyStatement');

  function list(stmts: Node[], d: number) {
    for (const s of stmts) { if (isTracked(s)) pre(s.start, stmtCall(s), d); walk(s, d + 1); }
  }
  function single(s: Node, d: number, loopId?: number) {
    if (s.type === 'BlockStatement') { if (loopId != null) pre(s.start + 1, `__g(${loopId});`, d); walk(s, d); return; }
    const sameLine = s.__p && L(s.__p.start) === L(s.start);
    pre(s.start, '{' + (loopId != null ? `__g(${loopId});` : '') + (isTracked(s) ? stmtCall(s, sameLine) : ''), d);
    walk(s, d + 1);
    suf(s.end, '}', d);
  }
  const curFn = () => fnStack[fnStack.length - 1];
  const fnTail = (fid: number) => `}catch(__x0){__c(__x0);throw __x0}finally{__x(${fid})}`;

  function walk(n: Node, d: number) {
    if (!n) return;
    const vid = valTargets.get(n);
    if (vid != null) {
      const v = vals[vid];
      pre(n.start, v.timing ? `(__t0(${vid}),__v(${vid},` : `__v(${vid},`, d);
      suf(n.end, (v.expr ? `,($)=>(${v.expr})` : '') + (v.timing ? '))' : ')'), d);
    }
    switch (n.type) {
      case 'Program': {
        const names: string[] = []; hoistedVars(n.body, names); lexicalOf(n.body, names);
        scopes.push(names); list(n.body, d + 1);
        const top = scopeNames();
        const id = newCov('end', { start: n.end, end: n.end }, { vars: top });
        pre(n.end, `\n;__s(${id},[${top.map(v => `()=>${v}`).join(',')}]);`, 0);
        scopes.pop(); return;
      }
      case 'BlockStatement': case 'StaticBlock': {
        const names: string[] = []; lexicalOf(n.body, names);
        scopes.push(names); list(n.body, d + 1); scopes.pop(); return;
      }
      case 'SwitchStatement': {
        walk(n.discriminant, d + 1);
        const names: string[] = []; n.cases.forEach((c: Node) => lexicalOf(c.consequent, names));
        scopes.push(names);
        for (const c of n.cases) { if (c.test) walk(c.test, d + 1); list(c.consequent, d + 1); }
        scopes.pop(); return;
      }
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        const names: string[] = [];
        n.params.forEach((p: Node) => patternIds(p, names));
        if (n.type === 'FunctionExpression' && n.id) names.push(n.id.name);
        if (n.body.type === 'BlockStatement') hoistedVars(n.body.body, names);
        const fid = newCov('fn', n, { name: fnName(n), async: !!n.async });
        scopes.push(names);
        fnStack.push({ fid, async: !!n.async && !n.generator });
        n.params.forEach((p: Node) => walk(p, d + 1));
        if (n.body.type === 'BlockStatement') {
          // fixed order keys so an empty body `{}` still gets enter-before-tail
          edits.push({ pos: n.body.start + 1, text: `__e(${fid});try{`, ord: -1e6 });
          walk(n.body, d + 1);
          edits.push({ pos: n.body.end - 1, text: fnTail(fid), ord: 1e6 });
        } else {
          pre(n.body.start, `{__e(${fid});try{${stmtCall(n.body)}return `, d + 1);
          walk(n.body, d + 2);
          suf(n.body.end, fnTail(fid) + '}', d + 1);
        }
        fnStack.pop(); scopes.pop(); return;
      }
      case 'AwaitExpression': {
        const f = curFn();
        if (f && f.async) {
          // keep our shadow call stack right across suspension points
          pre(n.start, `__ar(${f.fid},`, d);
          pre(n.argument.start, `__as(${f.fid},`, d + 1);
          walk(n.argument, d + 2);
          suf(n.argument.end, ')', d + 1);
          suf(n.end, ')', d);
          return;
        }
        break;
      }
      case 'IfStatement': walk(n.test, d + 1); single(n.consequent, d + 1); if (n.alternate) single(n.alternate, d + 1); return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const names: string[] = [];
        const ini = n.init || n.left;
        if (ini && ini.type === 'VariableDeclaration' && ini.kind !== 'var') ini.declarations.forEach((dd: Node) => patternIds(dd.id, names));
        scopes.push(names);
        for (const k of ['init', 'test', 'update', 'left', 'right']) if (n[k]) walk(n[k], d + 1);
        const lid = newCov('loop', n);
        const f = curFn();
        if (n.await && f && f.async) pre(n.body.type === 'BlockStatement' ? n.body.start + 1 : n.body.start, `__rs(${f.fid});`, d + 2);
        single(n.body, d + 1, lid);
        scopes.pop(); return;
      }
      case 'WhileStatement': case 'DoWhileStatement': { walk(n.test, d + 1); const lid = newCov('loop', n); single(n.body, d + 1, lid); return; }
      case 'WithStatement': walk(n.object, d + 1); single(n.body, d + 1); return;
      case 'LabeledStatement': walk(n.body, d + 1); return;
      case 'TryStatement': {
        walk(n.block, d + 1);
        if (n.handler) {
          const names: string[] = []; if (n.handler.param) patternIds(n.handler.param, names);
          const f = curFn();
          if (f && f.async) pre(n.handler.body.start + 1, `__rs(${f.fid});`, d + 1);
          scopes.push(names); walk(n.handler.body, d + 1); scopes.pop();
        }
        if (n.finalizer) walk(n.finalizer, d + 1);
        return;
      }
      case 'ConditionalExpression': {
        walk(n.test, d + 1);
        for (const k of ['consequent', 'alternate']) {
          const b = n[k]; const id = newCov('br', b);
          pre(b.start, `__b(${id},`, d + 1); walk(b, d + 2); suf(b.end, ')', d + 1);
        }
        return;
      }
      case 'LogicalExpression': {
        walk(n.left, d + 1);
        const b = n.right; const id = newCov('br', b);
        pre(b.start, `__b(${id},`, d + 1); walk(b, d + 2); suf(b.end, ')', d + 1);
        return;
      }
      case 'CallExpression': {
        if (isConsoleCall(n)) {
          const lid = logs.length;
          logs.push({ line: L(n.start), m: n.callee.property.name });
          edits.push({ pos: n.callee.start, text: `__log(${lid},"${n.callee.property.name}")`, ord: 1e9, skip: n.callee.end });
          n.arguments.forEach((a: Node) => walk(a, d + 1));
          return;
        }
        break;
      }
      case 'MethodDefinition': case 'PropertyDefinition': case 'Property': {
        if (n.computed) walk(n.key, d + 1);
        if (n.value) walk(n.value, d + 1);
        return;
      }
    }
    for (const c of children(n)) walk(c, d + 1);
  }
  walk(ast, 0);

  edits.sort((a, b) => a.pos - b.pos || a.ord - b.ord);
  let out = '', cur = 0;
  const segments: Segment[] = [];
  const copy = (to: number) => {
    if (to > cur) { segments.push({ g: out.length, o: cur, len: to - cur }); out += src.slice(cur, to); cur = to; }
  };
  for (const e of edits) {
    copy(e.pos);
    out += e.text;
    if (e.skip) cur = Math.max(cur, e.skip);
  }
  copy(src.length);
  return { code: out, cov, vals, logs, problems, segments, lineStarts: ls, peekId };
}

/** Map an offset in generated code back to an offset in the original source. */
export function genToOrig(segments: Segment[], g: number): number {
  let lo = 0, hi = segments.length - 1, best = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (segments[m].g <= g) { best = m; lo = m + 1; } else hi = m - 1;
  }
  if (best < 0) return segments.length ? segments[0].o : 0;
  const s = segments[best];
  if (g < s.g + s.len) return s.o + (g - s.g);
  // inside inserted text: map to the start of the next copied chunk
  const nx = segments[best + 1];
  return nx ? nx.o : s.o + s.len;
}
