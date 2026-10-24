import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/dialog/dialog.css';
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
import { initPeek, showPeekResult, hidePeek, showLineValues } from './ui/peek';
import { initIde, ideKeys, edset, formatCode } from './ui/ide';
import CodeMirror from 'codemirror';
import { setInlineHover } from './ui/editor';

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
if (shared?.lang) state.codeLang = shared.lang;
if (shared) {
  initial = shared.code;
  state.logpoints = new Set(shared.logpoints || []);
  history.replaceState(null, '', location.pathname + location.search);
}

/* ---------- editor ---------- */
const run = () => { state.peek = null; hidePeek(); execute(cm.getValue()); };
const saveRun = async () => { if (edset.fmtSave) await formatCode(true); run(); };
// Alt+arrows drive the Time Machine only while it is open; otherwise they keep their editor meaning
const tmKey = (k: Parameters<typeof tmStep>[0]) => () => { if (!state.tm.on) return CodeMirror.Pass; tmStep(k); };
createEditor($('#editor'), initial, {
  ...ideKeys,
  'Ctrl-Enter': run, 'Cmd-Enter': run, 'Ctrl-S': () => { saveRun(); }, 'Cmd-S': () => { saveRun(); },
  'F9': () => toggleLogpoint(cm.getCursor().line + 1),
  'Shift-F9': () => togglePin(),
  'Alt-Right': tmKey('into'), 'Alt-Left': tmKey('back'),
  'Alt-Down': tmKey('over'), 'Alt-Up': tmKey('out'), 'Alt-J': () => tmJump(),
});
initIde();
setInlineHover(showLineValues);

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
  setCodeLang(ex.lang ?? 'js', true);
  cm.setValue(ex.code[getLang()]);
  run();
  (e.target as HTMLSelectElement).value = '';
};
const modeBtns = document.querySelectorAll<HTMLButtonElement>('.seg button[data-mode]');
const paintMode = () => modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
modeBtns.forEach(b => b.onclick = () => {
  state.mode = b.dataset.mode as Mode; store.set('mode', state.mode); paintMode();
  toast(t(state.mode === 'auto' ? 'modeAutoToast' : state.mode === 'save' ? 'modeSaveToast' : 'modeManualToast'));
});
paintMode();
/* ---------- JavaScript / TypeScript ---------- */
const langBtns = document.querySelectorAll<HTMLButtonElement>('#codeLang button');
function setCodeLang(l: 'js' | 'ts', quiet = false) {
  state.codeLang = l; store.set('codeLang', l);
  langBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
  cm.setOption('mode', l === 'ts' ? 'text/typescript' : 'javascript');
  if (!quiet) { toast(t(l === 'ts' ? 'tsOn' : 'jsOn')); run(); }
}
langBtns.forEach(b => b.onclick = () => setCodeLang(b.dataset.lang as 'js' | 'ts'));
setCodeLang(state.codeLang, true);
const logAll = $<HTMLInputElement>('#logall');
logAll.checked = state.logAll;
logAll.onchange = () => { state.logAll = logAll.checked; store.set('logall', state.logAll); run(); };
$('#run').onclick = run;
/* ---------- themes ---------- */
const skinSel = $<HTMLSelectElement>('#skin');
function applySkin(v: string) {
  if (v) document.documentElement.dataset.skin = v; else delete document.documentElement.dataset.skin;
  store.set('skin', v);
  if (state.run) renderAll();
}
skinSel.value = store.get<string>('skin', '');
applySkin(skinSel.value);
skinSel.onchange = () => applySkin(skinSel.value);
$<HTMLSelectElement>('#lang').onchange = e => {
  setLang((e.target as HTMLSelectElement).value as Lang); store.set('lang', getLang());
  applyI18n(); renderAll();
};
$('#share').onclick = () => {
  const url = location.origin + location.pathname + '#' + encodeShare({ code: cm.getValue(), logpoints: [...state.logpoints], lang: state.codeLang });
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
