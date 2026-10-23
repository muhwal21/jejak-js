import { fmtArgs, fmtMs, previewOf, resolvePath, toPlain, type Entry, type Ser } from '../core/session';
import { state, store, type Tab } from '../state';
import { t } from '../i18n';
import { $, el, copyText } from './dom';
import { tree, graph } from './tree';
import { cm } from './editor';
import { guideHtml } from './guide';

let tmOpen: (i: number) => void = () => {};
export function setTmOpener(fn: (i: number) => void) { tmOpen = fn; }

export function lnBtn(line: number) {
  const b = el('button', 'ln', 'L' + line);
  b.title = 'L' + line;
  b.onclick = () => { cm.focus(); cm.setCursor({ line: line - 1, ch: 0 }); cm.scrollIntoView({ line: line - 1, ch: 0 }, 80); };
  return b;
}
function keepScroll(p: HTMLElement, fn: () => void) { const s = p.scrollTop; p.textContent = ''; fn(); p.scrollTop = s; }
const fnName = (fid: number) => state.run?.meta?.cov[fid]?.name ?? '?';

export function selectTab(tab: Tab) {
  state.tab = tab;
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.tab === tab)));
  document.querySelectorAll<HTMLElement>('.panel').forEach(p => { p.hidden = p.id !== 'p-' + tab; });
  renderPanels();
}

export function renderPanels() {
  const r = state.run;
  $('#nExp').textContent = String(r ? r.vals.filter(v => v.kind !== 'peek').length + r.logs.length : 0);
  $('#nCon').textContent = String(r ? r.logs.length + r.errors.length : 0);
  $('#nSteps').textContent = String(r ? r.steps.length : 0);
  ({ explorer: renderExplorer, console: renderConsole, story: renderStory, debug: renderDebug, guide: renderGuide })[state.tab]();
}

