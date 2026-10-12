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
