import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { instrument, type InstrumentOptions } from '../src/core/instrument';
import { buildWorkerSource, type BuildOptions } from '../src/core/build';
import { createRun, ingest, type RunState } from '../src/core/session';

const runtimeSrc = fs.readFileSync(path.resolve(__dirname, '../src/core/runtime.js'), 'utf8');

/** Run code exactly like the browser worker does, but inside a Node vm context. */
export function runCode(src: string, opts: InstrumentOptions = {}, build: BuildOptions = {}, waitMs = 60): Promise<RunState> {
  const ins = instrument(src, opts);
  const { source, userStart, userEnd } = buildWorkerSource(ins, runtimeSrc, build);
  const r = createRun(1, src);
  Object.assign(r, { meta: ins, source, userStart, userEnd });
  return new Promise(resolve => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: any = { performance, setTimeout, clearTimeout, queueMicrotask, console: {} };
    ctx.self = ctx;
    ctx.postMessage = (d: { t: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (d.t === 'b') ingest(r, d as any);
      else if (d.t === 'done') {
        r.doneAt = 1;
        if (r.status === 'run') r.status = r.errors.length ? 'error' : 'ok';
        setTimeout(() => resolve(r), waitMs);
      }
    };
    vm.createContext(ctx);
    new vm.Script(source, { filename: 'blob:jejak-test' }).runInContext(ctx);
  });
}

export const valsOf = (r: RunState) => r.vals.map(v => v.v.p);
export const logsOf = (r: RunState) => r.logs.map(l => l.a.map(a => (a.t === 'str' ? a.r : a.p)).join(' '));
