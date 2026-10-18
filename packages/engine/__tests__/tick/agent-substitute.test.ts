/**
 * Pins the last two steps of the ladder: the Director's substitute, then the owner (d-0080).
 *
 * Why: when the agent and every place it can run have failed, the ticket parks as `no_agent_available` with the
 *   Director looking first. It may pick a substitute, but only from a list the engine built, and any doubt (a pick
 *   outside the list, a pause, a step error, no candidate, the agent saying pause, the first look switched off) hands
 *   the item to the owner, whose Retry starts the chain over. A restart between steps must repeat nothing.
 *
 * Pins: Done-when 8 (a pick becomes a `swap` with cause `fallback`, the item settles `substitute` by the Director, the
 *   retry runs on the substitute; the owner cases above; Retry restarts at slot 0; the owner cannot pick `substitute`)
 *   and 11 (a restart between a fallback park and its retry, and after a swap, repeats nothing).
 * Depends on: helpers/fallback-rig, helpers/escalation-rig, helpers/rig, helpers/scripted-llm, vitest.
 */

import { describe, expect, it } from 'vitest';
import { ownerPending, pendingOf } from '#tests/helpers/escalation-rig.js';
import {
  RETRY,
  exhausted,
  failRun,
  model,
  rows,
  run,
  runsOn,
  setProject,
  withFrontend,
} from '#tests/helpers/fallback-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { fail as failStep } from '#tests/helpers/scripted-llm.js';