function renderExplorer() {
  const p = $('#p-explorer'), r = state.run;
  keepScroll(p, () => {
    if (!r || r.syntax) { p.appendChild(el('div', 'empty-note', r?.syntax ? t('fixSyntax', { line: r.syntax.line, msg: r.syntax.msg }) : t('noResult'))); return; }
    const items: Entry[] = [...r.vals.filter(v => v.kind !== 'peek'), ...r.logs, ...r.errors].filter(o => !state.tm.on || o.step <= state.tm.i);
    if (!items.length) { p.appendChild(el('div', 'empty-note', t('noValues'))); return; }
    const groups = new Map<string, Entry[]>();
    for (const o of items) {
      const key = o.type + ':' + o.line + ':' + (o.type === 'val' ? o.src : o.type === 'log' ? o.m : '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    }
    const gs = [...groups.entries()].sort((a, b) => a[1][0].line - b[1][0].line || a[1][0].order - b[1][0].order);
    for (const [key, arr] of gs) {
      const last = arr[arr.length - 1];
      const box = el('div', 'entry'); const h = el('div', 'ehead');
      h.appendChild(lnBtn(last.line));
      const kind = last.type === 'log' ? 'console.' + last.m : last.type === 'err' ? t('kindError')
        : last.kind === 'lp' ? t('kindLogpoint') : last.kind === 'inline' ? t('kindPinned') : t('kindValue');
      h.appendChild(el('span', 'kind ' + (last.type === 'log' ? 'lg' : last.type === 'err' ? 'er' : 'val'), kind));
      h.appendChild(el('code', null, last.type === 'val' ? last.src : last.type === 'err' ? last.name : ''));
      if (arr.length > 1) h.appendChild(el('span', 'kind', arr.length + '×'));
      if (last.type === 'val' && last.ms != null) h.appendChild(el('span', 'ms-badge', fmtMs(last.ms)));
      const vals: Ser[] = last.type === 'log' ? last.a : last.type === 'val' ? [last.v] : last.v ? [last.v] : [];
      const cp = el('button', 'mini', t('copy'));
      cp.onclick = () => copyText(vals.map(v => { const pl = toPlain(v); return typeof pl === 'string' ? pl : JSON.stringify(pl, null, 2); }).join('\n'));
      h.appendChild(cp);
      const gkey = 'G' + key;
      let gbtn: HTMLButtonElement | null = null;
      if (vals.some(v => v.c && v.c.length)) { gbtn = el('button', 'mini', state.expanded.has(gkey) ? t('tree') : t('graph')); h.appendChild(gbtn); }
      box.appendChild(h);
      const body = el('div');
      const fill = () => {
        body.textContent = '';
        if (state.expanded.has(gkey)) { for (const v of vals) if (v.c) body.appendChild(graph(v)); }
        else if (last.type === 'log' && vals.every(v => !v.c || !v.c.length)) body.appendChild(el('div', 'tree', fmtArgs(vals)));
        else if (last.type === 'err') body.appendChild(el('div', 'tree t-err', previewOf(last)));
        else { const tr = el('div', 'tree'); vals.forEach((v, i) => tr.appendChild(tree(v, vals.length > 1 ? 'arg' + i : null, key + '#' + i, (v.n ?? 0) <= 12 ? 1 : 0))); body.appendChild(tr); }
      };
      if (gbtn) gbtn.onclick = () => { state.expanded.has(gkey) ? state.expanded.delete(gkey) : state.expanded.add(gkey); gbtn!.textContent = state.expanded.has(gkey) ? t('tree') : t('graph'); fill(); };
      fill(); box.appendChild(body); p.appendChild(box);
    }
  });
}

function renderConsole() {
  const p = $('#p-console'), r = state.run;
  keepScroll(p, () => {
    if (!r || (!r.logs.length && !r.errors.length)) { p.appendChild(el('div', 'empty-note', r?.syntax ? 'SyntaxError: ' + r.syntax.msg : t('consoleEmpty'))); return; }
    const c = el('div', 'con');
    for (const o of r.chron) {
      if (o.type === 'val') continue;
      if (state.tm.on && o.step > state.tm.i) continue;
      const row = el('div', 'crow' + (o.type === 'err' ? ' e' : ''));
      row.appendChild(lnBtn(o.line));
      const args = el('div', 'args');
      if (o.type === 'err') {
        args.appendChild(el('div', 'raw', '✖ ' + o.name + ': ' + o.msg));
        if (o.path.length) args.appendChild(el('div', 'raw', '   ' + t('errPath') + ': ' + [...o.path].reverse().map(l => 'L' + l).join(' → ') + ' → L' + o.line));
      } else if (o.a.every(a => !a.c || !a.c.length)) args.appendChild(el('div', 'raw', fmtArgs(o.a)));
      else { const tr = el('div', 'tree'); o.a.forEach((a, i) => tr.appendChild(tree(a, null, 'con' + o.order + '#' + i, 0))); args.appendChild(tr); }
      row.appendChild(args); c.appendChild(row);
    }
    p.appendChild(c);
  });
}

function renderStory() {
  const p = $('#p-story'), r = state.run;
  p.textContent = '';
  if (!r || !r.steps.length) { p.appendChild(el('div', 'empty-note', t('storyEmpty'))); return; }
  const lines = r.src.split('\n');
  const note = el('div', 'empty-note', t('storyNote', { n: r.steps.length, cap: r.steps.length >= 5000 ? t('storyCap') : '' }));
  note.style.padding = '0 4px 8px'; p.appendChild(note);
  let lastFn = '';
  const frag = document.createDocumentFragment();
  let curEl: HTMLElement | null = null;
  const max = Math.min(r.steps.length, 3000);
  for (let i = 0; i < max; i++) {
    const s = r.steps[i]; const top = s.stack[s.stack.length - 1]; const depth = s.stack.length;
    const fkey = top ? top.fid + ':' + depth : 'top';
    if (fkey !== lastFn) {
      lastFn = fkey;
      const h = el('div', 'fnh', top ? '↳ ' + fnName(top.fid) + '()  ' + t('calledFrom', { line: top.callLine }) + (top.async ? ' · ' + t('asyncTag') : '') : t('mainProgram'));
      h.style.paddingLeft = (6 + depth * 10) + 'px'; frag.appendChild(h);
    }
    const row = el('div', 'srow' + (state.tm.on && i === state.tm.i ? ' cur' : ''));
    row.appendChild(el('span', 'sn', '#' + (i + 1)));
    row.appendChild(el('span', 'sl', s.end ? t('end') : 'L' + s.line));
    const code = el('span', 'sc', s.end ? t('programEnd') : (lines[s.line - 1] || '').trim());
    code.style.paddingLeft = (depth * 10) + 'px'; row.appendChild(code);
    for (const o of s.logs) {
      if (o.type === 'val' && o.kind === 'peek') continue;
      const out = el('span', 'out' + (o.type === 'val' ? ' v' : o.type === 'err' ? ' e' : ''), (o.type === 'log' ? '› ' : o.type === 'err' ? '✖ ' : '= ') + previewOf(o));
      out.style.paddingLeft = (depth * 10) + 'px'; row.appendChild(out);
    }
    row.onclick = () => tmOpen(i);
    if (state.tm.on && i === state.tm.i) curEl = row;
    frag.appendChild(row);
  }
  p.appendChild(frag);
  if (curEl) { const pr = p.getBoundingClientRect(), cr = curEl.getBoundingClientRect(); if (cr.top < pr.top || cr.bottom > pr.bottom) p.scrollTop += cr.top - pr.top - pr.height / 2; }
}

function renderDebug() {
  const p = $('#p-debug'), r = state.run;
  keepScroll(p, () => {
    if (!r || !r.steps.length) { p.appendChild(el('div', 'empty-note', t('debugEmpty'))); return; }
    const i = state.tm.on ? state.tm.i : r.steps.length - 1; const s = r.steps[i];
    const info = el('div', 'empty-note', state.tm.on ? t('debugStep', { i: i + 1, n: r.steps.length, line: s.line }) : t('debugInactive'));
    info.style.padding = '0 0 10px'; p.appendChild(info);
    // watch
    const w = el('div', 'sec'); w.appendChild(el('h3', null, t('watch')));
    const f = el('form', 'watchf'); const inp = el('input'); inp.id = 'watchIn'; inp.placeholder = t('watchPh');
    const add = el('button', 'mini', t('add')); f.append(inp, add);
    f.onsubmit = e => { e.preventDefault(); const v = inp.value.trim(); if (v && !state.watches.includes(v)) { state.watches.push(v); store.set('watch', state.watches); } renderDebug(); };
    w.appendChild(f);
    const wt = el('div', 'tree');
    for (const wx of state.watches) {
      const val = resolvePath(s.vars, wx) || { t: 'tdz', p: t('notInScope') };
      const row = el('div'); row.style.cssText = 'display:flex;gap:6px;align-items:flex-start';
      const tr = tree(val, wx, 'w:' + wx, 0); tr.style.flex = '1'; tr.style.minWidth = '0';
      const x = el('button', 'mini', '×'); x.title = t('removeWatch');
      x.onclick = () => { state.watches.splice(state.watches.indexOf(wx), 1); store.set('watch', state.watches); renderDebug(); };
      row.append(tr, x); wt.appendChild(row);
    }
    if (!state.watches.length) wt.appendChild(el('div', 'empty-note', t('noWatch')));
    w.appendChild(wt); p.appendChild(w);
    // stack
    const st = el('div', 'sec stack'); st.appendChild(el('h3', null, t('callStack')));
    const frames = [...s.stack].reverse();
    const cur = el('div');
    cur.append(lnBtn(s.line), el('span', null, (frames[0] ? fnName(frames[0].fid) : t('mainProgram')) + '  ' + t('now')));
    if (frames[0]?.async) cur.appendChild(el('span', 'async', t('asyncTag')));
    st.appendChild(cur);
    frames.forEach((fr, k) => {
      const d = el('div');
      d.append(lnBtn(fr.callLine), el('span', null, frames[k + 1] ? fnName(frames[k + 1].fid) : t('mainProgram')));
      if (frames[k + 1]?.async) d.appendChild(el('span', 'async', t('asyncTag')));
      st.appendChild(d);
    });
    p.appendChild(st);
    // vars
    const v = el('div', 'sec'); v.appendChild(el('h3', null, t('scopeVars'))); const vt = el('div', 'tree');
    const ents = Object.entries(s.vars);
    if (!ents.length) vt.appendChild(el('div', 'empty-note', t('noVars')));
    for (const [k, val] of ents) vt.appendChild(tree(val, k, 'v:' + k, 0));
    v.appendChild(vt); p.appendChild(v);
  });
}

function renderGuide() { const p = $('#p-guide'); p.innerHTML = guideHtml(); }
