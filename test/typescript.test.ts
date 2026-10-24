import { describe, it, expect } from 'vitest';
import { stripTypes } from '../src/core/typescript';
import { JejakSyntaxError } from '../src/core/instrument';
import { runCode, valsOf } from './harness';

const TS = `interface User {
  name: string
  age?: number
}
type ID = string | number
enum Color { Red, Green = 'g' }
const u: User = { name: 'Awal' }
function greet<T extends User>(user: T, id: ID): string {
  return user.name!.toUpperCase() + id
}
class Box<T> {
  private value: T
  constructor(public readonly label: string, v: T) { this.value = v }
  get(): T { return this.value }
}
const b = new Box<number>('n', 3)
b.get() //?
greet(u, 1) //?
Color.Green //?
const n = (5 as number) satisfies number //?`;

describe('typescript', () => {
  it('keeps every line on the same line number', () => {
    expect(stripTypes(TS).split('\n').length).toBe(TS.split('\n').length);
  });

  it('runs TypeScript with values on the right lines', async () => {
    const r = await runCode(stripTypes(TS));
    expect(valsOf(r)).toEqual(['3', "'AWAL1'", "'g'", '5']);
    expect(r.vals.map(v => v.line)).toEqual([17, 18, 19, 20]);
    expect(r.errors).toHaveLength(0);
  });

  it('reports TypeScript syntax errors with a line', () => {
    try { stripTypes('const a: = 1'); expect.fail(); }
    catch (e) { expect(e).toBeInstanceOf(JejakSyntaxError); expect((e as JejakSyntaxError).line).toBe(1); }
  });
});
