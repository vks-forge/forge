/**
 * Scenario: runs that fail, stall or hit a rate limit.
 *
 * Why: a Worker run ends badly all the time (a silent hang, a 429, a crash, a revoked
 *   login). The Director's job is to retry what a retry can fix, at a sensible time and a
 *   bounded number of times, and to hand everything else to a human instead of looping:
 *   Paperclip's re-wake-forever failure is the thing this prevents (director-core.md §3,
 *   execution-plane.md §8). Each family is pinned end to end here, through real run rows,
 *   wakes and tickets; the pure table is pinned separately in domain/failure-policy.
 *
 * Pins: a silent run is cancelled and settled as stall, retried twice then parked;
 *   rate_limit waits until retryNotBefore or backs off exponentially; crash retries once;
 *   auth, refusal and policy_denied park in waiting_human; a retry is a new run with
 *   retry_of; a failed start settles the run; a failed worktree create holds dispatch back.
 * Depends on: helpers/rig, @forge/core (AuthError), vitest.
 */

import { AuthError, HarnessChangedError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

const iso = (ms: number): string => new Date(ms).toISOString();

async function started(rig: Rig): Promise<string> {
  const id = await rig.request('Do a thing');
  await rig.tick();

  return id;
}

async function pendingWakes(rig: Rig) {
  return rig.storage.transaction((tx) =>
    tx.wakeRequests.listDue('9999-12-31T23:59:59.999Z'),
  );
}

describe('stall', () => {
  it('cancels a silent run, settles it as stall, retries twice with the delay, then parks', async () => {
    const rig = await makeRig();
    const id = await started(rig);

    for (const [n, runId] of [
      [1, 'run-1'],
      [2, 'run-2'],
    ] as const) {
      rig.clock.advance(300_001);
      const report = await rig.tick();
      expect(rig.driver.cancels).toContain(runId);
      expect(report.settled[0]).toMatchObject({
        runId,
        status: 'timeout',
        errorFamily: 'stall',
      });

      expect((await rig.ticket(id)).status).toBe('in_progress');
      const wakes = await pendingWakes(rig);
      expect(wakes).toHaveLength(1);
      expect(wakes[0]).toMatchObject({ kind: 'retry', ticket_id: id });
      expect(wakes[0]!.not_before).toBe(iso(rig.clock.now() + 10_000));

      // Not due yet: nothing starts.
      expect((await rig.tick()).dispatched).toEqual([]);
      rig.clock.advance(10_001);
      const next = await rig.tick();
      expect(next.dispatched).toEqual([
        { ticketId: id, runId: `run-${n + 1}`, kind: 'retry' },
      ]);

      const row = await rig.storage.transaction((tx) => tx.runs.get(`run-${n + 1}`));
      expect(row?.retry_of).toBe(runId);
    }

    rig.clock.advance(300_001);
    const last = await rig.tick();
    expect(last.parked).toEqual([
      { ticketId: id, reason: expect.stringMatching(/stall/) },
    ]);

    const t = await rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toMatch(/stall/);
    expect(rig.driver.starts).toHaveLength(3);
  });

  it('does not stall a run that keeps emitting events', async () => {
    const rig = await makeRig();
    await started(rig);
    for (let i = 0; i < 4; i++) {
      rig.clock.advance(200_000);
      rig.driver.emit('run-1', { type: 'text', text: `step ${i}` });
      await rig.flush();
      expect((await rig.tick()).settled).toEqual([]);
    }

    expect(rig.driver.cancels).toEqual([]);
  });
});

describe('rate limit', () => {
  it('waits until the reset time the harness reported', async () => {
    const rig = await makeRig();
    const id = await started(rig);
    const reset = rig.clock.now() + 120_000;
    rig.driver.finish(
      'run-1',
      makeResult({
        status: 'error',
        errorFamily: 'rate_limit',
        retryNotBefore: iso(reset),
      }),
    );

    await rig.flush();
    await rig.tick();
    expect((await pendingWakes(rig))[0]!.not_before).toBe(iso(reset));

    rig.clock.advance(60_000);
    expect((await rig.tick()).dispatched).toEqual([]);
    rig.clock.advance(60_001);
    expect((await rig.tick()).dispatched).toEqual([
      { ticketId: id, runId: 'run-2', kind: 'retry' },
    ]);
  });

  it('backs off exponentially when no reset time is given', async () => {
    const rig = await makeRig();
    await started(rig);
    rig.driver.finish(
      'run-1',
      makeResult({ status: 'error', errorFamily: 'rate_limit' }),
    );

    await rig.flush();
    await rig.tick();
    expect((await pendingWakes(rig))[0]!.not_before).toBe(iso(rig.clock.now() + 60_000));
    rig.clock.advance(60_001);
    await rig.tick();
    rig.driver.finish(
      'run-2',
      makeResult({ status: 'error', errorFamily: 'rate_limit' }),
    );

    await rig.flush();
    await rig.tick();
    expect((await pendingWakes(rig))[0]!.not_before).toBe(iso(rig.clock.now() + 120_000));
  });
});

describe('other families', () => {
  it('retries a crash once, then parks', async () => {
    const rig = await makeRig();
    const id = await started(rig);
    rig.driver.finish('run-1', makeResult({ status: 'error', errorFamily: 'crash' }));
    await rig.flush();
    await rig.tick();
    rig.clock.advance(10_001);
    expect((await rig.tick()).dispatched).toHaveLength(1);
    rig.driver.finish('run-2', makeResult({ status: 'error', errorFamily: 'crash' }));
    await rig.flush();
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('waiting_human');
  });

  it.each(['auth', 'refusal', 'policy_denied', 'budget'] as const)(
    'parks %s in waiting_human without a retry',
    async (family) => {
      const rig = await makeRig();
      const id = await started(rig);
      rig.driver.finish('run-1', makeResult({ status: 'error', errorFamily: family }));
      await rig.flush();
      await rig.tick();
      const t = await rig.ticket(id);
      expect(t.status).toBe('waiting_human');
      expect(t.blocked_reason).toContain(family);
      expect(await pendingWakes(rig)).toEqual([]);
      rig.clock.advance(3_600_000);
      expect((await rig.tick()).dispatched).toEqual([]);
    },
  );

  it('parks a refused run', async () => {
    const rig = await makeRig();
    const id = await started(rig);
    rig.driver.finish('run-1', makeResult({ status: 'refused' }));
    await rig.flush();
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('waiting_human');
  });
});

describe('start failures', () => {
  it('settles the run and follows the family when driver.start throws', async () => {
    const rig = await makeRig();
    const id = await rig.request('x');
    rig.driver.failNextStart(new AuthError('not logged in'));
    const report = await rig.tick();
    expect(report.dispatched).toEqual([]);
    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(run).toMatchObject({ status: 'error', error_family: 'auth' });
    expect(
      await rig.storage.transaction((tx) => tx.runTokens.getHash('run-1')),
    ).toBeNull();

    expect((await rig.ticket(id)).status).toBe('waiting_human');
  });

  it('parks the ticket with harness_changed when the installed build changed under the approvals', async () => {
    const rig = await makeRig();
    const id = await rig.request('x');
    rig.driver.failNextStart(new HarnessChangedError('2.1.0', '2.2.0'));

    await rig.tick();

    const ticket = await rig.ticket(id);
    expect(ticket.status).toBe('waiting_human');
    expect(ticket.blocked_reason).toMatch(/^harness_changed:.*2\.2\.0/);
    expect(await rig.storage.transaction((tx) => tx.runs.get('run-1'))).toMatchObject({
      status: 'error',
      error_family: 'policy_denied',
    });

    // Parked, not retried: another tick starts nothing.
    expect((await rig.tick()).dispatched).toEqual([]);
  });

  it('holds dispatch back after a worktree failure instead of retrying every tick', async () => {
    const rig = await makeRig();
    const id = await rig.request('x');
    rig.worktrees.failCreate = new Error('disk full');
    const first = await rig.tick();
    expect(first.errors[0]?.message).toContain('disk full');
    expect((await rig.ticket(id)).status).toBe('planned');
    const triages = rig.llm.callsTo('dispatch_prompt').length;
    await rig.tick();
    expect(rig.llm.callsTo('dispatch_prompt').length).toBe(triages);

    rig.worktrees.failCreate = null;
    rig.clock.advance(31_000);
    expect((await rig.tick()).dispatched).toHaveLength(1);
  });
});
