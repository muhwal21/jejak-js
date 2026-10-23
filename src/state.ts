import type { InlineTarget } from './core/instrument';
import type { RunState } from './core/session';

export type Mode = 'auto' | 'save' | 'manual';
export type Tab = 'explorer' | 'console' | 'story' | 'debug' | 'guide';

/** Small wrapper around localStorage that never throws. */
export const store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem('jejak:' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem('jejak:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ }
  },
};

export const state = {
  run: null as RunState | null,
  mode: store.get<Mode>('mode', 'auto'),
  logpoints: new Set<number>(store.get<number[]>('lp', [])),
  pins: store.get<InlineTarget[]>('pins', []),
  logAll: store.get<boolean>('logall', false),
  tm: { on: false, i: 0, playing: 0 as number | 0 },
  expanded: new Set<string>(),
  watches: store.get<string[]>('watch', []),
  tab: 'explorer' as Tab,
  /** pending "evaluate this selection" request */
  peek: null as null | { s: number; e: number; text: string; x: number; y: number },
};

export function saveLogpoints() { store.set('lp', [...state.logpoints]); }
export function savePins() { store.set('pins', state.pins); }
