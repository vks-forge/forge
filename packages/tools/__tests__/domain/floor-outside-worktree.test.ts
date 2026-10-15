/**
 * Pins: no allowed shell command can name a file in Forge's data home or the environment.
 *
 * Why: `git diff`, `git add`, `git commit` and `git stash` are allowed in every lane, and
 *   each can read a file by itself (`git diff --no-index /dev/null <file>`, `git commit -F
 *   <file>`, `git add --pathspec-from-file=<file>`). If the data-home floor only looked at
 *   known reader commands, a Worker could print Forge's install token or database through
 *   them. Likewise `Get-ChildItem Env:` or `printenv` would show the API keys Forge hands the
 *   harness. These cases fix both sides: the leaks are managed denies, the everyday git
 *   commands inside the worktree still run unattended.
 *
 * Pins: evaluateShell() on git and environment-dump commands.
 * Depends on: domain/tokenizer, helpers/rule-eval, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { tokenizeShell } from '#/domain/tokenizer.js';
import { sh } from '#tests/helpers/rule-eval.js';

const isFloorDeny = (r: { effect: string; reason: string }) =>
  r.effect === 'deny' && r.reason === 'managed_deny';

describe('argv naming the data home is denied whatever the command', () => {
  it.each([
    'git diff --no-index /dev/null ../../../forge-home/install-token',
    'git diff --no-index -a /dev/null ../../../forge-home/forge.db',
    'git diff HEAD -- /forge-home/install-token',
    'git commit -F /forge-home/install-token -m x',
    'git commit --file=/forge-home/install-token',
    'git add --pathspec-from-file=../../../forge-home/install-token',
    'git add --pathspec-from-file ../../../forge-home/install-token',
    'git stash push -m x /forge-home/forge.db',
    'pnpm test /forge-home/forge.db',
    'git commit -F../../../forge-home/install-token',
    'git -c core.excludesfile=/forge-home/install-token status',
    'git diff --no-index /dev/null "/forge-home/runs/r1/hook.json"',
  ])('%s', (cmd) => {
    expect(isFloorDeny(sh('standard', cmd))).toBe(true);
    expect(isFloorDeny(sh('full', cmd))).toBe(true);
  });

  it.each([
    'git diff --no-index a b',
    'git diff --no-ind a b',
    'git --git-dir=../x status',
    'git --work-tree=../x status',
    'git -C .. status',
    'git commit --template=../msg',
    'git commit -F ../../msg.txt',
    'git add --pathspec-from-file=../list.txt',
  ])('%s is denied even outside the data home', (cmd) => {
    expect(isFloorDeny(sh('standard', cmd))).toBe(true);
  });

  it.each([
    'git diff',
    'git diff --stat HEAD~1',
    'git add -A',
    'git add src/a.ts',
    'git commit -m "x"',
    'git commit -m "x" -C HEAD',
    'git commit -F msg.txt',
    'git log -F foo',
    'git stash',
    'git status',
  ])('%s inside the worktree still runs', (cmd) => {
    expect(sh('standard', cmd).effect).toBe('allow');
  });
});

describe('environment dumps are denied in every lane', () => {
  it.each([
    ['Get-ChildItem Env:', 'powershell'],
    ['ls env:', 'powershell'],
    ['dir env:\\', 'powershell'],
    ['gci Env:ANTHROPIC_API_KEY', 'powershell'],
    ['Get-Content -Path env:CLAUDE_CODE_OAUTH_TOKEN', 'powershell'],
    ['Get-Item env:*', 'powershell'],
    ['Get-ChildItem variable:', 'powershell'],
    ['ls HKLM:\\SOFTWARE', 'powershell'],
    ['Get-Variable', 'powershell'],
    ['echo $env:ANTHROPIC_API_KEY', 'powershell'],
    ['echo ${env:ANTHROPIC_API_KEY}', 'powershell'],
    ['Write-Output GetEnvironmentVariables', 'powershell'],
    ['env', 'bash'],
    ['printenv', 'bash'],
    ['printenv ANTHROPIC_API_KEY', 'bash'],
    ['set', 'bash'],
    ['export -p', 'bash'],
    ['export', 'bash'],
    ['declare -x', 'bash'],
    ['declare -p', 'bash'],
    ['cat /proc/self/environ', 'bash'],
    ['tr "\\0" "\\n" < /proc/self/environ', 'bash'],
  ] as const)('%s', (cmd, dialect) => {
    for (const lane of ['express', 'standard', 'full'] as const) {
      expect(isFloorDeny(sh(lane, cmd, [], dialect))).toBe(true);
    }
  });

  it.each([
    '[Environment]::GetEnvironmentVariable("X")',
    '[System.Environment]::GetEnvironmentVariables()',
  ])('%s never tokenizes, so the .NET API cannot reach evaluation', (cmd) => {
    expect(tokenizeShell(cmd, 'powershell').ok).toBe(false);
  });

  it.each([
    ['env pnpm test', 'bash'],
    ['env CI=1 pnpm test', 'bash'],
    ['set -e', 'bash'],
    ['ls', 'powershell'],
    ['Get-ChildItem src', 'powershell'],
  ] as const)('%s is not an environment read', (cmd, dialect) => {
    expect(isFloorDeny(sh('standard', cmd, [], dialect))).toBe(false);
  });
});
