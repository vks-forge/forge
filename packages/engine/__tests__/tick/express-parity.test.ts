/**
 * Pins that an Express dispatch with built-in agents asks the harness for exactly what it did
 * before agents existed.
 *
 * Why: Express runs the effective `implementer` agent, and a fresh install must behave like
 *   the pre-agent engine: same prompt, same model from the lane matrix, same budget, same
 *   environment. A drift here would change what every existing owner's Workers are told and
 *   what they spend, with no setting touched. The golden fixture was captured from the engine
 *   before agents were wired in; the cases after the first show where the model still comes
 *   from (the company lane matrix) when the owner changed it.
 *
 *   The stage runner must not change any of that: an Express ticket runs implementer, G1, merge
 *   through the cursor and ends exactly as before, and the only new writes are the ticket's pipeline
 *   snapshot and two stage rows (no artifacts, no wakes, no merge row).
 *
 * Pins: the whole RunRequest field by field, the run row's agent record, the matrix override, and
 *   (Done-when 1) the status path inbox, planned, in progress, verifying, done with tier A, one
 *   `ticket_pipelines` row, two passed `stage_runs` (implementer, g1), no artifacts and no stage wake.
 * Depends on: helpers/rig, helpers/verify-rig, fixtures/express-dispatch.golden.json, vitest.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FAR_FUTURE } from '#/shared/time.js';
import { makeRig } from '#tests/helpers/rig.js';
import { makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

const GOLDEN = JSON.parse(
  readFileSync(
    new URL('../fixtures/express-dispatch.golden.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>;

describe('Express parity with built-in agents', () => {
  it('builds a RunRequest equal to the one captured before agents existed', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    await rig.tick();

    const req = rig.driver.starts[0];

    expect(req).toEqual(GOLDEN);
    for (const key of Object.keys(GOLDEN)) {
      expect(req?.[key as keyof typeof req], key).toEqual(GOLDEN[key]);
    }
  });

  it('runs on the harness the project names', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    await rig.tick();

    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));

    expect(run?.harness).toBe('scripted');
  });

  it('records the implementer agent and its hash on the run', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    await rig.tick();

    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));

    expect(run?.agent_id).toBe('implementer');
    expect(run?.agent_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('still takes the model from the company lane matrix when the owner changed it', async () => {
    const rig = await makeRig();
    await rig.config.append({
      scope: 'company',
      doc: { models: { worker: { express: 'opus' } } },
      author: 'test',
      reason: 'lane model override',
      expectedVersion: 0,
    });

    await rig.request('Fix the doctor check');
    await rig.tick();

    expect(rig.driver.starts[0]?.model).toBe('opus');
  });
});

describe('Express through the stage runner', () => {
  it('gates and merges as before, writing only a pipeline snapshot and two stage rows', async () => {
    const { rig, host } = await makeVerifyRig({ tier: 'A' });
    const id = await startAndFinish(rig, [{ kind: 'edited', path: 'src/a.ts' }]);

    await rig.tick();

    const ticket = await rig.ticket(id);
    expect(ticket).toMatchObject({ status: 'done', tier_actual: 'A', lane: 'express' });
    expect(host.count('merge')).toBe(1);

    const events = await rig.storage.transaction((tx) =>
      tx.cardEvents.list(ticket.card_id!, { limit: 500 }),
    );

    const path = events.flatMap((e) =>
      e.kind === 'ticket_state' ? [`${e.payload.from}>${e.payload.to}`] : [],
    );

    expect(path).toEqual([
      'inbox>planned',
      'planned>in_progress',
      'in_progress>verifying',
      'verifying>done',
    ]);

    const written = await rig.storage.transaction(async (tx) => ({
      snapshot: await tx.ticketPipelines.get(id),
      rows: await tx.stageRuns.listByTicket(id),
      artifacts: await tx.stageArtifacts.listByTicket(id),
      wakes: await tx.wakeRequests.listDue(FAR_FUTURE),
    }));

    expect(written.snapshot).toMatchObject({ lane: 'express', routed: [] });
    expect(written.snapshot?.definition.stages.map((st) => st.id)).toEqual([
      'implementer',
      'g1',
      'merge',
    ]);

    expect(written.rows.map((r) => [r.stage_id, r.member_id, r.cycle, r.status])).toEqual(
      [
        ['implementer', '', 0, 'passed'],
        ['g1', '', 0, 'passed'],
      ],
    );

    expect(written.rows[0]).toMatchObject({ agent_id: 'implementer', run_id: 'run-1' });
    expect(written.artifacts).toEqual([]);
    expect(written.wakes).toEqual([]);
  });
});
