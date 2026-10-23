/**
 * Merge door tests: a clash or a moved base is judged again after a merge-in, never refused as policy.
 *
 * Why: the merge door used to throw a policy denial for an unmergeable PR, which parked the ticket
 *   as "not retried automatically" with nothing for a Worker to fix (eval fix 4). A PR that cannot
 *   merge, or whose head never saw the latest base, is work for the sync step: the ticket goes back
 *   to the gates, main is merged into its branch, and only then can it merge. The owner's Approve
 *   meets the same facts (a clash the owner never saw) and must not merge or fail: it sends the ticket
 *   back to verifying as `head_moved`.
 *
 * Pins: an unmergeable PR is gated again and merges once the host says it can (never `policy_denied`,
 *   never a Worker run of its own), a head without the base tip is gated again before the tier-A
 *   merge, a host's late merge refusal (`MergeConflictError`) is gated again, a branch main keeps
 *   moving under parks naming that, and Approve on a conflicted PR merges nothing and answers
 *   `head_moved`.
 * Depends on: helpers/verify-rig, helpers/rig, @forge/core, vitest.
 */

import { MergeConflictError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { drive, makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';
import type { VerifyRig } from '#tests/helpers/verify-rig.js';

/** Ticks until the ticket is done or waiting for a person. */
const settle = (v: VerifyRig, id: string): Promise<void> =>
  drive(v.rig, 12, async () =>
    ['done', 'waiting_human'].includes((await v.rig.ticket(id)).status),
  );

/** Runs `onSync(n)` just before the n-th merge-in answers (1-based), to change what the host says next. */
function onMergeIn(v: VerifyRig, onSync: (n: number) => void): void {
  const original = v.rig.worktrees.mergeIn;
  let n = 0;
  v.rig.worktrees.mergeIn = (path, sha, message) => {
    n += 1;
    onSync(n);

    return original(path, sha, message);
  };
}

describe('merge door: a PR the host calls unmergeable', () => {
  it('is gated again after a merge-in and merges once mergeable, with no policy denial', async () => {
    const v = await makeVerifyRig();
    v.host.mergeable = false;
    onMergeIn(v, (n) => {
      if (n >= 2) {
        v.host.mergeable = true;
      }
    });

    const id = await startAndFinish(v.rig);
    await settle(v, id);

    expect(await v.rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(v.rig.worktrees.merges.length).toBeGreaterThanOrEqual(2);
    expect(v.rig.driver.starts).toHaveLength(1);
    expect(v.host.count('merge')).toBe(1);
  });

  it('parks naming that main kept moving when it never settles, and never merges', async () => {
    const v = await makeVerifyRig();
    v.host.mergeable = false;

    const id = await startAndFinish(v.rig);
    await settle(v, id);

    const t = await v.rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toContain('main kept moving');
    expect(t.blocked_reason).not.toContain('policy_denied');
    expect(v.host.count('merge')).toBe(0);
  });

  it('re-gates a late merge refusal by the host instead of parking it as policy', async () => {
    const v = await makeVerifyRig();
    v.host.failNext('merge', new MergeConflictError('not mergeable'));

    const id = await startAndFinish(v.rig);
    await settle(v, id);

    expect(await v.rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(v.host.count('merge')).toBe(2);
    expect(v.rig.worktrees.merges.length).toBeGreaterThanOrEqual(2);
  });
});

describe('merge door: the base tip must be in the gated head', () => {
  it('gates again before a tier-A merge when the head lacks the base tip', async () => {
    const v = await makeVerifyRig();
    v.rig.worktrees.contained = false;
    onMergeIn(v, (n) => {
      if (n >= 2) {
        v.rig.worktrees.contained = true;
      }
    });

    const id = await startAndFinish(v.rig);
    await settle(v, id);

    expect(await v.rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(v.rig.worktrees.merges.length).toBeGreaterThanOrEqual(2);
    expect(v.host.count('merge')).toBe(1);
  });
});

describe('merge door: the owner approves a PR that now clashes', () => {
  it('merges nothing, answers head_moved and sends the ticket back to verifying', async () => {
    const v = await makeVerifyRig({ tier: 'B' });
    const id = await startAndFinish(v.rig, [{ kind: 'edited', path: 'src/a.ts' }]);
    await v.rig.tick();
    expect((await v.rig.ticket(id)).status).toBe('review');
    v.host.mergeable = false;

    const out = await v.rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    expect(out).toEqual({ status: 'head_moved' });
    expect(v.host.count('merge')).toBe(0);
    expect(await v.rig.ticket(id)).toMatchObject({ status: 'verifying' });
  });
});
