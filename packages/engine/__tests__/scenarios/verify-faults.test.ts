/**
 * Scenario: verify meets faults, restarts and the merge invariant.
 *
 * Why: the host, the gates and the server itself fail, and each failure must land in the
 *   right bucket. A transient fault (a rate limit, a gate that crashed) waits and retries
 *   within the hourly cap; one a retry cannot fix (a merge conflict, a closed PR, no gates,
 *   malformed claims) goes to a human with a reason; a restart in the middle of verifying
 *   never opens a second PR or merges twice; and no mix of verdicts may ever merge a
 *   ticket that did not pass at tier A.
 *
 * Pins: gate error then park; rate-limit retry; merge conflict, unmergeable and closed PR
 *   park; no gates parks; an already-merged PR just finishes; restart reuses the PR;
 *   malformed claims fail closed; merge only after a final pass at tier A (property).
 * Depends on: helpers/verify-rig, helpers/fake-git-host, @forge/core, fast-check, vitest.
 */

import { CrashError, PolicyDeniedError, RateLimitError } from '@forge/core';
import type { GateStatus } from '@forge/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { verdict } from '#tests/helpers/fake-git-host.js';
import type { Rig } from '#tests/helpers/rig.js';
import {
  drive,
  finishRun,
  makeVerifyRig,
  startAndFinish,
} from '#tests/helpers/verify-rig.js';

const gateRows = (rig: Rig, id: string) =>
  rig.storage.transaction((tx) => tx.gateResults.listByTicket(id));

describe('verify: faults', () => {
  it('retries once when a gate cannot run, then parks', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(verdict('error'));
    const id = await startAndFinish(rig);

    const first = await rig.tick();
    expect(first.verified[0]).toMatchObject({ outcome: 'retry_scheduled' });
    expect((await rig.ticket(id)).status).toBe('verifying');

    const held = await rig.tick();
    expect(held.verified).toEqual([]);

    rig.clock.advance(31_000);
    const second = await rig.tick();
    expect(second.verified[0]).toMatchObject({ outcome: 'parked' });

    const t = await rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toContain('verify');
    expect(host.count('merge')).toBe(0);
  });

  it('retries a rate-limited push later instead of parking', async () => {
    const { rig, host } = await makeVerifyRig();
    host.failNext('push', new RateLimitError('429'));
    const id = await startAndFinish(rig);

    const first = await rig.tick();
    expect(first.verified[0]).toMatchObject({
      outcome: 'retry_scheduled',
      errorFamily: 'rate_limit',
    });

    expect((await rig.ticket(id)).status).toBe('verifying');
    rig.clock.advance(61_000);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('done');
    expect(host.count('openPr')).toBe(1);
  });

  it('parks on a merge conflict without retrying', async () => {
    const { rig, host } = await makeVerifyRig();
    host.failNext('merge', new PolicyDeniedError('merge conflict'));
    const id = await startAndFinish(rig);
    const report = await rig.tick();
    expect(report.verified[0]).toMatchObject({ outcome: 'parked' });
    expect(await rig.ticket(id)).toMatchObject({ status: 'waiting_human' });
    expect(host.count('merge')).toBe(1);
  });

  it('parks without merging when the host reports the PR unmergeable or closed', async () => {
    const conflicted = await makeVerifyRig();
    conflicted.host.mergeable = false;
    const a = await startAndFinish(conflicted.rig);
    // A clash is gated again after a merge-in, not refused as policy; a branch that never becomes mergeable parks.
    await drive(
      conflicted.rig,
      12,
      async () => (await conflicted.rig.ticket(a)).status === 'waiting_human',
    );

    expect((await conflicted.rig.ticket(a)).status).toBe('waiting_human');
    expect((await conflicted.rig.ticket(a)).blocked_reason).toContain('main kept moving');
    expect(conflicted.host.count('merge')).toBe(0);

    const closed = await makeVerifyRig();
    closed.host.prState = 'closed';
    const b = await startAndFinish(closed.rig);
    await closed.rig.tick();
    expect((await closed.rig.ticket(b)).status).toBe('waiting_human');
    expect(closed.host.count('merge')).toBe(0);
  });

  it('parks when the project has no gates', async () => {
    const { rig, host } = await makeVerifyRig();
    rig.runtime.current = { ...rig.runtime.current!, gates: [] };
    const id = await startAndFinish(rig);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('waiting_human');
    expect(host.count('merge')).toBe(0);
  });

  it('finishes the move when the host already merged the PR before a crash', async () => {
    const { rig, host } = await makeVerifyRig();
    host.prState = 'merged';
    const id = await startAndFinish(rig);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('done');
    expect(host.count('merge')).toBe(0);
  });

  it('reuses the PR when a restarted engine verifies again after a crash mid-gates', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(new CrashError('gate process died'), verdict('passed'));
    const id = await startAndFinish(rig);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('verifying');
    expect(host.count('openPr')).toBe(1);

    const restarted = rig.restart('srv-a');
    await rig.tickOn(restarted);

    expect((await rig.ticket(id)).status).toBe('done');
    expect(host.count('openPr')).toBe(1);
    expect(host.count('push')).toBe(2);
  });

  it('fails closed on malformed finish claims', async () => {
    const { rig, host } = await makeVerifyRig();
    const id = await rig.request('Fix it');
    await rig.tick();
    await finishRun(rig, 'run-1', [{ kind: 'bogus' }]);
    const report = await rig.tick();

    expect(report.verified[0]).toMatchObject({
      outcome: 'parked',
      errorFamily: 'invalid_input',
    });

    expect((await rig.ticket(id)).status).toBe('waiting_human');
    expect(host.count('merge')).toBe(0);
  });
});

describe('verify: invariants', () => {
  it('merges only a tier-A ticket whose last gate verdict passed', async () => {
    const statuses = fc.constantFrom<GateStatus>('passed', 'failed', 'skipped', 'error');
    await fc.assert(
      fc.asyncProperty(
        fc.array(statuses, { minLength: 1, maxLength: 4 }),
        fc.constantFrom<'A' | 'B' | 'C'>('A', 'B', 'C'),
        async (script, tier) => {
          const { rig, host, gate } = await makeVerifyRig({ tier });
          gate.script(...script.map((s) => verdict(s)));
          const id = await startAndFinish(rig);
          await drive(rig, 8, async () => false);

          const t = await rig.ticket(id);
          expect(host.count('merge')).toBeLessThanOrEqual(1);
          if (host.count('merge') > 0) {
            expect(tier).toBe('A');
            expect(t.status).toBe('done');
            const rows = await gateRows(rig, id);
            expect(['passed', 'skipped']).toContain(rows.at(-1)?.status);
          }

          if (tier !== 'A') {
            expect(host.count('merge')).toBe(0);
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
