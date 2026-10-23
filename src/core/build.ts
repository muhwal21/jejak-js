import { genToOrig, lineAt, type Instrumented } from './instrument';

export interface BuildOptions { cap?: number; limit?: number }

/** Assemble the full worker script: META + runtime + instrumented user code. */
export function buildWorkerSource(ins: Instrumented, runtimeSrc: string, opts: BuildOptions = {}) {
  const META = {
    n: ins.cov.length,
    lines: ins.cov.map(c => c.sl),
    vars: ins.cov.map(c => c.vars || []),
    deep: ins.vals.map(v => v.deep),
    cap: opts.cap ?? 5000,
    limit: opts.limit ?? 3e6,
  };
  const head = `const __META=${JSON.stringify(META)};\n${runtimeSrc}\n(async function(){\n`;
  const source = head + ins.code + `\n})().then(()=>__done(),e=>{__report(e);__done()});`;
  return { source, userStart: head.length, userEnd: head.length + ins.code.length };
}

export interface SourcePos { line: number; col: number; offset: number }

/**
 * Translate a V8/SpiderMonkey/JSC stack string from the worker into positions in
 * the user's original code. Frames outside the user code (runtime) are dropped.
 */
export function mapStack(stack: string, source: string, userStart: number, userEnd: number, ins: Instrumented): SourcePos[] {
  if (!stack) return [];
  const genLines = lineStartsCached(source);
  const out: SourcePos[] = [];
  for (const raw of stack.split('\n')) {
    const m = /:(\d+):(\d+)\)?\s*$/.exec(raw);
    if (!m) continue;
    const gl = +m[1], gc = +m[2];
    if (gl < 1 || gl > genLines.length) continue;
    const gOff = genLines[gl - 1] + gc - 1;
    if (gOff < userStart || gOff > userEnd) continue;
    const o = genToOrig(ins.segments, gOff - userStart);
    const line = lineAt(ins.lineStarts, o);
    out.push({ line, col: o - ins.lineStarts[line - 1], offset: o });
  }
  return out;
}

let lsCacheSrc = '', lsCache: number[] = [];
function lineStartsCached(src: string) {
  if (src === lsCacheSrc) return lsCache;
  const a = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) a.push(i + 1);
  lsCacheSrc = src; lsCache = a;
  return a;
}
