/**
 * Scenario: Director steps about a ticket run beside the tick, and the tick applies what they decided.
 *
 * Why: triage, a steering reply, an escalation look and the brief of a Worker run are model calls
 *   of seconds to minutes. Awaited in the tick they kept every other ticket from settling or
 *   starting. They are jobs now (eval fix 5), but ticket state still moves only in the tick, so the
 *   job's answer is applied later and must be dropped when the world moved on, and a Worker run
 *   must never start for a ticket the owner cancelled while its brief was being written.
 *
 * Pins: a Director look at a Worker's question is dropped when the ticket was cancelled meanwhile; a triage answer for a ticket cancelled meanwhile is dropped with no write; a Worker-blocking
 *   steer reply gets the one free Director slot before a triage; a brief holds a Worker slot (the
 *   global limit counts it) without taking a Director slot; a ticket cancelled while its brief is in
 *   flight is not launched and its worktree is removed.
 * Depends on: helpers/hang-step, helpers/rig, @forge/core, vitest.
 */

import { describe, expect, it } from 'vitest';
import { hangStep } from '#tests/helpers/hang-step.js';
import { intake, makeRig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';
import type { Rig } from '#tests/helpers/rig.js';

const setDirector = async (
  rig: Rig,
  director: Record<string, unknown>,
  engine: Record<string, unknown> = {},
) =>
  void (await rig.config.append({
    scope: 'company',
    doc: { director, engine },
    author: 'test',
    reason: 'limit',
    expectedVersion: (await rig.config.company()).version,
  }));

describe('ticket steps beside the tick', () => {
  it('drops a triage answer for a ticket that was cancelled meanwhile', async () => {
    const rig = await makeRig();
    const triage = hangStep(rig, 'triage');
    const id = await rig.request('Fix the doctor check');

    await rig.engine.tick();
    expect(triage.started).toBe(1);

    await rig.engine.cancelTicket(id);
    triage.releaseAll();
    await rig.engine.idle();
    const report = await rig.engine.tick();

    expect(report.triaged).toEqual([]);
    expect((await rig.ticket(id)).status).toBe('cancelled');
    expect(rig.driver.starts).toHaveLength(0);
  });

  it('drops a Director look at a question when the ticket was cancelled meanwhile', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', {
      decision: 'answer',
      answer: 'Use blue.',
      confidence: 0.9,
      grounds: [{ kind: 'decision', ref: 'd-0012' }],
    });

    const look = hangStep(rig, 'ticket_answer');
    const id = await rig.request('Add a flag');
    await rig.tick();
    rig.driver.emit('run-1', {
      type: 'ask',
      interaction_id: 'int-q1',
      kind: 'question',
      prompt: 'Which colour?',
    });

    await rig.storage.transaction((tx) =>
      tx.interactions.insert({
        id: 'int-q1',
        ticket_id: id,
        run_id: 'run-1',
        kind: 'question',
        payload: { prompt: 'Which colour?' },
        status: 'pending',
        asked_at: new Date(rig.clock.now()).toISOString(),
        timeout_at: new Date(rig.clock.now() + 4 * 3_600_000).toISOString(),
      }),
    );

    rig.driver.finish(
      'run-1',
      makeResult({
        status: 'paused',
        pauseReason: 'interaction',
        interactionId: 'int-q1',
        session: 'sess-A',
      }),
    );

    await rig.flush();
    await rig.engine.tick();
    await rig.flush();
    expect(look.started).toBe(1);

    await rig.engine.cancelTicket(id);
    look.releaseAll();
    await rig.engine.idle();
    await rig.engine.tick();

    const row = await rig.storage.transaction((tx) => tx.interactions.get('int-q1'));
    expect(row?.status).not.toBe('answered');
    expect(rig.driver.starts).toHaveLength(1);
    expect((await rig.ticket(id)).status).toBe('cancelled');
  });

  it('serves a Worker-blocking steer reply before a triage when one slot is free', async () => {
    const rig = await makeRig();
    await setDirector(rig, { max_concurrent_steps: 1 });
    const first = await rig.request('first');
    await rig.tick();
    const steer = hangStep(rig, 'steer_reply');
    const triage = hangStep(rig, 'triage');
    await rig.request('second');
    await rig.engine.ingest(
      intake(
        { kind: 'reply', payload: { ticket_id: first, text: 'also update the docs' } },
        rig.clock.now(),
      ),
    );

    await rig.engine.tick();
    await rig.flush();

    expect(steer.started).toBe(1);
    expect(triage.started).toBe(0);

    steer.releaseAll();
    triage.releaseAll();
    await rig.engine.idle();
    await rig.engine.tick();
    await rig.engine.idle();

    expect(triage.started).toBe(1);
  });

  it('holds the Worker slot of a ticket being briefed, and takes no Director slot for it', async () => {
    const workers = { max_concurrent_global: 2, max_concurrent_per_project: 2 };
    const rig = await makeRig({ engine: workers });
    const brief = hangStep(rig, 'dispatch_prompt');
    await rig.request('one');
    await rig.request('two');
    await rig.request('three');
    await rig.engine.tick();
    await rig.engine.idle();
    await setDirector(rig, { max_concurrent_steps: 1 }, workers);

    // This tick applies the three triages and briefs two tickets; the next must not brief a third.
    await rig.engine.tick();
    await rig.engine.tick();
    await rig.flush();

    // Two briefs run although only one Director step is allowed; the third ticket is not picked.
    expect(brief.started).toBe(2);
    expect(rig.driver.starts).toHaveLength(0);

    brief.releaseAll();
    await rig.engine.idle();
    await rig.engine.tick();

    expect(rig.driver.starts).toHaveLength(2);
    expect(brief.started).toBe(2);
  });

  it('does not launch a ticket that was cancelled while its brief was in flight', async () => {
    const rig = await makeRig();
    const brief = hangStep(rig, 'dispatch_prompt');
    const id = await rig.request('Fix the doctor check');
    await rig.engine.tick();
    await rig.engine.idle();
    await rig.engine.tick();
    expect(brief.started).toBe(1);

    await rig.engine.cancelTicket(id);
    brief.releaseAll();
    await rig.engine.idle();
    await rig.engine.tick();

    expect(rig.driver.starts).toHaveLength(0);
    expect((await rig.ticket(id)).status).toBe('cancelled');
    expect(rig.worktrees.removed).toContain(`/repo/.worktrees/${id}`);
  });
});
