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
import { effectiveGrant } from '#/domain/grants.js';
import { evaluateToolRules, normalizePath } from '#/domain/rules.js';
import { CWD } from '#tests/helpers/rule-eval.js';

describe('path rules', () => {
  const std = effectiveGrant('standard');
  const exp = effectiveGrant('express');
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
    ['read', '.forge/data/forge.db'],
    ['read', '.forge/data/secrets/catalogue.key'],
    ['edit', '.forge/data/runs/r1/hook.json'],
    ['write', '.forge/data/forge.db-wal'],
    ['read', '/work/repo/.forge/data/forge.db'],
    ['edit', '../outside.txt'],
    ['edit', 'src/../../outside.txt'],
    ['edit', '/etc/passwd'],
    ['write', 'C:\\Windows\\x.dll'],
  ])('floor: %s %s is a managed deny', (action, path) => {
    expect(ev(effectiveGrant('full'), action, path)).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });
  });

  it('keeps Forge memory readable while Forge data is not', () => {
    expect(ev(std, 'read', '.forge/memory/MEMORY.md').effect).not.toBe('deny');
    expect(ev(effectiveGrant('full'), 'read', '.forge/data/x').effect).toBe('deny');
  });

  it('lets an example env file through', () => {
    expect(ev(std, 'read', '.env.example').effect).toBe('allow');
  });

  it('web rules by lane', () => {
    const full = effectiveGrant('full');
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
