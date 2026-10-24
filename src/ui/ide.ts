/**
 * Editor comfort features: autocomplete, snippets with tab stops, Prettier formatting
 * (on demand + gentle auto-format) and the editor settings popover.
 *
 * Rules that keep the editor predictable:
 *  - an edit outside the active snippet field ends the snippet; user text is never restored
 *  - auto-format never runs right after a delete / cut / undo, never moves or joins lines,
 *    and never adds a trailing newline
 */
import CodeMirror from 'codemirror';
import 'codemirror/addon/hint/show-hint';
import type { Ser } from '../core/session';
import { store } from '../state';
import { getLang } from '../i18n';
import { $, toast } from './dom';
import { cm } from './editor';
import { lookup } from './peek';
import * as acorn from 'acorn';

/* eslint-disable @typescript-eslint/no-explicit-any */
const L = (en: string, id: string) => (getLang() === 'id' ? id : en);

/* ---------------- settings ---------------- */
export interface EditorSettings { autoFmt: boolean; fmtSave: boolean; indent: 2 | 4; semi: 'auto' | 'yes' | 'no'; quote: 'single' | 'double'; font: number }
const DEF: EditorSettings = { autoFmt: true, fmtSave: true, indent: 2, semi: 'auto', quote: 'single', font: 13.5 };
export const edset: EditorSettings = { ...DEF, ...store.get<Partial<EditorSettings>>('edset', {}) };

function applySettings() {
  cm.setOption('tabSize', edset.indent);
  cm.setOption('indentUnit', edset.indent);
  document.documentElement.style.setProperty('--code-size', edset.font + 'px');
  cm.refresh();
  store.set('edset', edset);
}