describe("the Director's substitute", () => {
  it('picks a listed candidate: a swap of cause fallback, the item settled as substitute, the retry on the substitute', async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    rig.llm.script('pick_substitute', {
      decision: 'substitute',
      agent: 'frontend-writer',
      reason: 'The only other writer, and its scope sits inside the original.',
    });

    const id = await exhausted(rig, runsOn([]), withFrontend);

    const call = rig.llm.callsTo('pick_substitute')[0]!.input as {
      candidates: { id: string }[];
      failed: { agent_id: string };
      stage: { id: string };
    };

    expect(call.failed.agent_id).toBe('implementer');
    expect(call.stage.id).toBe('implementer');
    expect(call.candidates.map((c) => c.id)).toEqual(['frontend-writer']);

    const snap = await rig.storage.transaction((tx) => tx.ticketPipelines.get(id));

    expect(snap?.adjustments).toHaveLength(1);
    expect(snap?.adjustments[0]).toMatchObject({
      status: 'applied',
      cause: 'fallback',
      op: { op: 'swap', stage_id: 'implementer', agent: 'frontend-writer' },
    });

    expect(snap?.definition.stages[0]).toMatchObject({ agent: 'frontend-writer' });
    const [item] = await rig.storage.transaction((tx) =>
      tx.interactions.listByTicket(id),
    );

    expect(item).toMatchObject({
      status: 'answered',
      answer: { action: 'substitute', by: 'director' },
    });

    expect(await ownerPending(rig)).toEqual([]);

    await rig.tick();

    expect(rig.driver.starts).toHaveLength(3);
    expect(await run(rig, 'run-3')).toMatchObject({
      agent_id: 'frontend-writer',
      fallback_slot: -1,
    });

    expect((await rig.ticket(id)).status).toBe('in_progress');
  });

  it('hands the item to the owner for a pick outside the list, a pause, a step error, or no candidate', async () => {
    const cases: [string, (rig: Rig) => void, Record<string, unknown>][] = [
      [
        'a pick outside the list',
        (rig) =>
          rig.llm.script('pick_substitute', {
            decision: 'substitute',
            agent: 'critic',
            reason: 'Someone not in the list.',
          }),
        withFrontend,
      ],
      [
        'a pause',
        (rig) =>
          rig.llm.script('pick_substitute', {
            decision: 'pause',
            reason: 'No good fit for this stage.',
          }),
        withFrontend,
      ],
      [
        'a step error',
        (rig) =>
          rig.llm.script(
            'pick_substitute',
            failStep({ kind: 'crash', message: 'the model broke' }),
          ),
        withFrontend,
      ],
      ['no candidate', () => undefined, {}],
    ];

    for (const [name, script, extra] of cases) {
      const rig = await makeRig({ engine: { retry: RETRY } });
      script(rig);
      const id = await exhausted(rig, runsOn([]), extra);
      const pending = await pendingOf(rig, id, 'failure');

      expect(pending, name).toHaveLength(1);
      expect(pending[0]?.escalated_at, name).toBeDefined();
      expect(pending[0]?.payload, name).toMatchObject({
        cause: 'no_agent_available',
        error_family: 'rate_limit',
      });

      const snap = await rig.storage.transaction((tx) => tx.ticketPipelines.get(id));

      expect(snap?.adjustments, name).toEqual([]);
      expect((await rig.ticket(id)).status, name).toBe('waiting_human');
    }
  });

  it('goes straight to the owner when the agent says pause, and never calls the step', async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    const id = await exhausted(rig, runsOn([], 'pause'), withFrontend);

    expect(rig.llm.callsTo('pick_substitute')).toEqual([]);
    expect(await pendingOf(rig, id, 'failure')).toHaveLength(1);
    expect((await ownerPending(rig)).map((i) => i.ticket_id)).toEqual([id]);
  });

  it("goes straight to the owner when the owner turned the Director's first look off", async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    await rig.config.append({
      scope: 'company',
      // A company save is the whole override document, so the retry table goes in with it.
      doc: {
        engine: { retry: RETRY },
        director: { escalation: { director_first: false } },
      },
      author: 'test',
      reason: 'no first look',
      expectedVersion: (await rig.config.company()).version,
    });

    const id = await exhausted(rig, runsOn([]), withFrontend);

    expect(rig.llm.callsTo('pick_substitute')).toEqual([]);
    expect((await ownerPending(rig)).map((i) => i.ticket_id)).toEqual([id]);
  });

  it('does not offer the engine-only substitute action to the owner, and Retry restarts the chain at slot 0', async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    const id = await exhausted(
      rig,
      runsOn([{ harness: 'project_default', model: model('sonnet') }]),
    );

    // run-3 is the fallback (sonnet): rate limit it too so the list is spent.
    await failRun(rig, 'run-3', 'rate_limit');
    rig.clock.advance(2_000);
    await rig.tick();
    await failRun(rig, 'run-4', 'rate_limit');
    await rig.tick();

    const [item] = await pendingOf(rig, id, 'failure');

    expect(item?.payload).toMatchObject({ cause: 'no_agent_available' });

    const refused = await rig.engine.actOnEscalation(
      item!.id,
      { action: 'substitute' } as never,
      'owner',
    );

    expect(refused).toMatchObject({ status: 'action_not_offered' });

    const out = await rig.engine.actOnEscalation(item!.id, { action: 'retry' }, 'owner');

    expect(out.status).toBe('done');
    await rig.tick();

    const last = rig.driver.starts.at(-1)!;

    expect(last.model).toBe('opus');
    expect(
      (await rows(rig, id)).every(
        (r) => r.outcome.fallback === undefined || r.outcome.fallback.slot === 0,
      ),
    ).toBe(true);
  });

  it('repeats nothing after a restart between a fallback park and its retry', async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    await setProject(
      rig,
      runsOn([{ harness: 'project_default', model: model('sonnet') }]),
    );

    const id = await rig.request('Fix it');
    await rig.tick();

    // The retry's brief cannot be written this tick, so the fallback is parked on its wake and nothing runs.
    rig.llm.script(
      'dispatch_prompt',
      failStep({ kind: 'crash', message: 'the model broke' }),
      { prompt: 'Do it.' },
    );

    await failRun(rig, 'run-1', 'model_unavailable');

    expect(rig.driver.starts).toHaveLength(1);
    const wakes = await rig.storage.transaction((tx) =>
      tx.wakeRequests.listDue('9999-12-31T23:59:59.999Z'),
    );

    expect(wakes.map((w) => w.reason)).toEqual(['fallback:1:model_unavailable']);

    const second = rig.restart('srv-b');
    await rig.tickOn(second);
    await rig.tickOn(second);

    expect(rig.driver.starts.map((s) => s.model)).toEqual(['opus', 'sonnet']);
    expect(
      (await rows(rig, id)).filter((r) => r.stage_id === 'implementer'),
    ).toHaveLength(1);

    expect(await run(rig, 'run-2')).toMatchObject({ fallback_slot: 1, model: 'sonnet' });
  });

  it('does not swap twice after a restart once the substitute is in', async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    rig.llm.script('pick_substitute', {
      decision: 'substitute',
      agent: 'frontend-writer',
      reason: 'The only other writer, and its scope sits inside the original.',
    });

    const id = await exhausted(rig, runsOn([]), withFrontend);
    const second = rig.restart('srv-b');
    await rig.tickOn(second);
    await rig.tickOn(second);

    const snap = await rig.storage.transaction((tx) => tx.ticketPipelines.get(id));

    expect(snap?.adjustments.filter((a) => a.status === 'applied')).toHaveLength(1);
    expect(rig.llm.callsTo('pick_substitute')).toHaveLength(1);
  });
});
