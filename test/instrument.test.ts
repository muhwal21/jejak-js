import { describe, it, expect } from 'vitest';
import * as acorn from 'acorn';
import { instrument, genToOrig, JejakSyntaxError } from '../src/core/instrument';

const parses = (code: string) => acorn.parse(code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });

const SAMPLES: Record<string, string> = {
  classes: `class A { #p = 1; static s = 2; static { this.t = 3 } get p() { return this.#p } constructor(x = 1) { this.x = x } }
class B extends A { constructor() { super(5); } m() { return super.p } }
new B().m()`,
  destructuring: `const { a, b: [c, ...d] = [], ...rest } = { a: 1, b: [2, 3, 4], e: 5 }; let [x = 1, , y] = [undefined, 0, 2]`,
  optionalChain: `const o = { a: { b: () => 1 } }; o?.a?.b?.(); o.x?.y.z; o?.["a"]`,
  labels: `outer: for (let i = 0; i < 3; i++) { for (const j of [1, 2]) { if (j === 2) continue outer; if (i === 2) break outer } }`,
  switchCase: `switch (2) { case 1: let a = 1; break; case 2: { const b = 2 } default: void 0 }`,
  generators: `function* g() { const x = yield 1; yield* [x, 2] } const it = g(); it.next(); it.next(5)`,
  asyncThings: `const f = async (n) => { await null; for await (const v of [Promise.resolve(1)]) n += v; return n }; await f(1)`,
  arrowObject: `const mk = (a) => ({ a }); const id = x => x; mk(1)`,
  tagged: 'const tag = (s, ...v) => s.raw.join("|") + v; tag`a${1}b${2}`',
  noSemicolons: `let a = 1\nlet b = a\n;[a, b] = [b, a]\n(function(){})`,
  ifElseChain: `let r; const v = 3; if (v === 1) r = 'a'; else if (v === 2) r = 'b'; else r = 'c'`,
  loops: `let n = 0; while (n < 3) n++; do n--; while (n > 0); for (;;) break; for (const k in {a:1}) n += k.length`,
  newTarget: `function F() { return new.target === F } new F()`,
  sequenceAndComma: `let i = 0, j = (i++, i++, i); j`,
  getterSetter: `const o = { _v: 1, get v() { return this._v }, set v(x) { this._v = x } }; o.v = 3; o.v`,
};

describe('instrument', () => {
  for (const [name, code] of Object.entries(SAMPLES)) {
    it(`produces valid JavaScript: ${name}`, () => {
      const out = instrument(code, { logAll: true });
      expect(() => parses(out.code)).not.toThrow();
    });
  }

  it('finds live comment targets', () => {
    const out = instrument(`const a = [1, 2].map(x => x * 2) //?\nfoo(a /*?*/, 1)\nconst t = 1 + 2 /*?.*/\nconst o = {x: 1} //? $.x`);
    expect(out.vals.map(v => v.src)).toEqual(['[1, 2].map(x => x * 2)', 'a', '1 + 2', '{x: 1}']);
    expect(out.vals[2].timing).toBe(true);
    expect(out.vals[3].expr).toBe('$.x');
  });

  it('marks identifiers on their own line', () => {
    const out = instrument(`const a = 1\na\nobj.prop`);
    expect(out.vals.map(v => v.kind)).toEqual(['auto', 'auto']);
  });

  it('rewrites console calls with their line', () => {
    const out = instrument(`\n\nconsole.log(1)\nconsole.error(2)`);
    expect(out.logs).toEqual([{ line: 3, m: 'log' }, { line: 4, m: 'error' }]);
    expect(out.code).not.toMatch(/console\.log/);
  });

  it('does not wrap callees or assignment targets', () => {
    const out = instrument(`obj.method /*?*/ ()\nlet a; a /*?*/ = 1`);
    expect(out.vals.length).toBe(0);
  });

  it('pins inline expressions by line + text', () => {
    const out = instrument(`const r = [1,2,3].filter(n => n > 1).map(n => n * 2)`, { inline: [{ line: 1, text: '[1,2,3].filter(n => n > 1)' }] });
    expect(out.vals[0].kind).toBe('inline');
  });

  it('reports syntax errors with location', () => {
    try { instrument('const = 1'); expect.fail(); }
    catch (e) { expect(e).toBeInstanceOf(JejakSyntaxError); expect((e as JejakSyntaxError).line).toBe(1); }
  });

  it('maps generated offsets back to source offsets', () => {
    const src = 'let a = 1\na + 2';
    const out = instrument(src);
    const g = out.code.indexOf('a + 2');
    expect(genToOrig(out.segments, g)).toBe(src.indexOf('a + 2'));
  });
});
