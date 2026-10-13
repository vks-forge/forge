/**
 * Scenario: a Worker asks a human, the ticket waits, the answer resumes it as a new run.
 *
 * Why: a Worker must never sit stalled on a question (director-core.md §8). It pauses,
 *   the ticket parks in WaitingHuman with the interaction as the durable reason, and when
 *   the human answers, the engine starts a NEW run row (a run with `ended_at` is never
 *   reopened, d-0055 / director-core.md §3) that continues the harness session and names the
 *   run it continues in `retry_of`. A question that times out must not leave the ticket
 *   waiting forever, and an answer must be accepted exactly once.
 *
 * Pins: paused result -> asked -> waiting_human; answer is a CAS (second answer refused);
 *   response wake -> answered -> new run with retry_of, session resume and the answer in the
 *   prompt step's wake delta; a missing interaction row is created from the pause; timed-out
 *   interactions block the ticket; a chat reply answers the single pending interaction.
 * Depends on: helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { intake, makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

async function pausedTicket(rig: Rig, insertInteraction = true): Promise<string> {
  const id = await rig.request('Add a flag');
  await rig.tick();
  rig.driver.emit('run-1', {
    type: 'ask',
    interaction_id: 'int-q1',
    kind: 'question',
    prompt: 'Which colour?',
  });
  if (insertInteraction)
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
  return id;
}

describe('pause and resume', () => {
  it('parks the ticket in waiting_human on a paused result and keeps the run row evidence', async () => {
    const rig = await makeRig();
    const id = await pausedTicket(rig);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('waiting_human');
    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(run).toMatchObject({ status: 'settled', session_ref: 'sess-A' });
    expect(run?.ended_at).toBeDefined();
    expect(
      await rig.storage.transaction((tx) => tx.runTokens.getHash('run-1')),
    ).toBeNull();
  });

  it('creates the interaction from the pause when the Worker side did not write it', async () => {
    const rig = await makeRig();
    const id = await pausedTicket(rig, false);
    await rig.tick();
    const pending = await rig.storage.transaction((tx) => tx.interactions.listPending());
    expect(pending).toEqual([
      expect.objectContaining({
        id: 'int-q1',
        ticket_id: id,
        run_id: 'run-1',
        status: 'pending',
      }),
    ]);
  });

  it('answer is accepted once, then resumes as a new run that continues the session', async () => {
    const rig = await makeRig();
    const id = await pausedTicket(rig);
    await rig.tick();

    expect(await rig.engine.answerInteraction('int-q1', 'blue')).toBe(true);
    expect(await rig.engine.answerInteraction('int-q1', 'red')).toBe(false);

    const report = await rig.tick();
    expect(report.dispatched).toEqual([{ ticketId: id, runId: 'run-2', kind: 'resume' }]);
    expect((await rig.ticket(id)).status).toBe('in_progress');
    expect((await rig.ticket(id)).assignee_run_id).toBe('run-2');
    const second = await rig.storage.transaction((tx) => tx.runs.get('run-2'));
    expect(second).toMatchObject({ retry_of: 'run-1', status: 'running' });
    const first = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(first?.status).toBe('settled');
    expect(rig.driver.starts[1]).toMatchObject({ runId: 'run-2', resume: 'sess-A' });
    const delta = JSON.stringify(rig.llm.callsTo('dispatch_prompt')[1]!.input);
    expect(delta).toContain('blue');
    expect(delta).toContain('response_wake');
    // The same worktree is reused; no second one is created.
    expect(rig.worktrees.created).toHaveLength(1);
  });

  it('starts fresh with the handoff when the driver cannot resume', async () => {
    const rig = await makeRig();
    rig.driver.setCanResume(false);
    const id = await pausedTicket(rig);
    await rig.tick();
    await rig.engine.answerInteraction('int-q1', 'blue');
    await rig.tick();
    expect(rig.driver.starts[1]!.resume).toBeUndefined();
    expect((await rig.ticket(id)).status).toBe('in_progress');
  });

  it('blocks the ticket when the question times out unanswered', async () => {
    const rig = await makeRig();
    const id = await pausedTicket(rig);
    await rig.tick();
    rig.clock.advance(4 * 3_600_000 + 1);
    await rig.tick();
    const t = await rig.ticket(id);
    expect(t.status).toBe('blocked');
    expect(t.blocked_reason).toMatch(/timed out/);
    const pending = await rig.storage.transaction((tx) => tx.interactions.listPending());
    expect(pending).toEqual([]);
  });

  it('treats a chat reply to a waiting ticket as the answer to its one pending question', async () => {
    const rig = await makeRig();
    const id = await pausedTicket(rig);
    await rig.tick();
    const r = await rig.engine.ingest(
      intake(
        { kind: 'reply', payload: { ticket_id: id, text: 'green please' } },
        rig.clock.now(),
      ),
    );
    expect(r).toEqual({ status: 'answered', interactionId: 'int-q1' });
    await rig.tick();
    expect(JSON.stringify(rig.llm.callsTo('dispatch_prompt')[1]!.input)).toContain(
      'green',
    );
  });
});
