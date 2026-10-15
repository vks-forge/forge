/**
 * Pins: the second independent review's confirmed shell-floor bypasses stay closed.
 *
 * Why: Workers run unattended in Express, so every command the allow-list lets through
 *   must be unable to read Forge's install token, the database, other runs' worktrees or
 *   the harness credentials. The review showed that `NAME=value` prefixes hid git's
 *   repository-redirecting variables from the argv floors, that `$VAR` words stayed literal
 *   (so `$LOCALAPPDATA/Forge/install-token` resolved inside the worktree), that provider
 *   drives written with their module or `::` form listed the environment, and a few
 *   narrower holes. Each case below was executed against the first fix round and allowed.
 *
 * Pins: evaluateShell() on prefix assignments, expansions, provider paths, git subcommand
 *   position and `cmd set` listings, on the Express and Standard lanes with a Windows data home.
 * Depends on: domain/grants, domain/rules, domain/tokenizer, vitest. No IO.
 */

import type { Lane } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { effectiveGrant } from '#/domain/grants.js';
import { evaluateShell } from '#/domain/rules.js';
import { tokenizeShell } from '#/domain/tokenizer.js';

const DATA_HOME = 'C:/Users/vikas/AppData/Local/Forge';
const CWD = `${DATA_HOME}/worktrees/acme/ACME-7`;

function verdict(lane: Lane, command: string, dialect: 'bash' | 'powershell' = 'bash') {
  const t = tokenizeShell(command, dialect);
  if (!t.ok) {
    throw new Error(t.error);
  }

  const grant = effectiveGrant(lane, undefined, undefined, [], { dataHome: DATA_HOME });

  return evaluateShell(grant, t.value, dialect, CWD);
}

const LANES: readonly Lane[] = ['express', 'standard'];
const notAllowed = (lane: Lane, cmd: string, dialect: 'bash' | 'powershell' = 'bash') =>
  verdict(lane, cmd, dialect).effect !== 'allow';

const isFloorDeny = (
  lane: Lane,
  cmd: string,
  dialect: 'bash' | 'powershell' = 'bash',
) => {
  const r = verdict(lane, cmd, dialect);

  return r.effect === 'deny' && r.reason === 'managed_deny';
};

describe('N1: prefix assignments cannot hide git repository redirection or data-home paths', () => {
  it.each([
    'GIT_WORK_TREE=../../.. git add -f :/install-token',
    'GIT_WORK_TREE=../../.. git show :install-token',
    'GIT_DIR=../../../memory/.git git log -p',
    'GIT_INDEX_FILE=../../../runs/x/anything git add -A',
    'GIT_OBJECT_DIRECTORY=../../../x git log',
    'GIT_COMMON_DIR=../../../x git log',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES=../../../x git log',
    'GIT_NAMESPACE=x git log',
    'git_dir=../../../memory/.git git log',
    'env GIT_DIR=../../../memory/.git git log',
  ])('%s is a managed deny', (cmd) => {
    for (const lane of LANES) {
      expect(isFloorDeny(lane, cmd)).toBe(true);
    }
  });

  it.each([
    `FOO=${DATA_HOME}/install-token ls`,
    'FOO=../../../install-token ls',
    `FOO=--file=${DATA_HOME}/runs/x pnpm test`,
  ])('%s: the data-home floor reads assignment values', (cmd) => {
    for (const lane of LANES) {
      expect(isFloorDeny(lane, cmd)).toBe(true);
    }
  });

  it('an ordinary assignment before an allowed command still runs', () => {
    expect(verdict('express', 'CI=1 git status').effect).toBe('allow');
  });
});

describe('N2: variable and home expansions are not judged as literal text', () => {
  it.each([
    'git commit -F $LOCALAPPDATA/Forge/install-token --allow-empty',
    'git commit -F - --allow-empty < $LOCALAPPDATA/Forge/install-token',
    'ls -la $LOCALAPPDATA/Forge/runs',
    'git commit --allow-empty -m "$ANTHROPIC_API_KEY"',
    'ls $ANTHROPIC_API_KEY',
    'git branch $KEY',
    'pnpm test $KEY',
    'ls ${LOCALAPPDATA}/Forge',
    'ls "${LOCALAPPDATA}/Forge"',
    'ls ~root',
    'git add $PWD',
  ])('%s is not allowed on any lane', (cmd) => {
    for (const lane of LANES) {
      expect(notAllowed(lane, cmd)).toBe(true);
    }

    expect(verdict('standard', cmd).effect).not.toBe('allow');
  });

  it.each([
    'Get-ChildItem $HOME\\AppData\\Local\\Forge',
    'Get-ChildItem $PSHOME',
    'Get-Content "$PWD\\x"',
    'Get-ChildItem $ExecutionContext',
  ])('PowerShell: %s is not allowed', (cmd) => {
    for (const lane of LANES) {
      expect(notAllowed(lane, cmd, 'powershell')).toBe(true);
    }
  });

  it.each([
    ["git commit -m '$KEY'", 'bash'],
    ['git status 2>$null', 'powershell'],
    ['git commit -m "cost is 5 dollars"', 'bash'],
    ['git add src/a.ts', 'bash'],
    ['ls ./~root', 'bash'],
    ['git commit -m "a \\$KEY"', 'bash'],
    ["Get-ChildItem '$HOME'", 'powershell'],
  ] as const)('%s stays allowed (%s)', (cmd, dialect) => {
    expect(verdict('express', cmd, dialect).effect).toBe('allow');
  });
});

describe('N3: provider-qualified drives are environment reads', () => {
  it.each([
    'Get-ChildItem -LiteralPath Environment::',
    'Get-ChildItem Microsoft.PowerShell.Core\\Environment::',
    'Get-Content Environment::ANTHROPIC_API_KEY',
    'Get-ChildItem -Path Microsoft.PowerShell.Core\\Registry::HKEY_LOCAL_MACHINE',
    'Get-Item Microsoft.PowerShell.Core\\Variable::*',
    'Get-Content Microsoft.PowerShell.Core\\FileSystem::C:\\Users\\vikas\\AppData\\Local\\Forge\\install-token',
  ])('%s is a managed deny', (cmd) => {
    for (const lane of LANES) {
      expect(isFloorDeny(lane, cmd, 'powershell')).toBe(true);
    }
  });
});

describe('N4: only the git subcommand position means push', () => {
  it.each([
    'git stash push -m wip',
    'git commit -m push --allow-empty',
    'git add push',
    'git log push',
  ])('%s runs unattended', (cmd) => {
    expect(verdict('express', cmd).effect).toBe('allow');
  });

  it.each([
    'git push',
    'git push origin main',
    'git -c user.name=x push',
    'git --no-pager push',
    'git --git-dir=x push',
    'git --git-dir x push',
    'git -C x push',
    'sudo git push',
    'env X=1 git push',
  ])('%s is still denied', (cmd) => {
    expect(isFloorDeny('express', cmd)).toBe(true);
  });
});

describe('N6: cmd set with a prefix lists environment variables', () => {
  it.each(['cmd /c set ANTHROPIC', 'cmd /c set A', 'cmd /c "set CLAUDE"'])(
    '%s is a managed deny',
    (cmd) => {
      expect(isFloorDeny('standard', cmd)).toBe(true);
    },
  );

  it.each(['set -e', 'set -o pipefail'])('%s stays allowed to parse', (cmd) => {
    expect(isFloorDeny('standard', cmd)).toBe(false);
  });
});
