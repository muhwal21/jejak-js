import 'codemirror/lib/codemirror.css';
import './styles.css';
import { state, store, saveLogpoints, savePins, type Mode, type Tab } from './state';
import { t, setLang, getLang, detectLang, type Lang, type Key } from './i18n';
import { EXAMPLES } from './examples';
import { execute, setRunHooks } from './runner';
import { computeCoverage } from './core/coverage';
import { fmtMs, previewOf } from './core/session';
import { encodeShare, decodeShare } from './core/share';
import { REPO_URL } from './config';
import { $, el, toast, copyText } from './ui/dom';
import { createEditor, renderEditor, cm } from './ui/editor';
import { renderPanels, selectTab, setTmOpener } from './ui/panels';
import { initTimeMachine, renderTmBar, tmOn, tmStep, tmJump } from './ui/timemachine';
import { initPeek, showPeekResult, hidePeek } from './ui/peek';

/* ---------- language ---------- */
setLang(store.get<Lang>('lang', detectLang()));
function applyI18n() {
  document.documentElement.lang = getLang();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n as Key); });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(n => { n.title = t(n.dataset.i18nTitle as Key); });
  const ex = $<HTMLSelectElement>('#ex');
  ex.textContent = '';
  const ph = el('option', null, t('pickExample')); ph.value = ''; ph.disabled = true; ex.appendChild(ph);
  EXAMPLES.forEach((e, i) => { const o = el('option', null, e.name[getLang()]); o.value = String(i); ex.appendChild(o); });
  ex.value = '';
  $('#tmToggle').textContent = state.tm.on ? t('tmClose') : t('tmStart');
  $<HTMLSelectElement>('#lang').value = getLang();
}

/* ---------- initial code: shared link > saved draft > first example ---------- */
const shared = decodeShare(location.hash);
let initial = store.get<string | null>('code', null) ?? EXAMPLES[0].code[getLang()];
if (shared) {
  initial = shared.code;
  state.logpoints = new Set(shared.logpoints || []);
  history.replaceState(null, '', location.pathname + location.search);
}

/* ---------- editor ---------- */
const run = () => { state.peek = null; hidePeek(); execute(cm.getValue()); };
createEditor($('#editor'), initial, {
  'Ctrl-Enter': run, 'Cmd-Enter': run, 'Ctrl-S': run, 'Cmd-S': run,
  'F9': () => toggleLogpoint(cm.getCursor().line + 1),
  'Shift-F9': () => togglePin(),
  'Alt-Right': () => tmStep('into'), 'Alt-Left': () => tmStep('back'),
  'Alt-Down': () => tmStep('over'), 'Alt-Up': () => tmStep('out'), 'Alt-J': () => tmJump(),
  'Tab': c => c.execCommand('insertSoftTab'),
});

let typeT = 0;
cm.on('change', () => {
  store.set('code', cm.getValue());
  if (state.mode === 'auto') { clearTimeout(typeT); typeT = window.setTimeout(run, 450); }
});
cm.on('gutterClick', (_c, line, gutter) => { if (gutter === 'jj-cov' || gutter === 'CodeMirror-linenumbers') toggleLogpoint(line + 1); });

function toggleLogpoint(line: number) {
  if (state.logpoints.has(line)) state.logpoints.delete(line); else state.logpoints.add(line);
  saveLogpoints();
  toast(state.logpoints.has(line) ? t('lpOn', { line }) : t('lpOff', { line }));
  run();
}
function togglePin() {
  const text = cm.getSelection().trim();
  if (!text || text.includes('\n')) { toast(t('selectToPin')); return; }
  const line = cm.getCursor('from').line + 1;
  const i = state.pins.findIndex(p => p.line === line && p.text === text);
  if (i >= 0) { state.pins.splice(i, 1); toast(t('unpinned', { expr: text })); }
  else { state.pins.push({ line, text }); toast(t('pinned', { expr: text })); }
  savePins(); run();
}

/* ---------- render everything ---------- */
function renderStatus() {
  const r = state.run; if (!r) return;
  const pill = $('#pill'), txt = $('#stText');
  const set = (cls: string, s: string) => { pill.className = 'pill ' + cls; txt.textContent = s; };
  if (r.syntax) { set('err', t('syntaxAt', { line: r.syntax.line })); $('#stCov').textContent = ''; $('#stSteps').textContent = ''; return; }
  const ms = fmtMs((r.doneAt ?? performance.now()) - r.t0);
  if (r.status === 'run') set('run', t('running'));
  else if (r.errors.length) set('err', t('errors', { n: r.errors.length, ms }));
  else set('ok', t('done', { ms }));
  if (r.meta) { const c = computeCoverage(r.meta.cov, r.hits); $('#stCov').textContent = c.total ? t('coverage', { p: c.percent, hit: c.hit, total: c.total }) : ''; }
  $('#stSteps').textContent = r.steps.length ? t('steps', { n: r.steps.length + (r.steps.length >= 5000 ? '+' : '') }) : '';
}
function renderAll() {
  renderEditor();
  renderTmBar();
  renderPanels();
  renderStatus();
}
setRunHooks({ render: renderAll, onDone: () => { if (state.peek) showPeekResult(); } });
setTmOpener(i => tmOn(i));
initTimeMachine(renderAll);
initPeek(() => execute(cm.getValue()));

/* ---------- toolbar ---------- */
$<HTMLSelectElement>('#ex').onchange = e => {
  const ex = EXAMPLES[+(e.target as HTMLSelectElement).value];
  if (!ex) return;
  state.logpoints.clear(); saveLogpoints();
  state.pins = []; savePins();
  cm.setValue(ex.code[getLang()]);
  run();
  (e.target as HTMLSelectElement).value = '';
};
const modeBtns = document.querySelectorAll<HTMLButtonElement>('.seg button');
const paintMode = () => modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
modeBtns.forEach(b => b.onclick = () => {
  state.mode = b.dataset.mode as Mode; store.set('mode', state.mode); paintMode();
  toast(t(state.mode === 'auto' ? 'modeAutoToast' : state.mode === 'save' ? 'modeSaveToast' : 'modeManualToast'));
});
paintMode();
const logAll = $<HTMLInputElement>('#logall');
logAll.checked = state.logAll;
logAll.onchange = () => { state.logAll = logAll.checked; store.set('logall', state.logAll); run(); };
$('#run').onclick = run;
$<HTMLSelectElement>('#lang').onchange = e => {
  setLang((e.target as HTMLSelectElement).value as Lang); store.set('lang', getLang());
  applyI18n(); renderAll();
};
$('#share').onclick = () => {
  const url = location.origin + location.pathname + '#' + encodeShare({ code: cm.getValue(), logpoints: [...state.logpoints] });
  copyText(url, t('linkCopied'));
};
$('#copyclip').onclick = () => {
  const r = state.run; if (!r) return;
  const by: Record<number, string[]> = {};
  for (const o of r.chron) {
    if (o.type === 'val' && o.kind === 'peek') continue;
    (by[o.line] = by[o.line] || []).push((o.type === 'err' ? '✖ ' : '') + previewOf(o));
  }
  const out = r.src.split('\n').map((line, i) => {
    const a = by[i + 1]; if (!a) return line;
    let s = a.slice(-5).join(' '); if (s.length > 120) s = s.slice(0, 119) + '…';
    return line + '  // → ' + s.replace(/\n/g, ' ');
  });
  copyText(out.join('\n'));
};
document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(b => b.onclick = () => selectTab(b.dataset.tab as Tab));
($('#ghLink') as HTMLAnchorElement).href = REPO_URL;

applyI18n();
run();
