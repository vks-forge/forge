/**
 * Scenario: a run ends on a login or a denied tool, and the owner fixes it outside the ticket.
 *
 * Why: a retry fails the same way when the cause is a signed-out harness or a tool Forge does
 *   not allow yet, so those parks are setup escalations for the owner (never the Director: it must
 *   not approve a tool or a login), with no model call. When the owner has fixed the cause the
 *   ticket resumes by itself, or on "I fixed it, check again", which answers honestly: still
 *   broken is a refusal in words, not a silent retry.
 *
 * Pins: Done-when 4 (auth: setup, no model call, harness test passes later: automatic resume by
 *   `auto`), a denied tool read from the run's receipts (schema approval resumes it), recheck
 *   `still_broken` then fixed, a harness build that changed, and the backfill of tickets parked
 *   before escalations (Done-when 5: a held lane gets its lane hold, idempotent).
 * Depends on: helpers/escalation-rig, helpers/rig, vitest.
 */

import { HarnessChangedError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { cardEventsOf, pendingOf } from '#tests/helpers/escalation-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

const iso = (ms: number): string => new Date(ms).toISOString();

async function signedOutHarness(rig: Rig, status: 'error' | 'ok', at?: number) {
  await rig.storage.transaction((tx) =>
    tx.harnesses.upsert({
      id: 'scripted',
      kind: 'claude',
      auth_mode: 'login',
      status,
      ...(at === undefined ? {} : { last_checked_at: iso(at) }),
    }),
  );
}

async function startedTicket(rig: Rig): Promise<string> {
  const id = await rig.request('Do the thing');
  await rig.tick();

  return id;
}

describe('a login failure', () => {
  it('raises a setup with no model call and resumes by itself once the harness tests ok', async () => {
    const rig = await makeRig();
    await signedOutHarness(rig, 'error');
    const id = await startedTicket(rig);
    rig.driver.finish('run-1', makeResult({ status: 'error', errorFamily: 'auth' }));
    await rig.flush();
    await rig.tick();

    expect(rig.llm.callsTo('ticket_recover')).toEqual([]);
    const [row] = await pendingOf(rig, id, 'setup');
    expect(row!.escalated_at).toBeDefined();
    expect(row!.payload).toMatchObject({
      kind: 'setup',
      cause: { type: 'login', harness_id: 'scripted' },
      fix_href: '/settings/harnesses/scripted',
    });

    // Not fixed yet: nothing happens, however many ticks pass.
    rig.clock.advance(60_000);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('waiting_human');

    // The owner signs in and the harness test passes after the escalation was raised.
    rig.clock.advance(60_000);
    await signedOutHarness(rig, 'ok', rig.clock.now());
    await rig.tick();

    expect(rig.driver.starts).toHaveLength(2);
    expect((await rig.ticket(id)).status).toBe('in_progress');
    const settled = await cardEventsOf(
      rig,
      (await rig.ticket(id)).card_id,
      'escalation_settled',
    );

    expect(settled.at(-1)!.payload).toMatchObject({ action: 'recheck', by: 'auto' });
  });

  it('is not fixed by an ok test that predates the escalation, and recheck says so', async () => {
    const rig = await makeRig();
    await signedOutHarness(rig, 'ok', rig.clock.now() - 3_600_000);
    const id = await startedTicket(rig);
    rig.driver.finish('run-1', makeResult({ status: 'error', errorFamily: 'auth' }));
    await rig.flush();
    await rig.tick();
    await rig.tick();

    expect((await rig.ticket(id)).status).toBe('waiting_human');
    const [row] = await pendingOf(rig, id, 'setup');

    const out = await rig.engine.actOnEscalation(row!.id, { action: 'recheck' }, 'owner');
    expect(out).toMatchObject({ status: 'still_broken' });
    expect(out.status === 'still_broken' && out.detail).toContain('scripted');

    rig.clock.advance(1000);
    await signedOutHarness(rig, 'ok', rig.clock.now());
    // The recheck wins the race against the next tick's automatic resume.
    expect(
      await rig.engine.actOnEscalation(row!.id, { action: 'recheck' }, 'owner'),
    ).toMatchObject({ status: 'done' });

    expect((await rig.ticket(id)).status).toBe('planned');
  });
});

describe('a denied tool', () => {
  it('reads the tool from the receipts and resumes once its schema is approved', async () => {
    const rig = await makeRig();
    const id = await startedTicket(rig);
    rig.receipts.setReceipts('run-1', [
      {
        kind: 'decision',
        tool: 'webfetch',
        reason: 'schema_pending',
        decision: 'deny',
        version: '2.1.0',
      },
    ]);

    rig.driver.finish(
      'run-1',
      makeResult({ status: 'error', errorFamily: 'policy_denied' }),
    );

    await rig.flush();
    await rig.tick();

    const [row] = await pendingOf(rig, id, 'setup');
    expect(row!.payload).toMatchObject({
      kind: 'setup',
      cause: {
        type: 'tool',
        tool: 'webfetch',
        harness_kind: 'claude',
        version: '2.1.0',
        reason_code: 'schema_pending',
      },
      fix_href: '/settings/harnesses/scripted#tools',
    });

    await rig.storage.transaction((tx) =>
      tx.harnessToolSchemas.upsert({
        harness_kind: 'claude',
        version: '2.1.0',
        tool: 'webfetch',
        schema_hash: `sha256:${'a'.repeat(64)}`,
        status: 'approved',
      }),
    );

    await rig.tick();
    expect(rig.driver.starts).toHaveLength(2);
  });

  it('is an ordinary failure when the denial is policy working as intended', async () => {
    const rig = await makeRig();
    const id = await startedTicket(rig);
    rig.receipts.setReceipts('run-1', [
      {
        kind: 'decision',
        tool: 'shell',
        reason: 'rule_deny',
        decision: 'deny',
        version: null,
      },
    ]);

    rig.driver.finish(
      'run-1',
      makeResult({ status: 'error', errorFamily: 'policy_denied' }),
    );

    await rig.flush();
    await rig.tick();

    expect(await pendingOf(rig, id, 'setup')).toEqual([]);
    expect(await pendingOf(rig, id, 'failure')).toHaveLength(1);
  });
});

describe('a harness build that changed', () => {
  it('raises a setup for the build, resumed when its compatibility check passes', async () => {
    const rig = await makeRig();
    const id = await rig.request('Do the thing');
    rig.driver.failNextStart(new HarnessChangedError('2.1.0', '2.1.1'));
    await rig.tick();

    const [row] = await pendingOf(rig, id, 'setup');
    expect(row!.payload).toMatchObject({
      cause: { type: 'harness_build', harness_kind: 'claude', version: '2.1.1' },
    });

    await rig.storage.transaction((tx) =>
      tx.harnessVersions.upsert({ kind: 'claude', version: '2.1.1', compat: 'pass' }),
    );

    await rig.tick();
    expect(rig.driver.starts.length).toBeGreaterThanOrEqual(1);
    expect((await rig.ticket(id)).status).toBe('in_progress');
  });
});

describe('the start-up sweep', () => {
  async function parkedBefore(reason: string, status: 'waiting_human' | 'blocked') {
    const rig = await makeRig();
    const id = await rig.request('Old ticket');
    // The state an old database holds: waiting, a reason text, no interaction.
    const t = await rig.ticket(id);
    await rig.storage.transaction((tx) =>
      tx.tickets.updateTicketCas(t.id, t.status_version, {
        status,
        blocked_reason: reason,
      }),
    );

    await rig.tick();

    return { rig, id };
  }

  it('gives a DCP-1 held ticket a lane hold, and Run as Express releases it', async () => {
    const { rig, id } = await parkedBefore(
      'lane not enabled in M0: triage chose standard',
      'waiting_human',
    );

    const [row] = await pendingOf(rig, id, 'failure');
    expect(row!.payload).toMatchObject({ cause: 'lane_hold' });
    expect(row!.escalated_at).toBeDefined();
    expect((await rig.engine.runAsExpress(id, 'owner')).status).toBe('released');
    expect(await rig.ticket(id)).toMatchObject({ status: 'planned', lane: 'express' });
  });

  it('is idempotent across ticks and restarts, and covers blocked tickets', async () => {
    const { rig, id } = await parkedBefore(
      'question timed out unanswered (int-9)',
      'blocked',
    );

    expect(await pendingOf(rig, id, 'failure')).toHaveLength(1);
    await rig.tickOn(rig.restart('srv-c'));
    await rig.tick();

    const all = await pendingOf(rig, id, 'failure');
    expect(all).toHaveLength(1);
    expect(all[0]!.payload).toMatchObject({ cause: 'question_timeout' });
  });
});
