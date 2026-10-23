/**
 * Scenario: clocks and reports that outlive a slow Director step.
 *
 * Why: a tick's clock was frozen at its start, but the Director's brief for a Worker can take
 *   minutes. A run stamped with the tick's start looked silent for longer than `stall_ms` the moment
 *   the next tick scanned it, and was killed seconds after it began (eval FR-C7); a ticket moved with
 *   that stale stamp showed `updated_at` before `created_at`. And a Director job reports after the
 *   tick that started it has returned: if the next tick dropped that report, a rejected step would
 *   vanish from the control room.
 *
 * Pins: a run's `started_at` and `last_event_at` are the spawn time after a five minute brief, the
 *   ticket moves with it, and the next stall scan leaves the run alone; a rejected step inside a job
 *   shows in the next tick's report and not in the one that started it.
 * Depends on: helpers/card-chat, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { C1, discussion, say } from '#tests/helpers/card-chat.js';
import { makeRig } from '#tests/helpers/rig.js';

const FIVE_MINUTES = 5 * 60 * 1000;

describe('clocks across a slow Director step', () => {
  it('stamps the run with the spawn time and keeps the ticket monotonic after a long brief', async () => {
    const rig = await makeRig();
    const id = await rig.request('Fix the doctor check');
    rig.llm.during('dispatch_prompt', async () => rig.clock.advance(FIVE_MINUTES));
    const tickStart = rig.clock.now();

    await rig.tick();

    const spawn = new Date(rig.clock.now()).toISOString();
    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(rig.clock.now() - tickStart).toBe(FIVE_MINUTES);
    expect(run?.started_at).toBe(spawn);
    expect(run?.last_event_at).toBe(spawn);

    const ticket = await rig.ticket(id);
    expect(ticket.status).toBe('in_progress');
    expect(ticket.updated_at >= ticket.created_at).toBe(true);
    expect(ticket.updated_at).toBe(spawn);
  });

  it('does not stall-kill a run that started after a long brief', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    rig.llm.during('dispatch_prompt', async () => rig.clock.advance(FIVE_MINUTES));
    await rig.tick();

    rig.clock.advance(10_000);
    await rig.tick();

    expect(rig.driver.cancels).toEqual([]);
    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(run?.status).toBe('running');
  });
});

describe('job reports', () => {
  it('shows a step rejected inside a job in the next tick report', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.script('card_chat', { reply: '', actions: [] });
    await say(rig);

    const started = await rig.engine.tick();
    await rig.engine.idle();
    const next = await rig.engine.tick();

    expect(started.rejectedSteps).toEqual([]);
    expect(next.rejectedSteps).toEqual([
      expect.objectContaining({ step: 'card_chat', ticketId: 'FG-C1' }),
    ]);
  });

  it('keeps a thrown model failure on its card: a note for the owner, no error in the tick report', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.during('card_chat', () => Promise.reject(new Error('model process crashed')));

    await rig.engine.tick();
    await rig.engine.idle();
    const next = await rig.engine.tick();

    const history = await rig.storage.transaction((tx) =>
      tx.cardEvents.list(C1, { limit: 20 }),
    );

    expect(next.errors).toEqual([]);
    expect(history.map((e) => e.kind)).toContain('note');
    expect(rig.engine.cardDirector('FG-C1')).toMatchObject({ state: 'error' });
  });
});
