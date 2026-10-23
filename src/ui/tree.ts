import type { Ser } from '../core/session';
import { state } from '../state';
import { el, cssVar } from './dom';

/** Expandable value tree. Expansion state survives re-runs (keyed by path). */
export function tree(node: Ser & { __mk?: boolean }, label: string | null, path: string, openDepth: number): HTMLElement {
  const wrap = el('div');
  const row = el('div', 'row');
  const has = !!(node.c && node.c.length);
  const ex = state.expanded;
  const isOpen = has && (ex.has(path) || (openDepth > 0 && !ex.has('!' + path)));
  const car = el('span', 'car', has ? (isOpen ? '▾' : '▸') : '');
  row.appendChild(car);
  if (label != null) row.appendChild(el('span', 'k', label + (node.__mk ? '' : ':')));
  const p = el('span', 'p t-' + node.t, node.p);
  p.title = node.p;
  row.appendChild(p);
  wrap.appendChild(row);
  if (has) {
    const kids = el('div', 'kids');
    kids.hidden = !isOpen;
    wrap.appendChild(kids);
    const fill = () => {
      if (kids.childElementCount) return;
      for (const c of node.c!) {
        const k: Ser & { __mk?: boolean } = { ...c.v };
        if (c.mk) k.__mk = true;
        kids.appendChild(tree(k, c.k, path + '/' + c.k, openDepth - 1));
      }
    };
    if (isOpen) fill();
    row.style.cursor = 'pointer';
    row.setAttribute('role', 'button');
    row.setAttribute('aria-expanded', String(isOpen));
    row.onclick = () => {
      const opening = kids.hidden;
      kids.hidden = !opening;
      car.textContent = opening ? '▾' : '▸';
      row.setAttribute('aria-expanded', String(opening));
      if (opening) { fill(); ex.add(path); ex.delete('!' + path); } else { ex.delete(path); ex.add('!' + path); }
    };
  }
  return wrap;
}

/** Simple left-to-right graph of an object (Interactive Value Graph). */
export function graph(root: Ser): HTMLElement {
  const NS = 'http://www.w3.org/2000/svg';
  interface GN { label: string; n: Ser; depth: number; kids: GN[]; y: number }
  const nodes: GN[] = [];
  let row = 0;
  const W = 150, H = 26, GX = 36, GY = 8;
  function lay(n: Ser, label: string, depth: number): GN {
    const me: GN = { label, n, depth, kids: [], y: 0 };
    nodes.push(me);
    if (n.c && n.c.length && depth < 4) {
      for (const c of n.c.slice(0, 30)) me.kids.push(lay(c.v, c.k, depth + 1));
      me.y = (me.kids[0].y + me.kids[me.kids.length - 1].y) / 2;
    } else me.y = row++ * (H + GY);
    return me;
  }
  lay(root, '', 0);
  const maxD = Math.max(...nodes.map(n => n.depth));
  const w = (maxD + 1) * (W + GX) + 10, h = row * (H + GY) + 10;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h)); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const mk = (tag: string, a: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const k in a) e.setAttribute(k, String(a[k]));
    svg.appendChild(e);
    return e;
  };
  const X = (n: GN) => 5 + n.depth * (W + GX), Y = (n: GN) => 5 + n.y;
  for (const n of nodes) for (const k of n.kids)
    mk('path', { d: `M${X(n) + W} ${Y(n) + H / 2} C${X(n) + W + GX / 2} ${Y(n) + H / 2}, ${X(k) - GX / 2} ${Y(k) + H / 2}, ${X(k)} ${Y(k) + H / 2}`, fill: 'none', stroke: cssVar('--line'), 'stroke-width': 1.5 });
  for (const n of nodes) {
    const isObj = !!(n.n.c && n.n.c.length);
    mk('rect', { x: X(n), y: Y(n), width: W, height: H, rx: 5, fill: isObj ? cssVar('--accent-soft') : cssVar('--surface'), stroke: isObj ? cssVar('--accent') : cssVar('--line') });
    const tx = mk('text', { x: X(n) + 7, y: Y(n) + H / 2 + 4, fill: cssVar('--fg') });
    const lab = n.label ? n.label + ': ' : '';
    const val = isObj ? (n.n.t === 'arr' ? `[${n.n.n}]` : `{${n.n.n}}`) + ' ' + (n.n.p.split(/[[{]/)[0] || '') : n.n.p;
    let s = lab + val; if (s.length > 20) s = s.slice(0, 19) + '…';
    tx.textContent = s;
    const ti = document.createElementNS(NS, 'title'); ti.textContent = lab + n.n.p; tx.appendChild(ti);
  }
  const g = el('div', 'graph'); g.appendChild(svg);
  return g;
}
