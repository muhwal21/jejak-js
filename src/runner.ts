/** Owns the Web Worker: instruments the code, runs it, streams results into state.run. */
import { instrument, JejakSyntaxError } from './core/instrument';
import { buildWorkerSource } from './core/build';
import { createRun, ingest } from './core/session';
import runtimeSrc from './core/runtime.js?raw';
import { state } from './state';
import { t } from './i18n';

let worker: Worker | null = null;
let seq = 0;
let killT = 0;

export interface RunHooks { render(): void; onDone(): void }
let hooks: RunHooks = { render() {}, onDone() {} };
export function setRunHooks(h: RunHooks) { hooks = h; }

let raf = 0;
const scheduleRender = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; hooks.render(); }); };

export function execute(src: string) {
  const my = ++seq;
  if (worker) { worker.terminate(); worker = null; }
  clearTimeout(killT);
  const r = createRun(my, src, performance.now());
  state.run = r;
  const peek = state.peek;
  let ins;
  try {
    ins = instrument(src, {
      logpoints: state.logpoints, logAll: state.logAll, inline: state.pins,
      peek: peek ? { s: peek.s, e: peek.e } : null,
    });
  } catch (e) {
    if (e instanceof JejakSyntaxError) {
      r.status = 'syntax';
      r.syntax = { line: e.line, col: e.col, msg: e.message };
      hooks.render(); hooks.onDone();
      return;
    }
    throw e;
  }
  r.meta = ins;
  const { source, userStart, userEnd } = buildWorkerSource(ins, runtimeSrc);
  Object.assign(r, { source, userStart, userEnd });
  let url = '';
  try {
    url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    worker = new Worker(url);
  } catch (e) {
    r.status = 'error';
    r.errors.push({ type: 'err', name: 'Error', msg: t('workerBlocked') + (e as Error).message, line: 1, col: null, path: [], step: -1, order: 0 });
    hooks.render(); return;
  }
  worker.onmessage = (m: MessageEvent) => {
    if (my !== seq) return;
    const d = m.data;
    if (d.t === 'b') { ingest(r, d); scheduleRender(); }
    else if (d.t === 'done') {
      r.doneAt = performance.now();
      if (r.status === 'run') r.status = r.errors.length ? 'error' : 'ok';
      scheduleRender(); hooks.onDone();
      clearTimeout(killT);
      // keep the worker alive a while for timers / async callbacks
      killT = window.setTimeout(() => { if (worker && my === seq) { worker.terminate(); worker = null; } }, 15000);
    }
  };
  worker.onerror = (e: ErrorEvent) => {
    e.preventDefault();
    if (my !== seq) return;
    r.errors.push({ type: 'err', name: 'SyntaxError', msg: e.message, line: 1, col: null, path: [], step: -1, order: r.chron.length });
    r.status = 'error'; scheduleRender();
  };
  killT = window.setTimeout(() => {
    if (my === seq && !r.doneAt && worker) {
      worker.terminate(); worker = null;
      r.errors.push({ type: 'err', name: 'Timeout', msg: t('timeout'), line: r.curLine, col: null, path: [], step: r.steps.length - 1, order: r.chron.length });
      r.status = 'error'; hooks.render(); hooks.onDone();
    }
  }, 4000);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
