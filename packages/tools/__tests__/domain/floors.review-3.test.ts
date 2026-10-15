/**
 * Pins: the third review's (C4) shell-floor bypasses stay closed.
 *
 * Why: Workers run unattended in Express, where any word the shell would expand into a
 *   path the tokenizer cannot see (`ls {../../..,.}`, `cat .*` + `/.*` reaching `..`) can
 *   walk out of the worktree to Forge's install token and database, and PowerShell
 *   provider drives (`Temp:`) or `git -ccore.pager=sh` can run programs or leave the
 *   worktree. The floors judge literal argv, so anything that expands must be flagged.
 *
 * Pins: evaluateShell() on bash brace expansion, dot-leading globs, PowerShell provider
 *   drives and attached git `-c`, on the Express lane with a Windows data home.
 * Depends on: domain/grants, domain/rules, domain/tokenizer, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { envViolation } from '#/domain/env-floor.js';
import { effectiveGrant } from '#/domain/grants.js';
import { evaluateShell } from '#/domain/rules.js';
import { tokenizeShell } from '#/domain/tokenizer.js';

const DATA_HOME = 'C:/Users/vikas/AppData/Local/Forge';
const CWD = `${DATA_HOME}/worktrees/acme/ACME-7`;

type Dialect = 'bash' | 'powershell';

function express(command: string, dialect: Dialect = 'bash') {
  const t = tokenizeShell(command, dialect);
  if (!t.ok) {
    throw new Error(t.error);
  }

  const grant = effectiveGrant('express', undefined, undefined, [], {
    dataHome: DATA_HOME,
  });

  return evaluateShell(grant, t.value, dialect, CWD);
}

const flagged = (cmd: string, dialect: Dialect = 'bash'): boolean => {
  const t = tokenizeShell(cmd, dialect);

  return t.ok && t.value.some((s) => s.flags.includes('expansion'));
};

describe('C4-1: bash brace expansion is an expansion', () => {
  it.each([
    'ls {../../..,.}',
    'ls -R {../../..,.}',
    'ls {~,.}',
    'git commit --allow-empty -F {.,.}{.,.}/x',
    'ls a{b,c}',
    'ls {a,b}c',
    'ls {a,{b,c}}',
    'ls {a..z}',
    'ls {1..3}',
    'ls x{,.bak}',
    'echo x{a,b}y',
    'ls {a,b}{c}',
  ])('%s is flagged', (cmd) => {
    expect(flagged(cmd)).toBe(true);
  });

  it.each([
    'ls {../../..,.}',
    'ls -R {../../..,.}',
    'ls {~,.}',
    'git commit --allow-empty -F {.,.}{.,.}/x',
  ])('%s is not allowed on Express', (cmd) => {
    expect(express(cmd).effect).not.toBe('allow');
  });

  it.each([
    String.raw`ls \{a,b\}`,
    String.raw`ls \{../../..,.\}`,
    String.raw`ls {a\,b}`,
    "ls '{a,b}'",
    'ls "{a,b}"',
    "ls '{../../..,.}'",
    'ls {a}',
    'ls {}',
    'ls a{b}c',
    'ls {a,b',
    'ls a,b}',
  ])('%s stays literal (no flag)', (cmd) => {
    expect(flagged(cmd)).toBe(false);
  });

  it('powershell braces (script blocks, hash literals) are not bash expansion', () => {
    expect(flagged('Get-ChildItem {a,b}', 'powershell')).toBe(false);
  });

  it('${...} is still an expansion', () => {
    expect(flagged('ls ${HOME}')).toBe(true);
    expect(flagged('ls "${HOME}"')).toBe(true);
  });
});

describe('C4-2: dot-leading globs can match ..', () => {
  it.each([
    'cat .*/.*/.*/install-token',
    'ls .?/.?',
    'ls .[.]/.[.]',
    'ls ..*',
    'ls .[!a]',
    'ls x/.*',
    'ls ./.*/x',
  ])('%s is not allowed on Express', (cmd) => {
    expect(express(cmd).effect).not.toBe('allow');
  });

  it.each([
    'cat .*/.*/.*/install-token',
    'ls .?/.?',
    'ls .[.]/.[.]',
    'ls x/.*',
  ])('%s is flagged as expansion', (cmd) => {
    expect(flagged(cmd)).toBe(true);
  });

  it.each(['ls *.ts', 'ls src/*.ts', 'ls ./src/*', 'ls .gitignore', 'ls "x/.*"', "ls '.*'"])(
    '%s is not flagged as dot-glob',
    (cmd) => {
      expect(flagged(cmd)).toBe(false);
    },
  );

  it.each([
    String.raw`Get-ChildItem ..\*`,
    'gci .*',
    String.raw`Get-ChildItem .*\.*\.*\install-token`,
    String.raw`Get-ChildItem ..\..\..\*`,
    String.raw`Get-Content ..\..\..\install-tok*`,
    String.raw`Get-Content C:\Users\vikas\AppData\Local\Forge\inst*`,
  ])('PowerShell %s is not allowed on Express', (cmd) => {
    expect(express(cmd, 'powershell').effect).not.toBe('allow');
  });
});

describe('C4-3: PowerShell provider drives', () => {
  it.each([
    'Get-ChildItem Temp:',
    'Get-ChildItem Temp:\\',
    'Get-ChildItem temp:\\x',
    'Get-ChildItem TEMP:',
    'Get-ChildItem Variable:',
    'Get-ChildItem Function:',
    'Get-ChildItem Alias:',
    'Get-ChildItem WSMan:',
    'Get-ChildItem Cert:',
    'Get-ChildItem -Path Temp:',
    'Get-ChildItem Foo:',
    'gci Env:',
    'gci HKLM:',
  ])('%s is a managed deny', (cmd) => {
    const r = express(cmd, 'powershell');

    expect(r.effect).toBe('deny');
    expect(r.reason).toBe('managed_deny');
  });

  it.each([
    String.raw`Get-ChildItem C:\x`,
    'Get-ChildItem C:',
    'ls D:/src',
    'git status',
    'git commit -m "fix: thing"',
    'pnpm test --filter=a:b',
    'pnpm run test:unit',
    'Get-Date -Format HH:mm:ss',
    'Invoke-WebRequest https://example.com',
  ])('%s is not a provider drive deny (env floor)', (cmd) => {
    const t = tokenizeShell(cmd, 'powershell');
    if (!t.ok) {
      throw new Error(t.error);
    }

    expect(t.value.map((s) => envViolation(s))).toEqual(t.value.map(() => null));
  });
});

describe('C4-4: git -c with an attached value', () => {
  it.each([
    'git -ccore.fsmonitor=evil status',
    'git -ccore.pager=sh log',
    'git -cCore.Pager=sh log',
    'git -ccore.sshCommand=x status',
    'git -c core.sshCommand=x status',
    'git --config-env=core.pager=X log',
    'git --config-env core.pager=X log',
    'git -calias.p=push p',
    'git -c core.hooksPath=/x commit -m x',
  ])('%s is a git-config deny', (cmd) => {
    const r = express(cmd);

    expect(r.effect).toBe('deny');
    expect(r.rule).toBe('floor:argv:git-config');
  });

  it('attached -C<path> is value-bearing, so push is still found', () => {
    expect(express('git -Cx push').rule).toBe('floor:argv:git-push');
    expect(express('git -Cx status').rule).not.toBe('floor:argv:git-push');
  });

  it('a benign attached -c key is not a config deny', () => {
    expect(express('git -cuser.name=x status').rule).not.toBe('floor:argv:git-config');
  });
});
