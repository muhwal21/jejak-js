/** Value Peek: hover an identifier (recorded snapshots) or select any expression (evaluated for real). */
import { resolvePath, type Ser } from '../core/session';
import { state } from '../state';
import { t } from '../i18n';
import { $, el } from './dom';
import { tree } from './tree';
import { cm, lineEntries } from './editor';
import { previewOf, fmtMs } from '../core/session';
import { copyText } from './dom';

let peekEl: HTMLElement;
let hoverT = 0, selT = 0;

export function lookup(expr: string, line: number): { v: Ser; where: string } | null {
  const r = state.run; if (!r || !r.steps.length) return null;
  const root = expr.split(/[.[]/)[0];
  const S = r.steps;
  if (state.tm.on) { const v = resolvePath(S[state.tm.i].vars, expr); if (v) return { v, where: t('peekWhere', { i: state.tm.i + 1 }) }; }
  // value right after the line ran: the next step at the same or shallower depth
  let last = -1;
  for (let i = S.length - 1; i >= 0; i--) if (S[i].line === line) { last = i; break; }
  if (last >= 0) for (let i = last + 1; i < S.length; i++) {
    if (S[i].stack.length <= S[last].stack.length && root in S[i].vars) {
      const v = resolvePath(S[i].vars, expr); if (v) return { v, where: t('peekAfter', { line }) };
    }
    if (S[i].stack.length < S[last].stack.length) break;
  }
  for (let i = S.length - 1; i >= 0; i--) if (root in S[i].vars && S[i].vars[root].t !== 'tdz') {
    const v = resolvePath(S[i].vars, expr); if (v) return { v, where: t('peekLast', { line: S[i].line }) };
  }
  return null;
}

function exprAt(pos: CodeMirror.Position) {
  const line = cm.getLine(pos.line); let s = pos.ch, e = pos.ch;
  while (e < line.length && /[\w$]/.test(line[e])) e++;
  while (s > 0 && /[\w$.\][]/.test(line[s - 1])) s--;
  const ex = line.slice(s, e).replace(/^\.+/, '');
  return /^[A-Za-z_$]/.test(ex) ? ex : null;
}

export function showPeek(x: number, y: number, label: string, v: Ser | null, where: string) {
  peekEl.textContent = '';
  peekEl.appendChild(el('div', 'ph', label.length > 60 ? label.slice(0, 59) + '…' : label));
  if (v) { const tr = el('div', 'tree'); tr.appendChild(tree(v, null, 'peek:' + label, 1)); peekEl.appendChild(tr); }
  peekEl.appendChild(el('div', 'pv-note', where));
  peekEl.hidden = false;
  const w = peekEl.offsetWidth, h = peekEl.offsetHeight;
  peekEl.style.left = Math.max(8, Math.min(x, innerWidth - w - 12)) + 'px';
  peekEl.style.top = (y + h + 24 > innerHeight ? y - h - 8 : y + 20) + 'px';
}
export const hidePeek = () => { peekEl.hidden = true; };

/** Called after a run that carried a peek request finishes. */
export function showPeekResult() {
  const p = state.peek, r = state.run;
  if (!p || !r || !r.meta) return;
  if (r.meta.peekId == null) { showPeek(p.x, p.y, p.text, null, t('peekNotExpr')); return; }
  const all = r.vals.filter(v => v.kind === 'peek' && (!state.tm.on || v.step <= state.tm.i));
  if (!all.length) { showPeek(p.x, p.y, p.text, null, t('peekNever')); return; }
  showPeek(p.x, p.y, p.text, all[all.length - 1].v, t('peekEval', { n: all.length }));
}

export function initPeek(runPeek: () => void) {
  peekEl = $('#peek');
  const wrap = cm.getWrapperElement();
  wrap.addEventListener('mousemove', e => {
    clearTimeout(hoverT);
    if ((e.target as HTMLElement).closest('.iv')) return; // inline values have their own hover
    if (cm.somethingSelected()) return;
    hoverT = window.setTimeout(() => {
      if ((e.target as HTMLElement).closest('.CodeMirror-gutters')) return;
      const pos = cm.coordsChar({ left: e.clientX, top: e.clientY }, 'window');
      const tok = cm.getTokenAt({ line: pos.line, ch: pos.ch + 1 });
      if (!tok || !/variable|property|def/.test(tok.type || '')) { hidePeek(); return; }
      const ex = exprAt({ line: pos.line, ch: tok.start } as CodeMirror.Position);
      if (!ex) { hidePeek(); return; }
      const res = lookup(ex, pos.line + 1);
      if (!res) { hidePeek(); return; }
      showPeek(e.clientX, e.clientY, ex, res.v, res.where);
    }, 260);
  });
  wrap.addEventListener('mouseleave', () => { clearTimeout(hoverT); setTimeout(() => { if (!peekEl.matches(':hover') && !state.peek) hidePeek(); }, 200); });
  peekEl.addEventListener('mouseleave', () => { if (!state.peek) hidePeek(); });

  cm.on('cursorActivity', () => {
    clearTimeout(selT);
    if (!cm.somethingSelected()) { if (state.peek) { state.peek = null; hidePeek(); } return; }
    selT = window.setTimeout(() => {
      const text = cm.getSelection();
      if (!text.trim() || text.length > 300 || cm.getValue() !== state.run?.src) return;
      const from = cm.getCursor('from'), to = cm.getCursor('to');
      const c = cm.cursorCoords(to, 'window');
      const s = cm.indexFromPos(from), e = cm.indexFromPos(to);
      if (state.peek && state.peek.s === s && state.peek.e === e) return;
      state.peek = { s, e, text: text.trim(), x: c.left, y: c.top };
      runPeek();
    }, 350);
  });
}

/** Hover on the inline values of a line: list every execution (like Quokka's hover). */
export function showLineValues(line: number, x: number, y: number) {
  const arr = lineEntries.get(line); if (!arr || !arr.length) return;
  peekEl.textContent = '';
  const head = el('div', 'ph');
  head.append(el('span', null, 'L' + line + ' · ' + arr.length + '×'));
  const cp = el('button', 'mini', t('copy'));
  cp.onclick = () => copyText(arr.map(o => previewOf(o)).join('\n'));
  head.appendChild(cp);
  peekEl.appendChild(head);
  const list = el('div', 'tree pv-list');
  arr.slice(0, 300).forEach((o, i) => {
    const row = el('div', 'pv-row');
    row.appendChild(el('span', 'pv-i', '#' + (i + 1)));
    const body = el('div'); body.style.minWidth = '0'; body.style.flex = '1';
    if (o.type === 'err') body.appendChild(el('span', 't-err', previewOf(o)));
    else if (o.type === 'log') {
      if (o.a.every(a => !a.c || !a.c.length)) body.appendChild(el('span', 'p', previewOf(o)));
      else o.a.forEach((a, k) => body.appendChild(tree(a, null, 'lv' + line + ':' + i + ':' + k, 0)));
    } else body.appendChild(o.v.c && o.v.c.length ? tree(o.v, null, 'lv' + line + ':' + i, 0) : el('span', 'p t-' + o.v.t, o.v.p));
    if (o.type === 'val' && o.ms != null) body.appendChild(el('span', 'ms-badge', ' ' + fmtMs(o.ms)));
    row.appendChild(body);
    list.appendChild(row);
  });
  if (arr.length > 300) list.appendChild(el('div', 'pv-note', '… +' + (arr.length - 300)));
  peekEl.appendChild(list);
  peekEl.hidden = false;
  const w = peekEl.offsetWidth, h = peekEl.offsetHeight;
  peekEl.style.left = Math.max(8, Math.min(x, innerWidth - w - 12)) + 'px';
  peekEl.style.top = (y + h + 24 > innerHeight ? Math.max(8, y - h - 8) : y + 18) + 'px';
}
