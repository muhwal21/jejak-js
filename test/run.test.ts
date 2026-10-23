import { describe, it, expect } from 'vitest';
import { runCode, valsOf, logsOf } from './harness';
import { computeCoverage } from '../src/core/coverage';

describe('runtime', () => {
  it('shows live comment values and $ expressions', async () => {
    const r = await runCode(`const a = [1, 2, 3].map(x => x * 2) //?\na.length\nconst o = { n: 'Awal' } //? $.n`);
    expect(valsOf(r)).toEqual(['[ 2, 4, 6 ]', '3', "'Awal'"]);
  });

  it('captures console output with the right line', async () => {
    const r = await runCode(`const x = 5\n\nconsole.log('x is', x)`);
    expect(logsOf(r)).toEqual(['x is 5']);
    expect(r.logs[0].line).toBe(3);
  });

  it('follows event loop order', async () => {
    const r = await runCode(`setTimeout(() => console.log('t'), 0)\nPromise.resolve().then(() => console.log('p'))\nconsole.log('s')`);
    expect(logsOf(r)).toEqual(['s', 'p', 't']);
  });

  it('serializes Map, Set, Date, classes and cycles', async () => {
    const r = await runCode(`class P { constructor() { this.self = this } }\nnew Map([['a', 1]]) //?\nnew Set([1]) //?\nnew P() //?\nnew Date(0) //?`);
    expect(valsOf(r)).toEqual(["Map(1) { 'a' => 1 }", 'Set(1) { 1 }', 'P { self: [Circular] }', '1970-01-01T00:00:00.000Z']);
  });

  it('measures time without tracker overhead', async () => {
    const r = await runCode(`const s = [1,2,3].map(x => x).length /*?.*/`);
    expect(r.vals[0].ms).toBeTypeOf('number');
    expect(r.vals[0].ms!).toBeLessThan(50);
  });

  it('locates errors by line and column and keeps the call path', async () => {
    const r = await runCode(`function inner(o) {\n  return o.deep.value\n}\nfunction outer() {\n  return inner({})\n}\nouter()`);
    expect(r.errors).toHaveLength(1);
    const e = r.errors[0];
    expect(e.name).toBe('TypeError');
    expect(e.line).toBe(2);
    expect(e.col).toBeGreaterThan(8);
    expect(e.path).toEqual(expect.arrayContaining([5, 7]));
  });

  it('keeps the shadow call stack right across await', async () => {
    const r = await runCode(`function g() {\n  return 1\n}\nasync function f() {\n  await null\n  return g()\n}\nawait f()`);
    const inG = r.steps.find(s => s.line === 2)!;
    expect(inG.stack.map(f => r.meta!.cov[f.fid].name)).toEqual(['f', 'g']);
    expect(inG.stack[0].async).toBe(true);
    const afterAwait = r.steps.find(s => s.line === 6)!;
    expect(afterAwait.stack).toHaveLength(1);
  });

  it('stops infinite loops', async () => {
    const r = await runCode(`let i = 0\nwhile (true) { i++ }`, {}, { limit: 5000 });
    expect(r.errors[0].name).toBe('RangeError');
  });

  it('records Time Machine steps with variables', async () => {
    const r = await runCode(`let a = 1\na = a + 1\nconst b = a * 10`);
    const last = r.steps[r.steps.length - 1];
    expect(last.end).toBe(true);
    expect(last.vars.a.p).toBe('2');
    expect(last.vars.b.p).toBe('20');
  });

  it('evaluates a selected expression on demand (peek)', async () => {
    const src = `const xs = [1, 2, 3]\nconst total = xs.reduce((s, x) => s + x, 0) * 2`;
    const s = src.indexOf('xs.reduce'); const e = src.indexOf(' * 2');
    const r = await runCode(src, { peek: { s, e } });
    expect(r.vals.find(v => v.kind === 'peek')!.v.p).toBe('6');
  });

  it('computes line coverage', async () => {
    const src = `function f(x) {\n  if (x) {\n    return 1\n  }\n  return 2\n}\nf(true)\nconst t = true ? 'a' : 'b'`;
    const r = await runCode(src);
    const c = computeCoverage(r.meta!.cov, r.hits);
    expect(c.stat[3]).toBe('ok');
    expect(c.stat[5]).toBe('none');
    expect(c.stat[8]).toBe('part');
    expect(c.uncovered.length).toBeGreaterThan(0);
  });
});

describe('time machine steps', () => {
  it('records one step for a one-line `if (x) return`', async () => {
    const r = await runCode(`function f(n) {\n  if (n <= 1) return 1\n  return 2\n}\nf(1)`);
    expect(r.steps.filter(s => s.line === 2)).toHaveLength(1);
  });
});
