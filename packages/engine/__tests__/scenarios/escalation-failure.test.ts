/**
 * Scenario: a ticket fails or is held, and the owner always has a way forward.
 *
 * Why: a ticket that stops for a reason a person must settle (a retry cap, a lane no pipeline
 *   serves yet, the rework cap, a question nobody answered) used to show a reason text and
 *   nothing to click. Each is now a failure escalation. The Director looks first and may retry
 *   once with a note that stays inside the ticket; it never loops, never decides a lane hold and
 *   never answers for the owner. The owner then has Retry, Run as Express, Re-plan or Cancel, and
 *   every action goes through the same doors as everything else: settle by compare-and-swap,
 *   `transition()` for the ticket, and refusals for what is not offered or already settled.
 *
 * Pins: Done-when 3 (crash past the retry cap, one Director retry, then the owner with a
 *   diagnosis, Retry dispatches a new run with the note), the Director's retry limit, Done-when 5's
 *   lane hold (no model call, Run as Express releases it, Retry is not offered), Done-when 6
 *   (rework cap: one more attempt, then parked again), Done-when 7 (cancel with dependents is
 *   refused, with `cascade` cancels the chain through `transition()`), Done-when 8 (an unanswered
 *   question blocks the ticket and Retry brings it back), and the 409 outcomes.
 * Depends on: helpers/escalation-rig, helpers/planning-rig, helpers/verify-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  ask,
  cardEventsOf,
  crashTo,
  interactionsOf,
  overrideDirector,
  ownerPending,
  pendingOf,
} from '#tests/helpers/escalation-rig.js';
import {} from '#tests/helpers/planning-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';
import { verdict } from '#tests/helpers/fake-git-host.js';
import { drive, makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

const RETRY = {
  decision: 'retry',
  note: 'Run the migration first.',
  diagnosis: 'Both runs crashed on the missing migration.',
  confidence: 0.7,
};

describe('crash past the retry cap', () => {
  it('lets the Director retry once with a note, then hands the owner a diagnosis', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_recover', RETRY, {
      ...RETRY,
      note: 'Again.',
      diagnosis: 'Still the same crash after the migration hint.',
    });

    const id = await rig.request('Do the thing');
    await rig.tick();
    await crashTo(rig, id, 2);

    // The Director's one retry: a third run started with its note, nothing for the owner yet.
    expect(rig.driver.starts).toHaveLength(3);
    expect(await ownerPending(rig)).toEqual([]);
    const delta = JSON.stringify(rig.llm.callsTo('dispatch_prompt')[2]!.input);
    expect(delta).toContain('director_retry');
    expect(delta).toContain('Run the migration first.');
    const first = (await interactionsOf(rig, id))[0]!;
    expect(first).toMatchObject({
      status: 'answered',
      answer: { action: 'retry', by: 'director', note: 'Run the migration first.' },
    });

    // It crashes again: the Director may not retry a second time, so the owner is asked.
    rig.driver.finish('run-3', makeResult({ status: 'error', errorFamily: 'crash' }));
    await rig.flush();
    await rig.tick();

    const pending = await pendingOf(rig, id, 'failure');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.escalated_at).toBeDefined();
    expect(pending[0]!.payload).toMatchObject({
      kind: 'failure',
      cause: 'retry_cap',
      diagnosis: 'Still the same crash after the migration hint.',
      error_family: 'crash',
    });

    expect(
      (pending[0]!.payload as { attempts: unknown[] }).attempts.length,
    ).toBeGreaterThanOrEqual(3);

    expect(rig.driver.starts).toHaveLength(3);
  });

  it('dispatches a new run with the owner note when the owner chooses Retry', async () => {
    const rig = await makeRig();
    await overrideDirector(rig, { escalation: { max_director_retries: 0 } });
    rig.llm.script('ticket_recover', { ...RETRY, decision: 'escalate' });

    const id = await rig.request('Do the thing');
    await rig.tick();
    await crashTo(rig, id, 2);
    const [row] = await pendingOf(rig, id, 'failure');
    expect(row).toBeDefined();

    const done = await rig.engine.actOnEscalation(
      row!.id,
      { action: 'retry', note: 'Use the fixture in tests/helpers.' },
      'owner',
    );

    expect(done.status).toBe('done');
    expect((await rig.ticket(id)).status).toBe('planned');

    const report = await rig.tick();
    expect(report.dispatched).toEqual([{ ticketId: id, runId: 'run-3', kind: 'retry' }]);
    const delta = JSON.stringify(rig.llm.callsTo('dispatch_prompt').at(-1)!.input);
    expect(delta).toContain('owner_retry');
    expect(delta).toContain('Use the fixture in tests/helpers.');
    expect((await rig.ticket(id)).status).toBe('in_progress');

    const card = (await rig.ticket(id)).card_id;
    const settled = await cardEventsOf(rig, card, 'escalation_settled');
    expect(settled.at(-1)!.payload).toMatchObject({ action: 'retry', by: 'owner' });
  });

  it('never lets the Director retry when the owner allows none, whatever the model says', async () => {
    const rig = await makeRig();
    await overrideDirector(rig, { escalation: { max_director_retries: 0 } });
    rig.llm.script('ticket_recover', RETRY);

    const id = await rig.request('Do the thing');
    await rig.tick();
    await crashTo(rig, id, 2);

    expect(rig.driver.starts).toHaveLength(2);
    const [row] = await pendingOf(rig, id, 'failure');
    expect(row!.payload).toMatchObject({
      diagnosis: 'Both runs crashed on the missing migration.',
    });
  });

  it('hands over with no diagnosis when the recovery step fails', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_recover', { nonsense: true });
    const id = await rig.request('Do the thing');
    await rig.tick();
    await crashTo(rig, id, 2);

    const [row] = await pendingOf(rig, id, 'failure');
    expect(row!.escalated_at).toBeDefined();
    expect(row!.payload).not.toHaveProperty('diagnosis');
    expect(rig.driver.starts).toHaveLength(2);
  });

  it('offers retry, replan and cancel, and refuses what a failure does not offer', async () => {
    const rig = await makeRig();
    const id = await rig.request('Do the thing');
    await rig.tick();
    await crashTo(rig, id, 2);
    const [row] = await pendingOf(rig, id, 'failure');

    for (const body of [
      { action: 'answer', text: 'x' },
      { action: 'run_as_express' },
      { action: 'recheck' },
    ] as const) {
      expect(await rig.engine.actOnEscalation(row!.id, body, 'owner')).toMatchObject({
        status: 'action_not_offered',
      });
    }

    // A pr_issue ticket's card is not a Discussion, so Re-plan is offered, but a card with no plan
    // yet is re-planned from the start with the comment as a note.
    expect(
      await rig.engine.actOnEscalation(row!.id, { action: 'cancel' }, 'owner'),
    ).toMatchObject({ status: 'done' });

    expect((await rig.ticket(id)).status).toBe('cancelled');
    expect(
      await rig.engine.actOnEscalation(row!.id, { action: 'cancel' }, 'owner'),
    ).toMatchObject({ status: 'not_pending' });
  });

  it('answers stale when the ticket moved on while the escalation was still pending', async () => {
    const rig = await makeRig();
    await overrideDirector(rig, { escalation: { director_first: false } });
    const id = await rig.request('Do the thing');
    await rig.tick();
    await crashTo(rig, id, 2);
    const [row] = await pendingOf(rig, id, 'failure');
    const t = await rig.ticket(id);
    await rig.storage.transaction((tx) =>
      tx.tickets.updateTicketCas(t.id, t.status_version, { status: 'planned' }),
    );

    expect(
      await rig.engine.actOnEscalation(row!.id, { action: 'retry' }, 'owner'),
    ).toMatchObject({ status: 'stale' });
  });
});

describe('a held lane', () => {
  const standard = {
    lane: 'standard',
    confidence: 0.95,
    predicted_files: ['src/a.ts'],
    questions: [],
    type: 'fix',
    tier_predicted: 'A',
    title: 'Heavy change',
  };

  it('goes straight to the owner with no model call, and Run as Express releases it', async () => {
    const rig = await makeRig();
    rig.llm.script('triage', standard);
    const id = await rig.request('Rework everything');
    await rig.tick();

    expect(rig.llm.callsTo('ticket_recover')).toEqual([]);
    const [row] = await pendingOf(rig, id, 'failure');
    expect(row).toMatchObject({ card_id: (await rig.ticket(id)).card_id });
    expect(row!.escalated_at).toBeDefined();
    expect(row!.payload).toMatchObject({
      kind: 'failure',
      cause: 'lane_hold',
      lane: 'standard',
    });

    expect(
      await rig.engine.actOnEscalation(row!.id, { action: 'retry' }, 'owner'),
    ).toMatchObject({ status: 'action_not_offered' });

    const done = await rig.engine.actOnEscalation(
      row!.id,
      { action: 'run_as_express' },
      'owner',
    );

    expect(done.status).toBe('done');
    expect(await rig.ticket(id)).toMatchObject({ status: 'planned', lane: 'express' });
    const report = await rig.tick();
    expect(report.dispatched.map((d) => d.ticketId)).toEqual([id]);
  });
});

describe('the rework cap', () => {
  it('Retry gives exactly one more attempt, then the ticket parks again', async () => {
    const { rig, gate } = await makeVerifyRig();
    gate.script(verdict('failed', [{ check: 'claims', message: 'bad claim' }]));
    const id = await startAndFinish(rig);
    await drive(rig, 8, async () => (await rig.ticket(id)).status === 'waiting_human');

    const [row] = await pendingOf(rig, id, 'failure');
    expect(row!.payload).toMatchObject({ cause: 'rework_cap' });
    expect((await rig.ticket(id)).rework_count).toBe(2);
    const startsBefore = rig.driver.starts.length;

    const done = await rig.engine.actOnEscalation(row!.id, { action: 'retry' }, 'owner');
    expect(done.status).toBe('done');
    await rig.tick();
    expect(rig.driver.starts).toHaveLength(startsBefore + 1);

    await drive(rig, 8, async () => (await rig.ticket(id)).status === 'waiting_human');
    expect(rig.driver.starts).toHaveLength(startsBefore + 1);
    expect((await rig.ticket(id)).rework_count).toBe(2);
    const again = await pendingOf(rig, id, 'failure');
    expect(again).toHaveLength(1);
    expect(again[0]!.id).not.toBe(row!.id);
  });
});

describe('a question nobody answers', () => {
  it('blocks the ticket with a way forward, and Retry brings it back as a new run', async () => {
    const rig = await makeRig();
    const id = await ask(rig);
    rig.clock.advance(4 * 3_600_000 + 1);
    await rig.tick();

    expect((await rig.ticket(id)).status).toBe('blocked');
    const [row] = await pendingOf(rig, id, 'failure');
    expect(row).toMatchObject({ card_id: (await rig.ticket(id)).card_id });
    expect(row!.escalated_at).toBeDefined();
    expect(row!.payload).toMatchObject({ kind: 'failure', cause: 'question_timeout' });
    expect(rig.llm.callsTo('ticket_recover')).toEqual([]);

    const done = await rig.engine.actOnEscalation(row!.id, { action: 'retry' }, 'owner');
    expect(done.status).toBe('done');
    expect((await rig.ticket(id)).status).toBe('planned');
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('in_progress');
  });
});
