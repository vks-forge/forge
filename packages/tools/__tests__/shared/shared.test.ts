/**
 * Pins the small shared helpers: canonical JSON, pattern matching, hashes.
 *
 * Why: signatures and rule matches are only as trustworthy as these primitives. Key
 * order must never change a signed value, a shell pattern must respect word boundaries
 * and cross `/`, and MAC comparison must reject differing lengths.
 *
 * Pins: canonicalJson(), commandMatch(), literalPrefixLength(), toolMatch(), hmacHex(), safeEqualHex().
 * Depends on: shared/*, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { canonicalJson } from '#/shared/canonical-json.js';
import { hmacHex, safeEqualHex, sha256Hex } from '#/shared/hmac.js';
import { commandMatch, literalPrefixLength, toolMatch } from '#/shared/pattern.js';

describe('canonicalJson', () => {
  it('sorts keys recursively and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[2,{"y":2,"z":1}]},"b":1}',
    );
  });

  it('refuses non-finite numbers', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError);
  });
});

describe('commandMatch', () => {
  it.each([
    ['pnpm test*', 'pnpm test', true],
    ['pnpm test*', 'pnpm test --run src/a/b.ts', true],
    ['pnpm test*', 'pnpm testbackdoor', false],
    ['pnpm add *', 'pnpm add', false],
    ['pnpm add *', 'pnpm add zod', true],
    ['git push*', 'git push origin main', true],
    ['git * push*', 'git -C x push', true],
    ['ls', 'ls', true],
    ['ls', 'ls -la', false],
    ['*', 'anything / at all', true],
    ['a.b', 'axb', false],
  ])('%j vs %j is %s', (pattern, text, expected) => {
    expect(commandMatch(pattern, text)).toBe(expected);
  });

  it('can ignore case', () => {
    expect(commandMatch('Get-ChildItem*', 'get-childitem -Force', true)).toBe(true);
    expect(commandMatch('Get-ChildItem*', 'get-childitem', false)).toBe(false);
  });
});

describe('literalPrefixLength and toolMatch', () => {
  it('measures text before the first star', () => {
    expect(literalPrefixLength('git push*')).toBe(8);
    expect(literalPrefixLength('exact')).toBe(5);
    expect(literalPrefixLength('*')).toBe(0);
  });

  it('matches tool ids with a plain star', () => {
    expect(toolMatch('mcp__forge__*', 'mcp__forge__web_search')).toBe(true);
    expect(toolMatch('mcp__forge__*', 'mcp__github__x')).toBe(false);
    expect(toolMatch('read', 'readx')).toBe(false);
  });
});

describe('hmac helpers', () => {
  it('is deterministic and key dependent', () => {
    expect(hmacHex('k', 'm')).toBe(hmacHex('k', 'm'));
    expect(hmacHex('k', 'm')).not.toBe(hmacHex('k2', 'm'));
    expect(sha256Hex('x')).toHaveLength(64);
  });

  it('compares in constant time and rejects length mismatch', () => {
    const h = hmacHex('k', 'm');
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, h.slice(1))).toBe(false);
    expect(safeEqualHex(h, `${h.slice(0, -1)}${h.endsWith('0') ? '1' : '0'}`)).toBe(
      false,
    );
  });
});