/* ---------------- autocomplete ---------------- */
type Snip = [name: string, body: string, en: string, id: string];
const SNIPPETS: Snip[] = [
  ['for', 'for (let ${1:i} = 0; $1 < ${2:arr}.length; $1++) {\n\t$0\n}', 'indexed loop', 'loop dengan index'],
  ['forof', 'for (const ${1:item} of ${2:arr}) {\n\t$0\n}', 'loop over values', 'loop isi array / iterable'],
  ['forin', 'for (const ${1:key} in ${2:obj}) {\n\t$0\n}', 'loop over keys', 'loop key objek'],
  ['foreach', '${1:arr}.forEach((${2:item}) => {\n\t$0\n})', 'forEach', 'forEach'],
  ['while', 'while (${1:condition}) {\n\t$0\n}', 'while loop', 'loop while'],
  ['dowhile', 'do {\n\t$0\n} while (${1:condition})', 'do…while loop', 'loop do…while'],
  ['if', 'if (${1:condition}) {\n\t$0\n}', 'if statement', 'percabangan if'],
  ['ifelse', 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}', 'if … else', 'if … else'],
  ['else', 'else {\n\t$0\n}', 'else block', 'blok else'],
  ['switch', 'switch (${1:value}) {\n\tcase ${2:1}:\n\t\t$0\n\t\tbreak\n\tdefault:\n\t\tbreak\n}', 'switch', 'switch case'],
  ['try', 'try {\n\t$1\n} catch (${2:err}) {\n\t$0\n}', 'try … catch', 'try … catch'],
  ['function', 'function ${1:name}(${2:params}) {\n\t$0\n}', 'function declaration', 'deklarasi fungsi'],
  ['arrow', 'const ${1:name} = (${2:params}) => {\n\t$0\n}', 'arrow function', 'arrow function'],
  ['async', 'async function ${1:name}(${2:params}) {\n\t$0\n}', 'async function', 'async function'],
  ['class', 'class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t$0\n\t}\n}', 'class', 'class'],
  ['log', 'console.log(${1})', 'console.log', 'console.log'],
  ['cl', 'console.log(${1})', 'console.log', 'console.log'],
  ['map', '${1:arr}.map((${2:x}) => ${0:x})', 'array.map', 'array.map'],
  ['filter', '${1:arr}.filter((${2:x}) => ${0:x})', 'array.filter', 'array.filter'],
  ['reduce', '${1:arr}.reduce((${2:acc}, ${3:x}) => ${0:acc + x}, ${4:0})', 'array.reduce', 'array.reduce'],
  ['promise', 'new Promise((resolve, reject) => {\n\t$0\n})', 'new Promise', 'new Promise'],
  ['timeout', 'setTimeout(() => {\n\t$0\n}, ${1:1000})', 'setTimeout', 'setTimeout'],
  ['lc', '//?', 'live comment: show value', 'live comment: tampilkan nilai'],
];
const KEYWORDS = 'const let var function return if else for while do switch case default break continue new class extends super this typeof instanceof try catch finally throw async await yield of in delete void null undefined true false'.split(' ');
const GLOBALS = 'console Math JSON Object Array String Number Boolean Promise Map Set WeakMap Date RegExp Error TypeError Symbol BigInt parseInt parseFloat isNaN setTimeout setInterval clearTimeout clearInterval queueMicrotask structuredClone Intl globalThis'.split(' ');
const METHODS: Record<string, string> = {
  arr: 'length push pop shift unshift slice splice map filter reduce reduceRight forEach find findIndex findLast some every includes indexOf lastIndexOf join concat sort reverse flat flatMap at fill keys values entries toSorted toReversed with',
  str: 'length toUpperCase toLowerCase trim trimStart trimEnd split slice substring includes startsWith endsWith replace replaceAll indexOf lastIndexOf padStart padEnd repeat at charAt charCodeAt match matchAll localeCompare normalize',
  num: 'toFixed toString toPrecision toLocaleString',
  map: 'get set has delete size keys values entries forEach clear',
  set: 'add has delete size values keys entries forEach clear',
  prom: 'then catch finally',
  fn: 'call apply bind name length',
  date: 'getFullYear getMonth getDate getDay getHours getMinutes getSeconds getTime toISOString toLocaleDateString toLocaleString',
  obj: 'hasOwnProperty toString valueOf',
};
const TYPE_NAME: Record<string, string> = { arr: 'Array', str: 'String', num: 'Number', map: 'Map', set: 'Set', prom: 'Promise', fn: 'Function', date: 'Date', obj: 'Object' };
const STATICS: Record<string, string> = {
  Math: 'PI E abs ceil floor round trunc max min pow sqrt cbrt random sign log log2 log10 exp sin cos tan atan2 hypot',
  Object: 'keys values entries assign freeze isFrozen fromEntries groupBy create defineProperty getPrototypeOf',
  Array: 'from isArray of', JSON: 'parse stringify',
  Number: 'isInteger isFinite isNaN parseFloat parseInt MAX_SAFE_INTEGER MIN_SAFE_INTEGER EPSILON',
  Promise: 'all allSettled any race resolve reject withResolvers',
  console: 'log info warn error table dir debug time timeEnd group groupEnd',
  String: 'fromCharCode raw', Date: 'now parse UTC',
};
function typeOfSer(v: Ser | null | undefined): string | null {
  if (!v) return null;
  if (v.t === 'obj') return /^Map\(/.test(v.p) ? 'map' : /^Set\(/.test(v.p) ? 'set' : 'obj';
  return ({ arr: 'arr', str: 'str', num: 'num', fn: 'fn', prom: 'prom', date: 'date' } as Record<string, string>)[v.t] ?? null;
}

type Kind = 'snip' | 'kw' | 'var' | 'prop' | 'fn' | 'glob';
interface Item { text: string; kind: Kind; detail: string; body?: string }
const ICON: Record<Kind, string> = { snip: '⧉', kw: 'K', fn: 'ƒ', prop: '•', glob: 'G', var: 'x' };

export function hint(ed: CodeMirror.Editor, opts?: { explicit?: boolean }): any {
  const cur = ed.getCursor(), line = ed.getLine(cur.line);
  let s = cur.ch;
  while (s > 0 && /[\w$]/.test(line[s - 1])) s--;
  const word = line.slice(s, cur.ch), lw = word.toLowerCase();
  if (/^\d/.test(word)) return null;
  const tok = ed.getTokenAt(cur);
  if (tok && /comment|string/.test(tok.type || '') && !opts?.explicit) return null;
  const before = line.slice(0, s);
  const isDot = /\.$/.test(before) && !/\.\.\.$/.test(before);
  const items: Item[] = [], seen = new Set<string>();
  const push = (text: string, kind: Kind, detail: string, body?: string) => {
    if (seen.has(kind + text)) return; seen.add(kind + text); items.push({ text, kind, detail, body });
  };
  if (isDot) {
    const m = /([A-Za-z_$][\w$]*(?:\.[\w$]+|\[\d+\])*)\.$/.exec(before);
    const expr = m?.[1];
    if (expr && STATICS[expr]) STATICS[expr].split(' ').forEach(k => push(k, /^[A-Z_]+$/.test(k) ? 'prop' : 'fn', expr + '.' + k));
    else {
      const v = expr ? lookup(expr, cur.line + 1)?.v : null;
      const ty = typeOfSer(v);
      if (v?.c && ty === 'obj') v.c.forEach(c => push(c.k, c.v.t === 'fn' ? 'fn' : 'prop', c.v.p.length > 30 ? c.v.p.slice(0, 29) + '…' : c.v.p));
      const list = ty ? METHODS[ty] || '' : METHODS.arr + ' ' + METHODS.str;
      list.split(' ').forEach(k => push(k, k === 'length' || k === 'size' || k === 'name' ? 'prop' : 'fn', ty ? TYPE_NAME[ty] : 'Array / String'));
    }
  } else {
    if (!word && !opts?.explicit) return null;
    SNIPPETS.forEach(([k, body, en, id]) => push(k, 'snip', L(en, id), body));
    const snipNames = new Set(SNIPPETS.map(x => x[0]));
    KEYWORDS.forEach(k => { if (!snipNames.has(k)) push(k, 'kw', 'keyword'); });
    const ids = new Set(ed.getValue().match(/[A-Za-z_$][\w$]*/g) || []);
    ids.forEach(k => { if (k !== word && !KEYWORDS.includes(k) && k.length > 1) push(k, 'var', L('in this code', 'di kode ini')); });
    GLOBALS.forEach(k => push(k, 'glob', 'global'));
  }
  const score = (it: Item) => {
    const tx = it.text.toLowerCase();
    if (!lw) return 3;
    if (tx === lw) return it.kind === 'snip' ? 0 : 1;
    if (tx.startsWith(lw)) return it.kind === 'snip' ? 1.5 : 2;
    let i = 0; for (const ch of tx) { if (ch === lw[i]) i++; if (i === lw.length) return 4; }
    return 99;
  };
  const list = items.map(it => ({ it, sc: score(it) })).filter(x => x.sc < 99)
    .sort((a, b) => a.sc - b.sc || a.it.text.length - b.it.text.length).slice(0, 40)
    .map(({ it }) => ({
      text: it.text, displayText: it.text,
      render(el: HTMLElement) {
        const k = document.createElement('span'); k.className = 'hk hk-' + it.kind; k.textContent = ICON[it.kind];
        const n = document.createElement('span'); n.className = 'hn'; n.textContent = it.text;
        const d = document.createElement('span'); d.className = 'hd'; d.textContent = it.detail;
        el.append(k, n, d);
      },
      hint: it.body ? (e: CodeMirror.Editor, data: any, c: any) => insertSnippet(e, c.from || data.from, c.to || data.to, it.body!) : undefined,
    }));
  if (!list.length) return null;
  if (list.length === 1 && list[0].text === word && items[0].kind !== 'snip') return null;
  return { list, from: CodeMirror.Pos(cur.line, s), to: cur };
}

/* ---------------- snippets with tab stops ---------------- */
interface Stop { n: number; marks: CodeMirror.TextMarker[] }
let snip: { stops: Stop[]; idx: number } | null = null;
export const snippetActive = () => !!snip;

function activeRange() {
  const st = snip?.stops[snip.idx];
  return st ? (st.marks[0].find() as CodeMirror.MarkerRange | undefined) : undefined;
}
export function insertSnippet(ed: CodeMirror.Editor, from: CodeMirror.Position, to: CodeMirror.Position, body: string) {
  endSnippet();
  const indent = ed.getLine(from.line).match(/^\s*/)![0];
  const raw = body.replace(/\t/g, ' '.repeat(edset.indent)).replace(/\n/g, '\n' + indent);
  let out = '', last = 0, m: RegExpExecArray | null;
  const stops: Record<number, { ranges: [number, number][]; def: string }> = {};
  const re = /\$\{(\d+):([^}]*)\}|\$(\d+)/g;
  while ((m = re.exec(raw))) {
    out += raw.slice(last, m.index);
    const n = +(m[1] || m[3]);
    const st = stops[n] || (stops[n] = { ranges: [], def: '' });
    if (m[1] && !st.def) st.def = m[2];
    const text = m[1] ? m[2] : st.def;
    st.ranges.push([out.length, out.length + text.length]);
    out += text; last = re.lastIndex;
  }
  out += raw.slice(last);
  const base = ed.indexFromPos(from);
  ed.replaceRange(out, from, to, '+snippet');
  const order = Object.keys(stops).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  if (stops[0]) order.push(0);
  if (!order.length) return;
  snip = {
    idx: 0,
    stops: order.map(n => ({
      n,
      marks: stops[n].ranges.map(([a, b]) => ed.markText(ed.posFromIndex(base + a), ed.posFromIndex(base + b),
        { className: n ? 'snip-ph' : 'snip-end', inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false })),
    })),
  };
  selectStop(ed);
}
function selectStop(ed: CodeMirror.Editor) {
  const st = snip!.stops[snip!.idx];
  const r = st.marks[0].find() as CodeMirror.MarkerRange | undefined;
  if (!r) { endSnippet(); return; }
  ed.setSelection(r.from, r.to);
  if (st.n === 0) endSnippet();
}
/** Move between snippet fields. Returns true when the key was consumed. */
export function nextStop(ed: CodeMirror.Editor, dir: 1 | -1): boolean {
  if (!snip) return false;
  const ni = snip.idx + dir;
  if (ni < 0) return true;
  if (ni >= snip.stops.length) { endSnippet(); return false; }
  snip.idx = ni; selectStop(ed);
  return true;
}
export function endSnippet() {
  if (!snip) return;
  snip.stops.forEach(s => s.marks.forEach(m => m.clear()));
  snip = null;
}

/* ---------------- formatting (Prettier from CDN, loaded on first use) ---------------- */
const PRETTIER = 'https://cdn.jsdelivr.net/npm/prettier@3.3.3/';
let prettierP: Promise<void> | null = null;
const loadScript = (src: string) => new Promise<void>((ok, no) => {
  const s = document.createElement('script'); s.src = src; s.onload = () => ok(); s.onerror = () => no(new Error('load failed: ' + src));
  document.head.appendChild(s);
});
function loadPrettier() {
  return prettierP ||= (async () => {
    await loadScript(PRETTIER + 'standalone.js');
    await Promise.all([loadScript(PRETTIER + 'plugins/babel.js'), loadScript(PRETTIER + 'plugins/estree.js')]);
  })().catch(e => { prettierP = null; throw e; });
}
function wantSemi(src: string) {
  if (edset.semi !== 'auto') return edset.semi === 'yes';
  const n = (src.match(/;\s*(\/\/.*)?$/gm) || []).length;
  return n > src.split('\n').filter(l => l.trim()).length / 4;
}
/** Replace only the changed middle part so undo, scroll and cursor stay natural. */
function applyText(nt: string, cursorOffset: number | null) {
  const ot = cm.getValue(); if (nt === ot) return false;
  let a = 0; while (a < ot.length && a < nt.length && ot[a] === nt[a]) a++;
  let b = 0; while (b < ot.length - a && b < nt.length - a && ot[ot.length - 1 - b] === nt[nt.length - 1 - b]) b++;
  const from = cm.posFromIndex(a), to = cm.posFromIndex(ot.length - b), top = cm.getScrollInfo().top;
  cm.operation(() => {
    cm.replaceRange(nt.slice(a, nt.length - b), from, to, '+fmt');
    if (cursorOffset != null) cm.setCursor(cm.posFromIndex(cursorOffset));
    cm.scrollTo(null, top);
  });
  return true;
}
export async function formatCode(silent = false) {
  try {
    if (!silent) toast(L('Formatting…', 'Merapikan kode…'));
    await loadPrettier();
    const src = cm.getValue();
    const P = (window as any).prettier, plugins = (window as any).prettierPlugins;
    const res = await P.formatWithCursor(src, {
      cursorOffset: cm.indexFromPos(cm.getCursor()), parser: 'babel', plugins: Object.values(plugins || {}),
      semi: wantSemi(src), singleQuote: edset.quote === 'single', tabWidth: edset.indent, printWidth: 90, trailingComma: 'none', arrowParens: 'avoid',
    });
    if (cm.getValue() !== src) return; // user typed meanwhile
    let out: string = res.formatted;
    if (!src.endsWith('\n') && out.endsWith('\n')) out = out.slice(0, -1);
    if (silent && out.split('\n').length !== src.split('\n').length) return; // auto: never move lines
    const changed = applyText(out, Math.min(res.cursorOffset, out.length));
    if (!silent) toast(changed ? L('Formatted', 'Kode dirapikan') : L('Already tidy', 'Kode sudah rapi'));
  } catch (e) {
    if (silent) return;
    const msg = (e as Error).message || '';
    toast(/SyntaxError|Unexpected|Missing/.test(msg) ? L('Cannot format: syntax error', 'Tidak bisa merapikan: ada syntax error') : L('Format failed: ', 'Gagal merapikan: ') + msg.split('\n')[0]);
  }
}

/* ---------------- wiring ---------------- */
export function initIde() {
  // autocomplete while typing (but not inside a snippet field)
  cm.on('inputRead', (ed, ch) => {
    if (ch.origin !== '+input') return;
    const r = activeRange(); const c = ed.getCursor();
    if (r && CodeMirror.cmpPos(c, r.from) >= 0 && CodeMirror.cmpPos(c, r.to) <= 0) return;
    if (/^[\w$.]$/.test(ch.text.join('')) && !(ed.state as any).completionActive)
      ed.showHint({ hint: hint as any, completeSingle: false, closeCharacters: /[\s()[\]{};:>,=+\-*/!?&|<]/ });
  });
  cm.on('keydown', (_ed, e) => { if (e.key === 'Escape') endSnippet(); });

  // mirror snippet fields (e.g. every `i` of a for loop); any other edit ends the snippet
  cm.on('changes', (ed, changes) => {
    if (!snip) return;
    const user = changes.filter(c => c.origin !== '+snipmirror' && c.origin !== '+snippet');
    if (!user.length) return;
    const r = activeRange(); if (!r) { endSnippet(); return; }
    const inside = user.every(c => CodeMirror.cmpPos(c.from, r.from) >= 0 && CodeMirror.cmpPos(CodeMirror.changeEnd(c), r.to) <= 0);
    if (!inside) { endSnippet(); return; }
    const st = snip.stops[snip.idx]; if (st.marks.length < 2) return;
    const val = ed.getRange(r.from, r.to);
    ed.operation(() => {
      for (const mk of st.marks.slice(1)) {
        const q = mk.find() as CodeMirror.MarkerRange | undefined;
        if (q && ed.getRange(q.from, q.to) !== val) ed.replaceRange(val, q.from, q.to, '+snipmirror');
      }
    });
  });
  cm.on('cursorActivity', ed => {
    if (!snip) return;
    const r = activeRange(), c = ed.getCursor();
    if (!r || CodeMirror.cmpPos(c, r.from) < 0 || CodeMirror.cmpPos(c, r.to) > 0) endSnippet();
  });

  // gentle auto-format after a pause in typing
  let fmtT = 0;
  cm.on('changes', (ed, chs) => {
    if (chs.every(c => c.origin === '+fmt' || c.origin === 'setValue' || c.origin === '+snipmirror')) return;
    clearTimeout(fmtT);
    if (!edset.autoFmt) return;
    if (chs.some(c => c.origin === '+delete' || c.origin === 'cut' || c.origin === 'undo' || c.origin === 'redo')) return;
    const tick = (waited: boolean) => {
      const ca = (ed.state as any).completionActive;
      if (ca && ca.widget) { if (!waited) { fmtT = window.setTimeout(() => tick(true), 1300); return; } ca.close(); }
      if (snip || ed.somethingSelected()) return;
      if (!ed.getLine(ed.getCursor().line).trim()) return;
      try { acorn.parse(ed.getValue(), { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, allowHashBang: true }); } catch { return; }
      formatCode(true);
    };
    fmtT = window.setTimeout(() => tick(false), 1200);
  });

  // settings popover
  const pop = $('#edpop'), btn = $('#edsetBtn');
  btn.onclick = e => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); };
  document.addEventListener('click', e => {
    if (!pop.hidden && !pop.contains(e.target as Node) && e.target !== btn) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  });
  const bind = (id: string, key: keyof EditorSettings, conv?: (v: string) => unknown) => {
    const el = $<HTMLInputElement>('#' + id);
    if (el.type === 'checkbox') el.checked = edset[key] as boolean; else el.value = String(edset[key]);
    el.onchange = () => {
      (edset as any)[key] = el.type === 'checkbox' ? el.checked : conv ? conv(el.value) : el.value;
      applySettings();
      if (key === 'indent' || key === 'semi' || key === 'quote') formatCode(false);
    };
  };
  bind('opAuto', 'autoFmt'); bind('opSave', 'fmtSave'); bind('opIndent', 'indent', Number);
  bind('opSemi', 'semi'); bind('opQuote', 'quote'); bind('opFont', 'font', Number);
  $('#fmt').onclick = () => formatCode(false);
  applySettings();
  if (edset.autoFmt) setTimeout(() => loadPrettier().catch(() => {}), 1500);
}

/** Extra key bindings merged into the editor's keymap. */
export const ideKeys: CodeMirror.KeyMap = {
  'Ctrl-Space': c => c.showHint({ hint: ((e: CodeMirror.Editor) => hint(e, { explicit: true })) as any, completeSingle: false }),
  'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment',
  'Shift-Alt-F': () => { formatCode(false); },
  'Shift-Tab': c => { if (nextStop(c, -1)) return; c.execCommand('indentLess'); },
  'Tab': c => {
    if (snip && nextStop(c, 1)) return;
    if (c.somethingSelected()) c.execCommand('indentMore'); else c.execCommand('insertSoftTab');
  },
};
