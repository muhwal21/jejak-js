import type { CovNode } from './instrument';

export type LineStat = 'ok' | 'part' | 'none' | 'err' | 'path';

export interface Coverage {
  stat: Record<number, LineStat>;
  counts: Record<number, number>;
  /** ranges (original offsets) of code that never ran on otherwise-covered lines */
  uncovered: { s: number; e: number }[];
  percent: number; hit: number; total: number;
}

/**
 * Line coverage from node hit counts.
 * - each line is owned by the innermost tracked node that spans it
 * - a line is "part" when it mixes executed and non-executed nodes
 */
export function computeCoverage(cov: CovNode[], hits: number[], errors: { line: number; path: number[] }[] = []): Coverage {
  const owner: Record<number, number> = {};
  const stat: Record<number, LineStat> = {};
  const nodes = cov.map((c, i) => ({ c, i }))
    .filter(x => x.c.kind !== 'end' && x.c.kind !== 'loop')
    .sort((a, b) => (b.c.e - b.c.s) - (a.c.e - a.c.s));
  for (const { c, i } of nodes) for (let l = c.sl; l <= c.el; l++) owner[l] = i;
  for (const l in owner) stat[+l] = hits[owner[l]] > 0 ? 'ok' : 'none';

  const uncovered: { s: number; e: number }[] = [];
  for (const { c, i } of nodes) {
    const l = c.sl;
    const hit = hits[i] > 0;
    if (!hit && stat[l] === 'ok') stat[l] = 'part';
    if (hit && stat[l] === 'none' && owner[l] !== i) stat[l] = 'part';
  }
  // precise ranges for partially covered lines (single-line nodes that never ran)
  for (const { c, i } of nodes) {
    if (!(hits[i] > 0) && c.sl === c.el && stat[c.sl] === 'part') uncovered.push({ s: c.s, e: c.e });
  }
  const counts: Record<number, number> = {};
  for (const { c, i } of nodes) counts[c.sl] = Math.max(counts[c.sl] || 0, hits[i] || 0);
  for (const e of errors) {
    for (const p of e.path || []) if (stat[p]) stat[p] = 'path';
    stat[e.line] = 'err';
  }
  const measured = cov.map((_c, i) => i).filter(i => cov[i].kind === 'st' || cov[i].kind === 'br');
  const hit = measured.filter(i => hits[i] > 0).length;
  return { stat, counts, uncovered, hit, total: measured.length, percent: measured.length ? Math.round(hit / measured.length * 100) : 100 };
}
