/**
 * Pins path rule evaluation and path normalisation.
 *
 * Why: file tools are judged by the path they name. Path tricks (dot segments, mixed
 * separators, case) must not hide a write to a credential file or an escape from the
 * working directory.
 *
 * Pins: evaluateToolRules() on paths, normalizePath().
 * Depends on: domain/rules, helpers/rule-eval, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { evaluateToolRules, normalizePath } from '#/domain/rules.js';
import { CWD } from '#tests/helpers/rule-eval.js';
import { testGrant } from '#tests/helpers/fixtures.js';

describe('path rules', () => {
  const std = testGrant('standard');
  const exp = testGrant('express');
  const ev = (g: typeof std, action: string, path: string) =>
    evaluateToolRules(g, action, path, CWD);

  it.each([
    ['edit', 'src/a.ts', 'allow', 'allow'],
    ['write', 'docs/x.md', 'allow', 'allow'],
    ['edit', 'migrations/0003.sql', 'deny', 'ask'],
    ['edit', 'packages/db/migrations/0003.sql', 'deny', 'ask'],
    ['edit', 'auth/session.ts', 'deny', 'ask'],
    ['edit', '.forge/memory/x.md', 'deny', 'ask'],
    ['edit', 'CLAUDE.md', 'deny', 'ask'],
    ['edit', '/work/repo/src/a.ts', 'allow', 'allow'],
    ['edit', '/work/repo/migrations/1.sql', 'deny', 'ask'],
    ['read', 'src/a.ts', 'allow', 'allow'],
  ] as const)('%s %s: express %s, standard %s', (action, path, e, s) => {
    expect(ev(exp, action, path).effect).toBe(e);
    expect(ev(std, action, path).effect).toBe(s);
  });

  it.each([
    ['edit', '.forge/tools/grants/lanes.yaml'],
    ['write', '.forge/tools/catalog.yaml'],
    ['read', '.env'],
    ['read', 'apps/web/.env'],
    ['write', 'certs/server.pem'],
    ['read', 'home/.ssh/id_rsa'],
    ['read', '/forge-home/forge.db'],
    ['read', '/forge-home/secrets/catalogue.key'],
    ['edit', '/forge-home/runs/r1/hook.json'],
    ['write', '/forge-home/forge.db-wal'],
    ['edit', '../outside.txt'],
    ['edit', 'src/../../outside.txt'],
    ['edit', '/etc/passwd'],
    ['write', 'C:\\Windows\\x.dll'],
  ])('floor: %s %s is a managed deny', (action, path) => {
    expect(ev(testGrant('full'), action, path)).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });
  });

  it('keeps the .forge/memory of this repo readable while the data home is not', () => {
    expect(ev(std, 'read', '.forge/memory/MEMORY.md').effect).not.toBe('deny');
    expect(ev(testGrant('full'), 'read', '/forge-home/x').effect).toBe('deny');
  });

  it('lets an example env file through', () => {
    expect(ev(std, 'read', '.env.example').effect).toBe('allow');
  });

  it('web rules by lane', () => {
    const full = testGrant('full');
    expect(
      evaluateToolRules(std, 'web_fetch', 'https://docs.example.com/a/b').effect,
    ).toBe('allow');

    expect(evaluateToolRules(std, 'web_fetch', 'https://evil.example.com').effect).toBe(
      'ask',
    );

    expect(
      evaluateToolRules(full, 'web_fetch', 'https://docs.example.com/a').effect,
    ).toBe('ask');

    expect(evaluateToolRules(full, 'web_search', 'vitest coverage').effect).toBe('allow');
  });
});

describe('normalizePath', () => {
  it.each([
    ['src/./a/../b.ts', undefined, 'src/b.ts'],
    ['a\\b\\c', undefined, 'a/b/c'],
    ['../x', undefined, '../x'],
    ['a/../../x', undefined, '../x'],
    ['/work/repo/src/a.ts', '/work/repo', 'src/a.ts'],
    ['/work/repo', '/work/repo/', '.'],
    ['C:\\Work\\Repo\\src\\a.ts', 'c:/work/repo', 'src/a.ts'],
    ['/work/repository/x', '/work/repo', '/work/repository/x'],
    ['/../etc', undefined, '/etc'],
    ['', undefined, '.'],
  ])('%j (cwd %j) -> %j', (p, cwd, expected) => {
    expect(normalizePath(p, cwd)).toBe(expected);
  });
});
