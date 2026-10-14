/**
 * Pins the one `cd` that policy lets through: into the directory the run is already in.
 *
 * Why: Workers write `cd <worktree> ; ls` out of habit. Without this the unattended `ask`
 * on `cd` becomes a `deny` and the whole line is lost (probe 8). The risk side matters
 * more than the allow: only the exact no-op spelling may be lifted, and no property of a
 * chained command may be loosened by it, so floors, other segments and every other `cd`
 * keep their answer.
 *
 * Pins: evaluateShell() on cd segments by lane and dialect, and the property that a
 * `cd` to any other directory is never an allow.
 * Depends on: domain/rules via helpers/rule-eval, fast-check, vitest. No IO.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CWD, sh } from '#tests/helpers/rule-eval.js';

describe('cd into the run cwd', () => {
  it.each([`cd ${CWD}`, 'cd .', `cd ${CWD}/`, `cd "${CWD}"`, `cd '${CWD}'`])(
    '%s is allowed in every lane',
    (cmd) => {
      for (const lane of ['express', 'standard', 'full'] as const) {
        expect(sh(lane, cmd)).toMatchObject({ effect: 'allow', rule: 'builtin:cd-cwd' });
      }
    },
  );

  it.each([
    'cd',
    'cd ..',
    'cd -',
    'cd ~',
    'cd /',
    'cd /work',
    'cd /work/repo/sub',
    'cd /work/repo/..',
    'cd /work/other',
    '/bin/cd /work/repo',
    `cd -P ${CWD}`,
    `cd ${CWD} extra`,
    `cd ${CWD}x`,
    'cd $(pwd)',
    `cd ${CWD} > out.txt`,
    `FOO=1 cd ${CWD}`,
    `echo hi | cd ${CWD}`,
  ])('%s is not allowed', (cmd) => {
    expect(sh('express', cmd).effect).not.toBe('allow');
  });

  it('does not lift a floor or any later segment of the chain', () => {
    expect(sh('express', `cd ${CWD} ; git push origin main`).reason).toBe('managed_deny');
    expect(sh('express', `cd ${CWD} && echo hi`).effect).toBe('ask');
    expect(sh('express', `cd ${CWD} ; pwd`).effect).toBe('allow');
    expect(sh('express', `cd ${CWD} ; ls -a`).effect).toBe('allow');
  });

  it('is not lifted for a cwd the policy was not told', () => {
    // evaluateShell without a cwd cannot know the no-op, so it stays an ask.
    expect(sh('express', 'cd /elsewhere').effect).not.toBe('allow');
  });

  it('handles the PowerShell spellings, case-insensitively', () => {
    for (const cmd of [`cd ${CWD}`, `Set-Location ${CWD}`, `SL ${CWD.toUpperCase()}`]) {
      expect(sh('express', cmd, [], 'powershell').effect).toBe('allow');
    }

    expect(sh('express', 'Set-Location ..', [], 'powershell').effect).not.toBe('allow');
    expect(sh('express', `Set-Location -Path ${CWD}`, [], 'powershell').effect).not.toBe(
      'allow',
    );
  });

  it('property: a cd to any directory other than the cwd is never an allow', () => {
    const segment = fc.stringMatching(/^[a-zA-Z0-9_.-]{1,12}$/);
    fc.assert(
      fc.property(fc.array(segment, { minLength: 1, maxLength: 4 }), (parts) => {
        const target = `/${parts.join('/')}`;
        fc.pre(target.replace(/\/+$/, '') !== CWD);
        fc.pre(!parts.every((p) => p === '.'));

        return sh('express', `cd ${target}`).effect !== 'allow';
      }),
      { numRuns: 200 },
    );
  });
});
