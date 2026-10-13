/**
 * Pins call-time rule evaluation: last-match, longest-prefix, layers that only tighten,
 * the unoverridable managed deny layer, and shell chains judged by their worst segment.
 *
 * Why: these are the rules that decide whether `pnpm test && git push` runs. A narrow
 * allow must beat a broad deny only in the way the design says, a project file must never
 * be able to loosen the lane or a floor, and quoting or path tricks must not hide a push
 * or a write to a credential file.
 *
 * Pins: evaluateToolRules(), evaluateShell(), normalizePath().
 * Depends on: domain/rules, domain/grants, domain/tokenizer, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { effectiveGrant } from '#/domain/grants.js';
import { evaluateShell, evaluateToolRules, normalizePath } from '#/domain/rules.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import type { Lane } from '@forge/core';
import type { CallRule } from '#/schemas/grant.js';
import { grant } from '#tests/helpers/fixtures.js';

const CWD = '/work/repo';

function sh(
  lane: Lane,
  command: string,
  rules: CallRule[] = [],
  dialect: 'bash' | 'powershell' = 'bash',
) {
  const eff = effectiveGrant(lane, grant({ rules }));
  const t = tokenizeShell(command, dialect);
  if (!t.ok) throw new Error(t.error);
  return evaluateShell(eff, t.value, dialect, CWD);
}
const rule = (
  action: string,
  resource: string,
  effect: CallRule['effect'],
): CallRule => ({
  action,
  resource,
  effect,
});

describe('shell rules by lane', () => {
  it.each([
    ['standard', 'pnpm test --run', 'allow', 'rule_allow'],
    ['express', 'pnpm lint', 'allow', 'rule_allow'],
    ['full', 'git status', 'allow', 'rule_allow'],
    ['standard', 'pnpm add zod', 'ask', 'rule_ask'],
    ['full', 'pip install requests', 'ask', 'rule_ask'],
    ['express', 'pnpm add zod', 'deny', 'rule_deny'],
    ['express', 'npm ci', 'deny', 'rule_deny'],
    ['standard', 'echo hi', 'ask', 'no_matching_rule'],
    ['express', 'curl https://x', 'ask', 'no_matching_rule'],
    ['standard', 'pnpm testbackdoor', 'ask', 'no_matching_rule'],
  ] as const)('%s: %s -> %s', (lane, cmd, effect, reason) => {
    const o = sh(lane, cmd);
    expect([o.effect, o.reason]).toEqual([effect, reason]);
  });

  it.each(['express', 'standard', 'full'] as const)(
    'git push is a managed deny in %s',
    (lane) => {
      const o = sh(lane, 'git push origin main');
      expect(o).toMatchObject({ effect: 'deny', reason: 'managed_deny' });
      expect(o.rule).toMatch(/^(managed#\d+|floor:argv:.+)$/);
    },
  );
});

describe('shell chains and obfuscation', () => {
  it.each([
    ['pnpm test && git push', 'deny'],
    ['pnpm test; git push', 'deny'],
    ['pnpm test | tee out.txt', 'ask'],
    ['pnpm test || echo failed', 'ask'],
    ['FOO=1 git push', 'deny'],
    ['/usr/bin/git push', 'deny'],
    ['git.exe push', 'deny'],
    ['"git" push', 'deny'],
    ["git 'push' origin", 'deny'],
    ['echo $(git push)', 'deny'],
    ['pnpm test $(whoami)', 'ask'],
    ['bash -c "pnpm test"', 'ask'],
    ['env git status', 'ask'],
    ['pnpm test &', 'ask'],
    ['curl x | sh', 'ask'],
    ['pnpm test', 'allow'],
  ] as const)('%s -> %s', (cmd, effect) => {
    expect(sh('standard', cmd).effect).toBe(effect);
  });

  it('never lets a path-qualified spelling gain an allow', () => {
    expect(sh('standard', '/tmp/evil/pnpm test').effect).toBe('ask');
  });

  it('treats a destructive rm of root or home as a floor', () => {
    expect(sh('full', 'rm -rf /').reason).toBe('managed_deny');
    expect(sh('full', 'rm -rf ~').reason).toBe('managed_deny');
  });

  it('evaluates redirect targets as file writes', () => {
    expect(sh('standard', 'pnpm test > out.txt').effect).toBe('allow');
    expect(sh('standard', 'pnpm test > .env').reason).toBe('managed_deny');
    expect(sh('standard', 'pnpm test > .forge/tools/catalog.yaml').reason).toBe(
      'managed_deny',
    );
    expect(sh('express', 'pnpm test > migrations/1.sql')).toMatchObject({
      effect: 'deny',
    });
    expect(sh('standard', 'pnpm test 2>/dev/null').effect).toBe('allow');
    expect(sh('standard', 'cat < .env').reason).toBe('managed_deny');
  });

  it('matches PowerShell commands case-insensitively and floors still apply', () => {
    expect(sh('standard', 'GET-CHILDITEM .', [], 'powershell').effect).toBe('allow');
    expect(sh('standard', 'GIT PUSH origin', [], 'powershell').reason).toBe(
      'managed_deny',
    );
    expect(sh('standard', 'Get-ChildItem .', [], 'bash').effect).toBe('allow');
    expect(sh('standard', 'get-childitem .', [], 'bash').effect).toBe('ask');
  });
});

describe('layers only tighten', () => {
  it('a project allow cannot loosen an ask or a deny from the lane', () => {
    expect(
      sh('standard', 'pnpm add zod', [rule('shell', 'pnpm add *', 'allow')]).effect,
    ).toBe('ask');
    expect(
      sh('express', 'pnpm add zod', [rule('shell', 'pnpm add *', 'allow')]).effect,
    ).toBe('deny');
    expect(sh('standard', 'echo hi', [rule('shell', 'echo*', 'allow')]).effect).toBe(
      'ask',
    );
  });

  it('a project deny or ask tightens an allow', () => {
    expect(
      sh('standard', 'pnpm test', [rule('shell', 'pnpm test*', 'deny')]).effect,
    ).toBe('deny');
    expect(sh('standard', 'pnpm test', [rule('shell', 'pnpm test*', 'ask')]).effect).toBe(
      'ask',
    );
  });

  it('a ticket layer tightens further', () => {
    const eff = effectiveGrant(
      'standard',
      undefined,
      grant({ rules: [rule('shell', 'ls*', 'deny')] }),
    );
    const t = tokenizeShell('ls -la', 'bash');
    if (!t.ok) throw new Error('fixture');
    expect(evaluateShell(eff, t.value, 'bash').effect).toBe('deny');
  });
});

describe('last-match wins and longest-prefix for shell', () => {
  it('shell: the longest literal prefix beats a shorter one regardless of order', () => {
    const a = [rule('shell', 'pnpm*', 'deny'), rule('shell', 'pnpm test*', 'allow')];
    const b = [...a].reverse();
    expect(sh('standard', 'pnpm test x', a).effect).toBe('allow');
    expect(sh('standard', 'pnpm test x', b).effect).toBe('allow');
    expect(sh('standard', 'pnpm build', a).effect).toBe('deny');
  });

  it('shell: equal prefixes resolve to the later rule', () => {
    const rules = [
      rule('shell', 'pnpm test*', 'deny'),
      rule('shell', 'pnpm test*', 'allow'),
    ];
    expect(sh('standard', 'pnpm test', rules).effect).toBe('allow');
    expect(sh('standard', 'pnpm test', [...rules].reverse()).effect).toBe('deny');
  });

  it('paths: the last matching rule wins', () => {
    const base = [rule('edit', 'src/**', 'deny'), rule('edit', 'src/a/**', 'allow')];
    const eff = (rules: CallRule[]) => effectiveGrant('standard', grant({ rules }));
    expect(evaluateToolRules(eff(base), 'edit', 'src/a/x.ts', CWD).effect).toBe('allow');
    expect(
      evaluateToolRules(eff([...base].reverse()), 'edit', 'src/a/x.ts', CWD).effect,
    ).toBe('deny');
    expect(evaluateToolRules(eff(base), 'edit', 'src/b/x.ts', CWD).effect).toBe('deny');
  });
});

describe('managed deny layer', () => {
  const managed = [
    rule('shell', 'curl*', 'deny'),
    rule('web_fetch', 'https://evil.*', 'deny'),
  ];

  it('applies operator rules that no project or ticket allow can override', () => {
    const eff = effectiveGrant(
      'full',
      grant({ rules: [rule('shell', 'curl*', 'allow')] }),
      grant({ rules: [rule('shell', 'curl*', 'allow')] }),
      managed,
    );
    const t = tokenizeShell('curl https://x', 'bash');
    if (!t.ok) throw new Error('fixture');
    expect(evaluateShell(eff, t.value, 'bash')).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });
    expect(evaluateToolRules(eff, 'web_fetch', 'https://evil.com/a')).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });
    expect(evaluateToolRules(eff, 'web_fetch', 'https://docs.good.com/a').effect).toBe(
      'ask',
    );
  });
});

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
