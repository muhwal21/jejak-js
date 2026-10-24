import { state } from '../state';
import { t } from '../i18n';
import { previewOf } from '../core/session';
import { $, cssVar, toast } from './dom';
import { cm } from './editor';

let renderAll: () => void = () => {};
export function initTimeMachine(render: () => void) {
  renderAll = render;
  $('#tmToggle').onclick = () => (state.tm.on ? tmOff() : tmOn(0));
  $('#tmFirst').onclick = () => tmStep('first');
  $('#tmLast').onclick = () => tmStep('last');
  $('#tmBack').onclick = () => tmStep('back');
  $('#tmInto').onclick = () => tmStep('into');
  $('#tmOver').onclick = () => tmStep('over');
  $('#tmOut').onclick = () => tmStep('out');
  $('#tmJump').onclick = () => tmJump();
  $('#tmPlay').onclick = () => togglePlay();
  $<HTMLSelectElement>('#tmSpeed').onchange = () => { if (state.tm.playing) { stop(); togglePlay(); } };
  initTimeline();
}

const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';

export function tmOn(i = 0) {
  const r = state.run;
  if (!r || !r.steps.length) { toast(t('noSteps')); return; }
  state.tm.on = true;
  state.tm.i = Math.max(0, Math.min(i, r.steps.length - 1));
  $('#tm').classList.remove('off');
  $('#tmToggle').textContent = t('tmClose');
  document.querySelector('.edwrap')!.classList.add('tm-on');
  requestAnimationFrame(() => { sizeCanvas(); renderAll(); });
}
export function tmOff() {
  state.tm.on = false; stop();
  $('#tm').classList.add('off');
  $('#tmToggle').textContent = t('tmStart');
  document.querySelector('.edwrap')!.classList.remove('tm-on');
  renderAll();
}
export function tmStep(kind: 'into' | 'back' | 'over' | 'out' | 'first' | 'last') {
  const r = state.run; if (!r || !r.steps.length) return;
  if (!state.tm.on) { tmOn(0); return; }
  const S = r.steps, i = state.tm.i, d = S[i].stack.length;
  let j = i;
  if (kind === 'into') j = Math.min(i + 1, S.length - 1);
  else if (kind === 'back') j = Math.max(i - 1, 0);
  else if (kind === 'over') { j = i + 1; while (j < S.length && S[j].stack.length > d) j++; }
  else if (kind === 'out') { j = i + 1; while (j < S.length && S[j].stack.length >= d) j++; }
  else if (kind === 'first') j = 0;
  else j = S.length - 1;
  state.tm.i = Math.min(j, S.length - 1);
  renderAll();
}
export function tmJump() {
  const r = state.run; if (!r || !r.steps.length) return;
  const line = cm.getCursor().line + 1;
  const S = r.steps;
  let j = S.findIndex((s, k) => k > state.tm.i && s.line === line);
  if (j < 0) j = S.findIndex(s => s.line === line);
  if (j < 0) { toast(t('neverRan', { line })); return; }
  tmOn(j);
}
function stop() { clearInterval(state.tm.playing); state.tm.playing = 0; $('#tmPlay').innerHTML = PLAY; }
function togglePlay() {
  if (state.tm.playing) { stop(); return; }
  const r = state.run; if (!r) return;
  if (!state.tm.on) tmOn(0);
  if (state.tm.i >= r.steps.length - 1) state.tm.i = 0;
  $('#tmPlay').innerHTML = PAUSE;
  state.tm.playing = window.setInterval(() => {
    const rr = state.run;
    if (!rr || state.tm.i >= rr.steps.length - 1) { stop(); return; }
    state.tm.i++; renderAll();
  }, +$<HTMLSelectElement>('#tmSpeed').value);
}

