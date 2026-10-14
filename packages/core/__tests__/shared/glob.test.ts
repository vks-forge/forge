/**
 * Tests for the glob matcher's grammar and its worst-case cost.
 *
 * Why: one glob list decides which paths force the heaviest lane and who must sign off.
 *   A slash-less rule such as `*.sql` that silently matched only the repo root would let
 *   a nested migration slip past the tier-C check, and a pattern with a long run of `*`
 *   must not be able to freeze the Director's tick through regex backtracking.
 *
 * Pins: gitignore-style depth for slash-less patterns, anchoring of patterns that contain
 *   a slash, `**` forms, `?`, Windows separators, and that pathological patterns finish
 *   in milliseconds.
 * Depends on: src/shared/glob, vitest.
 */

import { describe, expect, it } from 'vitest';
import { globMatch } from '#/shared/glob.js';

describe('globMatch case', () => {
  it('is case-sensitive by default and case-insensitive on request', () => {
    expect(globMatch('.github/**', '.GitHub/workflows/ci.yml')).toBe(false);
    expect(globMatch('.github/**', '.GitHub/workflows/ci.yml', true)).toBe(true);
    expect(globMatch('*.sql', 'DB/X.SQL', true)).toBe(true);
  });
});

describe('globMatch grammar', () => {
  it('matches a slash-less pattern at any depth (gitignore semantics)', () => {
    expect(globMatch('*.sql', 'x.sql')).toBe(true);
    expect(globMatch('*.sql', 'db/migrations/x.sql')).toBe(true);
    expect(globMatch('*.sql', String.raw`db\migrations\x.sql`)).toBe(true);
    expect(globMatch('*.sql', 'db/x.sql.bak')).toBe(false);
    expect(globMatch('secrets', 'a/b/secrets')).toBe(true);
    expect(globMatch('secrets', 'a/mysecrets')).toBe(false);
  });

  it('anchors a pattern that contains a slash to the root', () => {
    expect(globMatch('db/*.sql', 'db/x.sql')).toBe(true);
    expect(globMatch('db/*.sql', 'app/db/x.sql')).toBe(false);
    expect(globMatch('db/*.sql', 'db/migrations/x.sql')).toBe(false);
  });

  it('supports **, leading **/ and ?', () => {
    expect(globMatch('db/**', 'db/a/b/c.sql')).toBe(true);
    expect(globMatch('**/auth/**', 'auth/login.ts')).toBe(true);
    expect(globMatch('a?c', 'abc')).toBe(true);
    expect(globMatch('a?c', 'a/c')).toBe(false);
  });
});

describe('globMatch cost', () => {
  it('collapses runs of * so a hostile pattern cannot backtrack catastrophically', () => {
    const pattern = `${'*'.repeat(30)}x.md`;
    const path = 'a'.repeat(40);
    const t0 = Date.now();
    const hit = globMatch(pattern, path);
    expect(Date.now() - t0).toBeLessThan(50);
    expect(hit).toBe(false);
    expect(globMatch(pattern, 'docs/x.md')).toBe(true);
  });

  it('collapses repeated **/ segments', () => {
    const pattern = `${'**/'.repeat(25)}x.md`;
    const t0 = Date.now();
    const hit = globMatch(pattern, `${'a/'.repeat(30)}y.md`);
    expect(Date.now() - t0).toBeLessThan(50);
    expect(hit).toBe(false);
  });
});
