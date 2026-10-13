/**
 * Tests for the Claim and SecretName schemas.
 *
 * Why: claims are what G1 checks against receipts, so an invented kind or extra field must
 *   be rejected at the door rather than skipped by the matcher; secret names become file
 *   names, so a path-like name must never validate.
 *
 * Pins: the four claim kinds parse, unknown kinds / extra keys / NUL paths are rejected;
 *   SecretName accepts lowercase slugs and rejects separators, dots, uppercase and empties.
 * Depends on: src/schemas/claims, src/schemas/secret-name, vitest.
 */

import { describe, expect, it } from 'vitest';
import { Claim } from '#/schemas/claims.js';
import { SecretName } from '#/schemas/secret-name.js';

describe('Claim', () => {
  it('parses each kind', () => {
    for (const c of [
      { kind: 'ran_tests' },
      { kind: 'edited', path: 'src/a.ts' },
      { kind: 'added_test', name: 'adds' },
      { kind: 'read', path: 'README.md' },
    ]) {
      expect(Claim.parse(c)).toEqual(c);
    }
  });

  it('rejects unknown kinds, extra keys and NUL paths', () => {
    expect(Claim.safeParse({ kind: 'deployed' }).success).toBe(false);
    expect(Claim.safeParse({ kind: 'ran_tests', passed: true }).success).toBe(false);
    expect(Claim.safeParse({ kind: 'edited', path: 'a\0b' }).success).toBe(false);
  });
});

describe('SecretName', () => {
  it('accepts lowercase slugs', () => {
    expect(SecretName.safeParse('github-app-key').success).toBe(true);
    expect(SecretName.safeParse('k1').success).toBe(true);
  });

  it('rejects anything that could address a path', () => {
    for (const bad of ['', '../x', 'a/b', 'a\b', 'A', '-a', 'a.b', 'C:x']) {
      expect(SecretName.safeParse(bad).success, bad).toBe(false);
    }
  });
});
