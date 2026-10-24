/**
 * TypeScript support: strip types with Sucrase (no type checking, like Quokka's
 * transpile-only mode). Sucrase keeps every line on the same line number, so
 * coverage, inline values and the Time Machine line up with the TypeScript source.
 */
import { transform } from 'sucrase';
import { JejakSyntaxError } from './instrument';

export function stripTypes(src: string): string {
  try {
    return transform(src, {
      transforms: ['typescript'],
      disableESTransforms: true,
      keepUnusedImports: true,
    }).code;
  } catch (e) {
    const msg = String((e as Error).message || e);
    const m = /\((\d+):(\d+)\)/.exec(msg);
    throw new JejakSyntaxError(msg.replace(/\s*\(\d+:\d+\)\s*$/, ''), m ? +m[1] : 1, m ? +m[2] - 1 : 0);
  }
}
