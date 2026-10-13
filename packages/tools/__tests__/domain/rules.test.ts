/**
 * Pins shell rule evaluation: lane defaults, chains, obfuscation, last-match and longest-prefix.
 *
 * Why: these are the rules that decide whether `pnpm test && git push` runs. A narrow
 * allow must beat a broad deny only in the way the design says, and quoting tricks must
 * not hide a push from the chain judged by its worst segment.
 *
 * Pins: evaluateShell() by lane, shell chains and obfuscation, last-match and longest-prefix.
 * Depends on: domain/rules, helpers/rule-eval, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { effectiveGrant } from '#/domain/grants.js';
import { evaluateToolRules } from '#/domain/rules.js';
import type { CallRule } from '#/schemas/grant.js';
import { grant } from '#tests/helpers/fixtures.js';
import { CWD, sh, rule } from '#tests/helpers/rule-eval.js';

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
