import LZString from 'lz-string';

/** Encode code (+ optional settings) into a URL hash: #c=<compressed> */
export interface Shared { code: string; logpoints?: number[] }

export function encodeShare(s: Shared): string {
  const payload = JSON.stringify({ c: s.code, l: s.logpoints?.length ? s.logpoints : undefined });
  return 'c=' + LZString.compressToEncodedURIComponent(payload);
}

export function decodeShare(hash: string): Shared | null {
  const m = /(?:^#?|&)c=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(m[1]);
    if (!json) return null;
    const o = JSON.parse(json);
    if (typeof o.c !== 'string') return null;
    return { code: o.c, logpoints: Array.isArray(o.l) ? o.l.filter((x: unknown) => typeof x === 'number') : [] };
  } catch {
    return null;
  }
}
