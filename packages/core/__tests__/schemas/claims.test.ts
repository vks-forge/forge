/**
 * Tests for the Claim and SecretName schemas.
 *
 * Why: claims are what G1 checks against receipts, so an invented kind or extra field must
 *   be rejected at the door rather than skipped by the matcher; secret names become file
 *   names, so a path-like name must never validate.
 *
 * Pins: the four claim kinds parse, unknown kinds / extra keys / NUL paths are rejected;
 *   SecretName accepts lowercase slugs and `/`-joined paths and rejects dot segments, absolute
 *   paths, backslashes, uppercase, empties, Windows device names and adapter suffixes.
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
  it('accepts flat lowercase slugs and namespaced paths', () => {
    for (const ok of [
      'github-app-key',
      'k1',
      'github/acme/key',
      'harness/claude-1/api-key',
      'run/run_01.x/secret',
    ]) {
      expect(SecretName.safeParse(ok).success, ok).toBe(true);
    }
  });

  it('rejects anything that could address a path or collide on disk', () => {
    for (const bad of [
      '',
      '../x',
      'a/../b',
      '..',
      '/abs',
      'a/',
      'a//b',
      String.raw`a\b`,
      'A',
      'a/B',
      '-a',
      '.a',
      'a.',
      'C:x',
      'nul',
      'a/com1.txt',
      'k.dpapi',
      'a.tmp/b',
      'x'.repeat(129),
    ]) {
      expect(SecretName.safeParse(bad).success, bad).toBe(false);
    }
  });
});
