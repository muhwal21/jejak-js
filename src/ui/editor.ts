import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/comment/comment';
import 'codemirror/addon/selection/active-line';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/comment-fold';
import 'codemirror/addon/dialog/dialog';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/search/search';
import 'codemirror/keymap/sublime';
import { computeCoverage } from '../core/coverage';
import { previewOf, fmtMs, type Entry } from '../core/session';
import { state } from '../state';
import { t } from '../i18n';

export let cm: CodeMirror.Editor;

export function createEditor(host: HTMLElement, value: string, extraKeys: CodeMirror.KeyMap) {
  cm = CodeMirror(host, {
    value, mode: 'javascript', lineNumbers: true, gutters: ['CodeMirror-linenumbers', 'jj-cov', 'CodeMirror-foldgutter'],
    tabSize: 2, indentUnit: 2, lineWrapping: false, extraKeys, keyMap: 'sublime',
    matchBrackets: true, autoCloseBrackets: "()[]{}''\"\"``", styleActiveLine: true, foldGutter: true,
  } as CodeMirror.EditorConfiguration);
  return cm;
}

let marks: CodeMirror.TextMarker[] = [];
/** entries shown on each line (1-based), used by the hover popup */
export const lineEntries = new Map<number, Entry[]>();
let onInlineHover: (line: number, x: number, y: number) => void = () => {};
export function setInlineHover(fn: typeof onInlineHover) { onInlineHover = fn; }
let lineClasses: number[] = [];
let tmLine: number | null = null;

function gutterMarker(cls: string, title: string) {
  const d = document.createElement('div');
  d.className = 'cov ' + cls; d.title = title;
  d.appendChild(document.createElement('i'));
  return d;
}
function addInline(line: number, parts: { cls?: string; t: string }[], first = false) {
  const span = document.createElement('span');
  span.className = 'iv';
  span.addEventListener('mouseenter', e => onInlineHover(line + 1, e.clientX, e.clientY));
  span.addEventListener('mouseleave', () => setTimeout(() => {
    const pk = document.getElementById('peek');
    if (pk && !pk.matches(':hover') && !state.peek) pk.hidden = true;
  }, 250));
  for (const p of parts) { const s = document.createElement('span'); if (p.cls) s.className = p.cls; s.textContent = p.t; span.appendChild(s); }
  marks.push(cm.setBookmark({ line, ch: cm.getLine(line).length }, { widget: span, insertLeft: !first }));
}
const posOf = (off: number) => cm.posFromIndex(off);

