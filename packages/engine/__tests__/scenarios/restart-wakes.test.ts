/**
 * Scenario: server restart, wake idempotency, the re-wake cap and the invariant check.
 *
 * Why: these are the Director's guards against silent loss and runaway loops. After a
 *   restart every run the old server left behind is either resumed from its harness session
 *   (resume-restart.test.ts, d-0092) or, with no session to resume from, dead: reconcile must
 *   crash-settle it, revoke its token and queue a retry instead of leaving tickets assigned to
 *   nothing. Wakes must be idempotent, a ticket may
 *   get at most 3 recovery wakes an hour, and a run that reported done is never re-woken
 *   (director-core.md §3). When the engine cannot explain why an open ticket is idle it
 *   must say so, not guess.
 *
 * Pins: restart crash-settles foreign runs that never reported a session, revokes tokens, queues a retry wake, and the
 *   new owner's retry is a new run with retry_of; own runs are untouched; duplicate wakes
 *   coalesce; the 4th recovery wake in an hour parks the ticket; a stray wake for a ticket
 *   whose run succeeded starts nothing; violations are returned, logged and left alone.
 * Depends on: helpers/rig, src/tick/wakes, vitest.
 */

import type { Ticket } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { requestWake } from '#/tick/wakes.js';
import { makeRig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

const FAR = '9999-12-31T23:59:59.999Z';

describe('restart reconcile of a run with no session', () => {
  it('crash-settles runs owned by a previous server, revokes tokens and retries under the new owner', async () => {
    const rig = await makeRig();
    const id = await rig.request('x');
    await rig.tick();
    expect(
      await rig.storage.transaction((tx) => tx.runTokens.getHash('run-1')),
    ).not.toBeNull();

    const b = rig.restart('srv-b');
    const first = await b.tick();

    expect(first.firstTick).toBe(true);
    expect(first.crashed).toEqual(['run-1']);
    const dead = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(dead).toMatchObject({ status: 'error', error_family: 'crash' });
    expect(dead?.ended_at).toBeDefined();
    expect(
      await rig.storage.transaction((tx) => tx.runTokens.getHash('run-1')),
    ).toBeNull();

    expect((await rig.ticket(id)).status).toBe('in_progress');
    const wakes = await rig.storage.transaction((tx) => tx.wakeRequests.listDue(FAR));
    expect(wakes).toEqual([expect.objectContaining({ kind: 'retry', ticket_id: id })]);

    rig.clock.advance(10_001);
    const second = await rig.tickOn(b);
    expect(second.firstTick).toBe(false);
    expect(second.crashed).toEqual([]);
    expect(second.dispatched).toEqual([{ ticketId: id, runId: 'run-2', kind: 'retry' }]);
    const next = await rig.storage.transaction((tx) => tx.runs.get('run-2'));
    expect(next).toMatchObject({ owner: 'srv-b', retry_of: 'run-1' });
  });

  it('does not crash-settle runs the same server owns', async () => {
    const rig = await makeRig();
    await rig.request('x');
    await rig.tick();
    const report = await rig.tick();
    expect(report.crashed).toEqual([]);
    expect((await rig.storage.transaction((tx) => tx.runs.get('run-1')))?.status).toBe(
      'running',
    );
  });
});

describe('wakes', () => {
  it('coalesces a duplicate (ticket, reason, key) instead of inserting', async () => {
    const rig = await makeRig();
    const id = await rig.request('x');
    const input = { ticketId: id, kind: 'retry', reason: 'crash', key: 'k1' } as const;
    const a = await requestWake(rig.deps, input);
    const b = await requestWake(rig.deps, input);
    expect(a).toMatchObject({ created: true });
    expect(b).toMatchObject({ created: false });
    const wakes = await rig.storage.transaction((tx) => tx.wakeRequests.listDue(FAR));
    expect(wakes).toHaveLength(1);
    expect(wakes[0]!.coalesced_count).toBe(1);
  });

  it('allows 3 recovery wakes an hour and parks the ticket on the 4th', async () => {
    const rig = await makeRig({
      engine: {
        retry: {
          rate_limit: { base_ms: 1000, max_ms: 8000, max_attempts: 9 },
          crash: { delay_ms: 1000, max_attempts: 9 },
          stall: { delay_ms: 1000, max_attempts: 9 },
          unknown: { delay_ms: 1000, max_attempts: 9 },
        },
      },
    });

    const id = await rig.request('x');
    await rig.tick();
    for (let n = 1; n <= 3; n++) {
      rig.driver.finish(
        `run-${n}`,
        makeResult({ status: 'error', errorFamily: 'rate_limit' }),
      );

      await rig.flush();
      await rig.tick();
      rig.clock.advance(70_000);
      const r = await rig.tick();
      expect(r.dispatched).toHaveLength(1);
    }

    rig.driver.finish(
      'run-4',
      makeResult({ status: 'error', errorFamily: 'rate_limit' }),
    );

    await rig.flush();
    const report = await rig.tick();
    expect(report.parked).toEqual([
      { ticketId: id, reason: expect.stringMatching(/re-wake cap/) },
    ]);

    expect((await rig.ticket(id)).status).toBe('waiting_human');
  });

  it('never re-wakes a ticket whose run reported done', async () => {
    const rig = await makeRig();
    const id = await rig.request('x');
    await rig.tick();
    rig.driver.finish('run-1', makeResult());
    await rig.flush();
    // A stray recovery wake arrives before the engine has seen the result.
    await requestWake(rig.deps, {
      ticketId: id,
      kind: 'retry',
      reason: 'stray',
      key: 'late',
    });

    const report = await rig.tick();
    expect((await rig.ticket(id)).status).toBe('verifying');
    expect(report.dispatched).toEqual([]);
    expect(rig.driver.starts).toHaveLength(1);
    expect(await rig.storage.transaction((tx) => tx.wakeRequests.listDue(FAR))).toEqual(
      [],
    );
  });
});

describe('invariant check', () => {
  it('returns and logs a violation for an in_progress ticket with nothing to wait for, and leaves it alone', async () => {
    const rig = await makeRig();
    const now = new Date(rig.clock.now()).toISOString();
    const orphan: Ticket = {
      id: 'FG-9' as Ticket['id'],
      project: 'forge',
      title: 'orphan',
      body: 'b',
      type: 'fix',
      lane: 'express',
      tier_predicted: 'A',
      status: 'in_progress',
      status_version: 3,
      rework_count: 0,
      priority: 0,
      created_at: now,
      updated_at: now,
      blocked_by: [],
    };

    await rig.storage.transaction((tx) => tx.tickets.insert(orphan));

    const report = await rig.tick();

    expect(report.violations).toEqual([
      expect.objectContaining({
        ticketId: 'FG-9',
        rule: 'in_progress_without_reason_to_wait',
      }),
    ]);

    expect(
      rig.logs.some((l) => l.level === 'error' && l.message.includes('invariant')),
    ).toBe(true);

    const after = await rig.ticket('FG-9');
    expect(after.status).toBe('in_progress');
    expect(after.status_version).toBe(3);
    expect(report.dispatched).toEqual([]);
    expect(rig.driver.starts).toEqual([]);
  });

  it('reports no violation when tickets have a live run, a wake or an interaction', async () => {
    const rig = await makeRig();
    await rig.request('x');
    const report = await rig.tick();
    expect(report.violations).toEqual([]);
  });
});
