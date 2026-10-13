/**
 * Pins the argv-aware floors: push, publish and catastrophic recursive delete.
 *
 * Why: a literal `git push*` floor is dodged by `git -C x push`, `env X=1 git push` or
 * `sudo npm publish`. Workers must never publish or wipe the repo, home or a drive,
 * however the command is spelled; but a command that only quotes those words, or a safe
 * git command, must not be caught. These cases fix both sides of that line.
 *
 * Pins: floorViolation() and its effect through evaluateShell().
 * Depends on: domain/floor-argv, domain/rules, domain/grants, domain/tokenizer, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { floorViolation } from '#/domain/floor-argv.js';
import { effectiveGrant } from '#/domain/grants.js';
import { evaluateShell } from '#/domain/rules.js';
import { tokenizeShell } from '#/domain/tokenizer.js';

const CWD = '/work/repo';
const WT = 'C:/work/repo/.worktrees/t1';

function segments(cmd: string, dialect: 'bash' | 'powershell') {
  const t = tokenizeShell(cmd, dialect);
  if (!t.ok) throw new Error(t.error);
  return t.value;
}
const verdict = (cmd: string, dialect: 'bash' | 'powershell' = 'bash') =>
  evaluateShell(effectiveGrant('full'), segments(cmd, dialect), dialect, CWD);

describe('argv floors deny', () => {
  it.each([
    ['git -C x push', 'bash'],
    ['git --git-dir=.git push origin main', 'bash'],
    ['env GIT_X=1 git push', 'bash'],
    ['sudo -u root git push', 'bash'],
    ['command git push', 'bash'],
    ['time git push', 'bash'],
    ['git push --dry-run', 'bash'],
    ['/usr/bin/git push', 'bash'],
    ['git.exe -C x push', 'powershell'],
    ['GIT push', 'powershell'],
    ['gh pr merge 12 --squash', 'bash'],
    ['gh release create v1', 'bash'],
    ['sudo npm publish --tag beta', 'bash'],
    ['pnpm -r publish', 'bash'],
    ['yarn npm publish', 'bash'],
    ['cargo publish', 'bash'],
    ['twine upload dist/*', 'bash'],
    ['rm -rf ./', 'bash'],
    ['rm -rf .', 'bash'],
    ['rm -fr /work/repo', 'bash'],
    ['rm --recursive --force /', 'bash'],
    ['rm -rf ~', 'bash'],
    ['rm -rf $HOME/', 'bash'],
    ['rm -rf ./*', 'bash'],
    ['rm -rf ..', 'bash'],
    ['sudo rm -rf /', 'bash'],
    ['Remove-Item -Recurse -Force C:\\', 'powershell'],
    ['remove-item -r -force c:', 'powershell'],
    ['Remove-Item -Recurse $env:USERPROFILE', 'powershell'],
    ['Remove-Item -Recurse -Force .\\', 'powershell'],
  ] as const)('%s', (cmd, dialect) => {
    expect(verdict(cmd, dialect)).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });
    expect(verdict(cmd, dialect).rule).toBeTruthy();
  });

  it('reports a floor:argv rule id for argv-only evasions', () => {
    expect(verdict('git -C x push').rule).toBe('floor:argv:git-push');
    expect(verdict('sudo npm publish').rule).toBe('floor:argv:publish');
    expect(verdict('rm -rf ./').rule).toBe('floor:argv:recursive-delete');
  });

  it('denies a push hidden inside a substitution', () => {
    expect(verdict('echo $(git -C x push)').effect).toBe('deny');
  });
});

describe('argv floors leave safe commands alone', () => {
  it.each([
    ['git log --oneline', 'allow'],
    ['git status', 'allow'],
    ['git commit -m "fix: push handling"', 'allow'],
    ['echo "git push"', 'ask'],
    ['rm -rf ./build', 'ask'],
    ['rm file.txt', 'ask'],
    ['rm -rf /work/repo/dist', 'ask'],
    ['npm test', 'allow'],
    ['gh pr view 3', 'ask'],
  ] as const)('%s -> %s (not a floor)', (cmd, effect) => {
    const o = verdict(cmd);
    expect(o.reason).not.toBe('managed_deny');
    expect(o.effect).toBe(effect);
  });

  it('floorViolation returns null for plain segments', () => {
    const [seg] = segments('echo "git push"', 'bash');
    expect(floorViolation(seg as NonNullable<typeof seg>, CWD)).toBeNull();
  });
});

const denied = (cmd: string, dialect: 'bash' | 'powershell' = 'bash', cwd = CWD) =>
  evaluateShell(effectiveGrant('full'), segments(cmd, dialect), dialect, cwd);

describe('git output options are writes through the write floors', () => {
  it.each([
    'git log --output=.env',
    'git diff --output .env',
    'git show -o .env HEAD',
    'git format-patch -o .forge/tools x',
    'git diff --output=../../.forge/data/forge.db',
    'git log --output=/etc/x',
    'git -C . diff --outp=.env',
  ])('%s is a managed deny', (cmd) => {
    expect(denied(cmd)).toMatchObject({ effect: 'deny', reason: 'managed_deny' });
  });

  it('leaves an ordinary output file to the lane rules', () => {
    expect(denied('git diff --output=out.patch').reason).not.toBe('managed_deny');
  });
});

describe('interpreter eval and wrappers are re-tokenised and floored', () => {
  it.each([
    ['bash -c "git push origin main"', 'bash'],
    ["sh -c 'pnpm test && git push'", 'bash'],
    ['zsh -c "npm publish"', 'bash'],
    ['bash -lc "git -C x push"', 'bash'],
    ['bash -c "bash -c \\"git push\\""', 'bash'],
    ['eval "git push"', 'bash'],
    ['cmd /c git push', 'bash'],
    ['cmd.exe /c "git push"', 'powershell'],
    ['powershell -Command "git push"', 'powershell'],
    ['pwsh -c "npm publish"', 'powershell'],
    ['powershell -NoProfile -Command "Remove-Item -Recurse -Force C:\\"', 'powershell'],
    ['xargs git push', 'bash'],
    ['timeout 10 git push', 'bash'],
    ['setsid nohup git push', 'bash'],
    ['nice -n 5 git push', 'bash'],
    ['env -i FOO=1 git push', 'bash'],
    ['sudo -E npm publish', 'bash'],
    ['bash -c "cat .env"', 'bash'],
    ['bash -c "rm -rf /"', 'bash'],
    ['python -c "import os; os.system(\'git push\')"', 'bash'],
  ] as const)('%s', (cmd, dialect) => {
    expect(denied(cmd, dialect)).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });
  });

  it('decodes a PowerShell -EncodedCommand', () => {
    const enc = Buffer.from('git push', 'utf16le').toString('base64');
    expect(denied(`powershell -EncodedCommand ${enc}`, 'powershell')).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });
  });

  it('only asks when the nested script is harmless', () => {
    const o = denied('bash -c "pnpm test"');
    expect(o.effect).toBe('ask');
    expect(o.reason).not.toBe('managed_deny');
  });
});

describe('git -c keys that run commands or push are denied', () => {
  it.each([
    'git -c alias.p=push p',
    'git -c alias.x="!sh -c y" x',
    'git -c core.sshCommand=evil fetch',
    'git -c core.hooksPath=/tmp/h commit -m x',
    'git -c push.default=current status',
    'git -C . -c CORE.SSHCOMMAND=evil fetch',
    'git -calias.p=push p',
    'git -c core.pager=evil log',
    'git -c credential.helper=evil fetch',
    'GIT_SSH_COMMAND=evil git fetch',
    'GIT_CONFIG_COUNT=1 git status',
  ])('%s', (cmd) => {
    expect(denied(cmd)).toMatchObject({ effect: 'deny', reason: 'managed_deny' });
  });

  it('allows harmless -c settings', () => {
    expect(denied('git -c color.ui=never status').reason).not.toBe('managed_deny');
    expect(denied('git -c user.name=x commit -m x').reason).not.toBe('managed_deny');
  });
});

describe('catastrophic recursive delete includes the cwd and its ancestors', () => {
  it.each([
    ['rm -rf C:/work/repo/.worktrees/t1', 'bash'],
    ['rm -rf C:/work/repo/.worktrees', 'bash'],
    ['rm -rf C:/work/repo', 'bash'],
    ['rm -rf C:/work/repo/', 'bash'],
    ['rm -rf ../..', 'bash'],
    ['rm -rf ../../*', 'bash'],
    ['rm -rf *', 'bash'],
    ['rm -rf ./*', 'bash'],
    ['Remove-Item -Recurse -Force *', 'powershell'],
    ['Remove-Item -Recurse -Force .\\*', 'powershell'],
    ['Remove-Item -Recurse -Force -Path C:\\Work\\Repo', 'powershell'],
    ['rd /s /q C:\\work\\repo', 'powershell'],
    ['rmdir /s /q .', 'powershell'],
  ] as const)('%s', (cmd, dialect) => {
    expect(denied(cmd, dialect, WT)).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });
  });

  it.each([
    'rm -rf dist',
    'rm -rf C:/work/repo/.worktrees/t1/dist',
    'rm -rf C:/work/repo/.worktrees/t10',
    'rm -rf node_modules',
  ])('%s is not a floor', (cmd) => {
    expect(denied(cmd, 'bash', WT).reason).not.toBe('managed_deny');
  });
});

describe('directory and file readers are checked against the read floors', () => {
  it.each([
    ['ls .forge/data', 'bash'],
    ['ls -la ../../.forge/data', 'bash'],
    ['cat .env', 'bash'],
    ['cat src/a.ts .env', 'bash'],
    ['head -n 5 C:/Users/x/.claude.json', 'bash'],
    ['tail -f C:/work/repo/.forge/data/forge.db', 'bash'],
    ['less ~/.ssh/id_rsa', 'bash'],
    ['more .ENV', 'powershell'],
    ['type .env', 'powershell'],
    ['Get-Content .env', 'powershell'],
    ['Get-Content -Path ..\\..\\.forge\\data\\forge.db', 'powershell'],
    ['Get-ChildItem C:\\work\\repo\\.forge\\data', 'powershell'],
    ['dir ..\\..\\.forge\\data', 'powershell'],
    ['cat .e*', 'bash'],
    ['cat id_*', 'bash'],
    ['cat .forge/d*', 'bash'],
    ['ls /etc', 'bash'],
  ] as const)('%s', (cmd, dialect) => {
    expect(denied(cmd, dialect, WT)).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });
  });

  it.each(['ls', 'ls src', 'cat src/a.ts', 'head -n 5 README.md', 'cat *.md', 'ls .*'])(
    '%s is not floored',
    (cmd) => {
      expect(denied(cmd, 'bash', WT).reason).not.toBe('managed_deny');
    },
  );
});
