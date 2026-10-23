import { it, expect } from 'vitest';
import { encodeShare, decodeShare } from '../src/core/share';

it('round-trips code through the URL hash', () => {
  const code = "const nama = 'Awal' // ✓ unicode\nnama";
  const h = encodeShare({ code, logpoints: [2] });
  expect(decodeShare('#' + h)).toEqual({ code, logpoints: [2] });
  expect(decodeShare('#nothing')).toBeNull();
});
