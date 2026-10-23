/**
 * Scenario: the engine asks for a tick the moment something can start, not on the next interval.
 *
 * Why: the periodic tick is only a safety sweep (30 s by default). If an owner's answer, a
 *   settled run or a quota reset waited for it, every step of a ticket would add up to half a
 *   minute of dead time while a Worker slot sits free. Events must request a tick at once
 *   (coalesced into one), and a wake with a `not_before` or a harness pause needs a timer
 *   for its own moment because no event happens then (director-core.md §2).
 *
 * Pins: an owner's answer and a settled run each lead to the next run without the clock moving;
 *   many events in one moment make one request; a `not_before` wake and a harness pause fire
 *   a request at their time through the clock's timer, and the timer re-arms for the soonest
 *   moment only.
 * Depends on: helpers/rig, helpers/scheduling-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { intake, makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { HOUR, addProject, quotaResult } from '#tests/helpers/scheduling-rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

const MINUTE = 60_000;

/** The app's ticker in miniature: serve each tick request with one tick, never advancing the clock. */
function ticker(rig: Rig): () => Promise<void> {
  let served = rig.tickRequests.count;

  return async () => {
    while (rig.tickRequests.count > served) {
      served = rig.tickRequests.count;
      await rig.tick();
      await rig.flush();
    }
  };
}

async function askAndPause(rig: Rig, ticketId: string): Promise<void> {
  rig.driver.emit('run-1', {
    type: 'ask',
    interaction_id: 'int-q1',
    kind: 'question',
    prompt: 'Which colour?',
  });

  await rig.storage.transaction((tx) =>
    tx.interactions.insert({
      id: 'int-q1',
      ticket_id: ticketId as never,
      run_id: 'run-1',
      kind: 'question',
      payload: { prompt: 'Which colour?' },
      status: 'pending',
      asked_at: new Date(rig.clock.now()).toISOString(),
      timeout_at: new Date(rig.clock.now() + 4 * HOUR).toISOString(),
    }),
  );

  rig.driver.finish(
    'run-1',
    makeResult({ status: 'paused', pauseReason: 'interaction', interactionId: 'int-q1' }),
  );

  await rig.flush();
}

describe('event wake', () => {
  it('starts the resumed run after an owner answer without the clock moving', async () => {
    const rig = await makeRig();
    const serve = ticker(rig);
    const id = await rig.request('Add a flag');
    await serve();
    await askAndPause(rig, id);
    await serve();
    const start = rig.clock.now();

    await rig.engine.answerInteraction('int-q1', 'blue');
    await serve();

    expect(rig.clock.now()).toBe(start);
    expect(rig.driver.starts.map((s) => s.runId)).toEqual(['run-1', 'run-2']);
  });

  it('starts the next waiting ticket when a run settles, without the clock moving', async () => {
    const rig = await makeRig({ engine: { max_concurrent_per_project: 1 } });
    const serve = ticker(rig);
    await rig.request('first');
    await rig.request('second');
    await serve();
    expect(rig.driver.starts).toHaveLength(1);
    const start = rig.clock.now();

    rig.driver.finish('run-1', makeResult({ status: 'success' }));
    await rig.flush();
    await serve();

    expect(rig.clock.now()).toBe(start);
    expect(rig.driver.starts.length).toBeGreaterThanOrEqual(2);
  });

  it('turns many events in one moment into one tick request', async () => {
    const rig = await makeRig();
    await rig.tick();
    const before = rig.tickRequests.count;

    rig.engine.requestTick();
    rig.engine.requestTick();
    await rig.engine.ingest(intake({ dedupe_key: 'a' }));
    await rig.engine.ingest(intake({ dedupe_key: 'b' }));
    rig.engine.requestTick();

    expect(rig.tickRequests.count - before).toBe(1);
  });

  it('fires a not_before wake at its time through the timer, not the periodic tick', async () => {
    const rig = await makeRig();
    await addProject(rig, 'forge', 'FG');
    const serve = ticker(rig);
    await rig.request('first');
    await serve();
    const reset = rig.clock.now() + 5 * MINUTE;
    rig.driver.finish('run-1', quotaResult(new Date(reset).toISOString()));
    await rig.flush();
    await serve();

    expect(rig.clock.pendingAt()).toEqual([reset]);
    expect(rig.driver.starts).toHaveLength(1);

    rig.clock.advance(5 * MINUTE);
    rig.clock.fireDue();
    await serve();

    expect(rig.driver.starts).toHaveLength(2);
    expect(rig.clock.pendingAt()).toEqual([]);
  });

  it('keeps one timer, for the soonest of the wake and the harness pause', async () => {
    const rig = await makeRig();
    await addProject(rig, 'forge', 'FG');
    const serve = ticker(rig);
    await rig.request('first');
    await serve();
    const reset = rig.clock.now() + 5 * MINUTE;
    rig.driver.finish('run-1', quotaResult(new Date(reset).toISOString()));
    await rig.flush();
    await serve();
    await rig.tick();
    await rig.tick();

    expect(rig.clock.pendingAt()).toHaveLength(1);
  });
});
