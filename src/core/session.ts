/** Run state + ingestion of worker batches. Pure (no DOM), so it is unit-testable. */
import { mapStack } from './build';
import type { Instrumented } from './instrument';

export interface SerChild { k: string; v: Ser; mk?: 1; sk?: 1 }
export interface Ser { t: string; p: string; r?: string; c?: SerChild[]; n?: number; trunc?: boolean }

export interface Frame { fid: number; callLine: number; async: boolean }
interface BaseEntry { line: number; step: number; order: number }
export interface ValEntry extends BaseEntry { type: 'val'; vid: number; src: string; v: Ser; ms?: number; kind: string }
export interface LogEntry extends BaseEntry { type: 'log'; m: string; a: Ser[] }
export interface ErrEntry extends BaseEntry { type: 'err'; name: string; msg: string; col: number | null; path: number[]; v?: Ser }
export type Entry = ValEntry | LogEntry | ErrEntry;

export interface Step { id: number; line: number; end: boolean; vars: Record<string, Ser>; stack: Frame[]; logs: Entry[] }

export type RunStatus = 'run' | 'ok' | 'error' | 'syntax';
export interface RunState {
  seq: number;
  src: string;
  t0: number;
  status: RunStatus;
  hits: number[];
  steps: Step[];
  vals: ValEntry[];
  logs: LogEntry[];
  errors: ErrEntry[];
  chron: Entry[];
  syntax: { line: number; col: number; msg: string } | null;
  meta: Instrumented | null;
  source: string; userStart: number; userEnd: number;
  curLine: number;
  total: number;
  /** language of the editor text; for 'ts' the instrumented offsets refer to the stripped JS */
  lang: 'js' | 'ts';
  doneAt: number | null;
}

export function createRun(seq: number, src: string, t0 = 0): RunState {
  return {
    seq, src, t0, status: 'run', hits: [], steps: [], vals: [], logs: [], errors: [], chron: [],
    syntax: null, meta: null, source: '', userStart: 0, userEnd: 0, curLine: 1, total: 0, doneAt: null, lang: 'js',
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ingest(r: RunState, d: { ev: any[]; hits: number[]; line: number; total: number }) {
  r.hits = d.hits; r.curLine = d.line; r.total = d.total;
  const M = r.meta!;
  const add = (o: Entry) => {
    r.chron.push(o);
    const s = r.steps[o.step];
    if (s) s.logs.push(o);
  };
  for (const ev of d.ev) {
    if (ev.k === 's') {
      const c = M.cov[ev.id];
      r.steps.push({
        id: ev.id, line: c.sl, end: c.kind === 'end', vars: ev.v,
        stack: (ev.st || []).map((f: any) => ({ fid: f.f, callLine: f.cl, async: !!f.a })),
        logs: [],
      });
    } else if (ev.k === 'v') {
      const v = M.vals[ev.id];
      const o: ValEntry = { type: 'val', vid: ev.id, line: v.line, src: v.src, v: ev.v, ms: ev.ms, step: r.steps.length - 1, kind: v.kind, order: r.chron.length };
      r.vals.push(o); add(o);
    } else if (ev.k === 'l') {
      const line = ev.id >= 0 ? M.logs[ev.id].line : ev.line;
      const o: LogEntry = { type: 'log', m: ev.m, line, a: ev.a, step: r.steps.length - 1, order: r.chron.length };
      r.logs.push(o); add(o);
    } else if (ev.k === 'err') {
      let line: number = ev.line, col: number | null = null, path: number[] = ev.path || [];
      const mapped = r.source ? mapStack(ev.stack, r.source, r.userStart, r.userEnd, M) : [];
      if (mapped.length) {
        line = mapped[0].line; col = mapped[0].col;
        path = mapped.slice(1).map(p => p.line).filter(l => l !== line);
      }
      const o: ErrEntry = { type: 'err', name: ev.name, msg: ev.msg, line, col, path, v: ev.v, step: r.steps.length - 1, order: r.chron.length };
      r.errors.push(o); add(o);
      r.status = 'error';
    }
  }
}

/** Text preview of an entry for inline display. */
export function fmtArgs(a: Ser[]) { return a.map(x => (x.t === 'str' ? x.r ?? x.p : x.p)).join(' '); }
export function previewOf(o: Entry) {
  if (o.type === 'log') return fmtArgs(o.a);
  if (o.type === 'err') return o.name + ': ' + o.msg;
  return o.v.p;
}
export function fmtMs(ms: number) { return ms < 1 ? ms.toFixed(3) + 'ms' : ms < 100 ? ms.toFixed(2) + 'ms' : Math.round(ms) + 'ms'; }

/** Resolve `a.b[0].c` against a step's recorded variables. */
export function resolvePath(vars: Record<string, Ser>, expr: string): Ser | null {
  const parts = expr.trim().replace(/\[(\d+)\]/g, '.$1').replace(/\[['"]([^'"]+)['"]\]/g, '.$1').split('.').filter(Boolean);
  if (!parts.length || !(parts[0] in vars)) return null;
  let n = vars[parts[0]];
  for (const k of parts.slice(1)) {
    if (k === 'length' && n.n != null) return { t: 'num', p: String(n.n) };
    if (!n.c) return n.trunc ? { t: 'tdz', p: '(not recorded that deep)' } : null;
    const c = n.c.find(c => c.k === k || c.k === `'${k}' =>`);
    if (!c) return { t: 'undef', p: 'undefined' };
    n = c.v;
  }
  return n;
}

/** Convert a serialized value back into plain JSON-able data (for "copy"). */
export function toPlain(n: Ser | undefined): unknown {
  if (!n) return undefined;
  switch (n.t) {
    case 'str': return n.r;
    case 'num': return Number(n.p);
    case 'bool': return n.p === 'true';
    case 'null': return null;
    case 'undef': return undefined;
  }
  if (n.c) {
    if (n.t === 'arr') return n.c.map(c => toPlain(c.v));
    const o: Record<string, unknown> = {};
    for (const c of n.c) o[c.k] = toPlain(c.v);
    return o;
  }
  return n.p;
}