/* ---------- info line + buttons ---------- */
export function renderTmBar() {
  const r = state.run; const info = $('#tmInfo');
  if (!state.tm.on || !r || !r.steps.length) {
    info.innerHTML = r && r.steps.length ? t('tmRecorded', { n: r.steps.length }) : t('tmNone');
    return;
  }
  if (state.tm.i >= r.steps.length) state.tm.i = r.steps.length - 1;
  const s = r.steps[state.tm.i];
  const top = s.stack[s.stack.length - 1];
  const fn = top ? esc(r.meta!.cov[top.fid].name ?? '?') + '()' : t('mainProgram');
  info.innerHTML = t('tmInfo', { i: state.tm.i + 1, n: r.steps.length, line: s.line, fn }) + (s.stack.length ? ' · ' + t('depth', { d: s.stack.length }) : '');
  const atStart = state.tm.i <= 0, atEnd = state.tm.i >= r.steps.length - 1;
  for (const id of ['#tmBack', '#tmFirst']) $<HTMLButtonElement>(id).disabled = atStart;
  for (const id of ['#tmInto', '#tmOver', '#tmOut', '#tmLast']) $<HTMLButtonElement>(id).disabled = atEnd;
  drawTimeline();
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/* ---------- interactive timeline ---------- */
let tl: HTMLCanvasElement;
function sizeCanvas() { const dpr = devicePixelRatio || 1; tl.width = (tl.clientWidth || 600) * dpr; tl.height = 34 * dpr; }
const DARK_SKINS = new Set(['dark', 'ocean', 'contrast']);
function isDark() {
  const sk = document.documentElement.dataset.skin;
  if (sk) return DARK_SKINS.has(sk);
  const th = document.documentElement.dataset.theme;
  return th === 'dark' || (th !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
}
export function drawTimeline() {
  const r = state.run; if (!state.tm.on || !r || !r.steps.length) return;
  const dpr = devicePixelRatio || 1;
  if (tl.width !== Math.round((tl.clientWidth || 600) * dpr)) sizeCanvas();
  const ctx = tl.getContext('2d')!; const W = tl.width / dpr, H = 34;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const S = r.steps, n = S.length, bw = W / n, dark = isDark();
  for (let i = 0; i < n; i++) {
    const s = S[i]; const top = s.stack[s.stack.length - 1];
    ctx.fillStyle = top ? `hsl(${(top.fid * 67 + 200) % 360}, ${dark ? '55%' : '60%'}, ${dark ? '45%' : '62%'})` : cssVar('--cov-none');
    const hgt = 8 + Math.min(s.stack.length, 5) * 2.4;
    ctx.fillRect(i * bw, (H - hgt) / 2 + 4, Math.max(bw - (bw > 3 ? 1 : 0), 0.6), hgt - 4);
  }
  const curLine = S[state.tm.i].line; ctx.fillStyle = cssVar('--accent');
  for (let i = 0; i < n; i++) if (S[i].line === curLine && i !== state.tm.i) ctx.fillRect(i * bw + bw / 2 - 1, H - 4, 2, 4);
  for (let i = 0; i < n; i++) for (const o of S[i].logs) {
    const x = i * bw + bw / 2;
    if (o.type === 'log') { ctx.fillStyle = cssVar('--fg'); ctx.beginPath(); ctx.arc(x, 4, 2, 0, 7); ctx.fill(); }
    else if (o.type === 'err') { ctx.fillStyle = cssVar('--cov-err'); ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 7); ctx.fill(); }
  }
  ctx.fillStyle = cssVar('--accent');
  const x = state.tm.i * bw + bw / 2;
  ctx.fillRect(x - 1, 0, 2, H); ctx.beginPath(); ctx.arc(x, H / 2 + 2, 4, 0, 7); ctx.fill();
}
function initTimeline() {
  tl = $<HTMLCanvasElement>('#tl');
  let dragging = false;
  const idxAt = (e: PointerEvent) => {
    const r = state.run!; const b = tl.getBoundingClientRect();
    return Math.max(0, Math.min(r.steps.length - 1, Math.floor((e.clientX - b.left) / b.width * r.steps.length)));
  };
  const seek = (e: PointerEvent) => { if (!state.run?.steps.length) return; state.tm.i = idxAt(e); renderAll(); };
  tl.addEventListener('pointerdown', e => { dragging = true; tl.setPointerCapture(e.pointerId); seek(e); });
  tl.addEventListener('pointermove', e => {
    const r = state.run;
    if (dragging) seek(e);
    else if (r && r.steps.length) {
      const i = idxAt(e); const s = r.steps[i]; const top = s.stack[s.stack.length - 1];
      tl.title = `#${i + 1} · L${s.line} · ${top ? r.meta!.cov[top.fid].name + '()' : t('mainProgram')}${s.logs.length ? ' · ' + s.logs.map(previewOf).join(' | ').slice(0, 80) : ''}`;
    }
  });
  tl.addEventListener('pointerup', () => { dragging = false; });
  addEventListener('resize', () => { if (state.tm.on) { sizeCanvas(); drawTimeline(); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => drawTimeline());
}