/** Coverage gutter, inline values, error marks, Time Machine line. */
export function renderEditor() {
  const r = state.run; if (!r) return;
  cm.operation(() => {
    marks.forEach(m => m.clear()); marks = [];
    lineClasses.forEach(l => cm.removeLineClass(l, 'background', 'err-line')); lineClasses = [];
    cm.clearGutter('jj-cov');
    const n = cm.lineCount();
    // the run may be stale while the user types; only decorate if text matches
    // offset-based marks only when the instrumented text is exactly the editor text (not for TypeScript)
    const fresh = cm.getValue() === r.src && r.lang !== 'ts';
    if (r.syntax) {
      const l = Math.min(r.syntax.line, n) - 1;
      cm.setGutterMarker(l, 'jj-cov', gutterMarker('err', 'SyntaxError'));
      cm.addLineClass(l, 'background', 'err-line'); lineClasses.push(l);
      addInline(l, [{ cls: 'er', t: '✖ SyntaxError: ' + r.syntax.msg }]);
      return;
    }
    if (!r.meta) return;
    const cov = computeCoverage(r.meta.cov, r.hits, r.errors);
    for (let l = 1; l <= n; l++) {
      const txt = cm.getLine(l - 1); const s = cov.stat[l]; const lp = state.logpoints.has(l);
      if (!s || !txt.trim() || /^\s*(\/\/|\/\*|\*)/.test(txt)) {
        cm.setGutterMarker(l - 1, 'jj-cov', gutterMarker('empty' + (lp ? ' lp' : ''), lp ? t('lpOnTip') : t('lpTip')));
        continue;
      }
      const label = { ok: t('covOk'), part: t('covPart'), none: t('covNone'), err: t('covErr'), path: t('covPath') }[s];
      cm.setGutterMarker(l - 1, 'jj-cov', gutterMarker(s + (lp ? ' lp' : ''), label + (cov.counts[l] ? ` · ${cov.counts[l]}×` : '') + (lp ? ' · logpoint' : '')));
    }
    if (fresh) {
      for (const u of cov.uncovered) marks.push(cm.markText(posOf(u.s), posOf(u.e), { className: 'uncov' }));
      for (const v of r.meta.vals) if (v.kind === 'inline') marks.push(cm.markText(posOf(v.s), posOf(v.e), { className: 'pin-mark' }));
    }
    for (const e of r.errors) {
      if (e.line > n) continue;
      cm.addLineClass(e.line - 1, 'background', 'err-line'); lineClasses.push(e.line - 1);
      if (fresh && e.col != null) {
        const from = { line: e.line - 1, ch: e.col };
        const word = cm.findWordAt({ line: e.line - 1, ch: e.col + 1 });
        const to = word.head.ch > e.col ? word.head : { line: e.line - 1, ch: Math.min(cm.getLine(e.line - 1).length, e.col + 1) };
        marks.push(cm.markText(from, to, { className: 'err-mark' }));
      }
    }
    // inline values per line
    const upto = state.tm.on && r.steps.length ? state.tm.i : Infinity;
    const byLine = new Map<number, Entry[]>();
    for (const o of r.chron) {
      if (o.step > upto) continue;
      if (o.type === 'val' && o.kind === 'peek') continue;
      if (!byLine.has(o.line)) byLine.set(o.line, []);
      byLine.get(o.line)!.push(o);
    }
    lineEntries.clear();
    for (const [line, arr] of byLine) {
      if (line > n) continue;
      lineEntries.set(line, arr);
      const parts: { cls?: string; t: string }[] = [];
      const errs = arr.filter(o => o.type === 'err');
      if (errs.length) { const e = errs[errs.length - 1]; parts.push({ cls: 'er', t: '✖ ' + previewOf(e) }); }
      else {
        // like Quokka: every execution of the line, in order, cut off by width (hover shows all)
        let len = 0;
        for (const o of arr) {
          let tx = previewOf(o);
          if (o.type === 'val' && o.kind === 'inline') tx = o.src.slice(0, 24) + (o.src.length > 24 ? '…' : '') + ': ' + tx;
          if (tx.length > 80) tx = tx.slice(0, 79) + '…';
          len += tx.length;
          if (len > 160) { parts.push({ cls: 'lg', t: '…' }); break; }
          parts.push({ cls: o.type === 'log' ? 'lg' : o.type === 'val' && o.kind === 'inline' ? 'pn' : '', t: tx + ' ' });
          if (o.type === 'val' && o.ms != null) parts.push({ cls: 'ms', t: fmtMs(o.ms) + ' ' });
        }
      }
      addInline(line - 1, parts);
    }
    if (state.tm.on && r.steps[state.tm.i]) {
      const st = r.steps[state.tm.i];
      const vs = Object.entries(st.vars).filter(([, v]) => v.t !== 'fn').map(([k, v]) => k + ' = ' + (v.p.length > 40 ? v.p.slice(0, 39) + '…' : v.p));
      if (vs.length && st.line <= n) addInline(st.line - 1, [{ cls: 'vars', t: '⟵ ' + vs.join(', ') }], true);
    }
  });
  renderTmLine();
}

export function renderTmLine() {
  if (tmLine != null) { cm.removeLineClass(tmLine, 'background', 'tm-line'); tmLine = null; }
  const r = state.run;
  if (!state.tm.on || !r || !r.steps.length) return;
  const s = r.steps[Math.min(state.tm.i, r.steps.length - 1)];
  if (s.line <= cm.lineCount()) {
    tmLine = s.line - 1;
    cm.addLineClass(tmLine, 'background', 'tm-line');
    if (!s.end) cm.scrollIntoView({ line: s.line - 1, ch: 0 }, 60);
  }
}
