/**
 * Pins the plain-TypeScript SHA-256 against Node's own implementation.
 *
 * Why: an agent's hash names the exact definition a run used, and the server and engine store
 *   it as sha256 hex. If core's own digest disagreed with the standard one for any input
 *   (multi-byte text, a block boundary, an empty string) hashes computed in core could never
 *   be matched against hashes computed anywhere else.
 *
 * Pins: known vectors, block-boundary lengths, non-ASCII text, random strings.
 * Depends on: src/shared/sha256, node:crypto, fast-check, vitest.
 */

import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '#/shared/sha256.js';

const reference = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex');

describe('sha256Hex', () => {
  it('matches the standard vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );

    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches Node at every length around the block boundaries', () => {
    for (let n = 0; n <= 200; n++) {
      const text = 'a'.repeat(n);

      expect(sha256Hex(text), `length ${n}`).toBe(reference(text));
    }
  });

  it('matches Node for multi-byte text', () => {
    for (const text of ['héllo', '日本語のテキスト', 'emoji 🙂 mix', 'a\u0000b']) {
      expect(sha256Hex(text)).toBe(reference(text));
    }
  });

  it('matches Node for random strings', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (s) => {
        expect(sha256Hex(s)).toBe(reference(s));
      }),
      { numRuns: 200 },
    );
  });
});
