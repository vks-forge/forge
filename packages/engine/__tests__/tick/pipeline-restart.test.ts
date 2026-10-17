/**
 * Pins that a server restart in the middle of a pipeline loses nothing and starts nothing twice.
 *
 * Why: the stage rows are the only account of where a ticket's pipeline stands, so a restart has to
 *   find a ticket exactly where it was. A reviewer that was running when the server died is
 *   crash-settled like any lost run, and the same stage attempt (one row per ticket, stage, member
 *   and cycle) is taken over by its new run instead of a second row being started. A red proof
 *   whose job died with the process has a `running` row and no job, and must run again. A script
 *   gate is the same. If a restart could duplicate a stage row, a ticket would be judged twice or
 *   the unique key would stall it for ever.
 *
 * Pins: Done-when 9 (restart mid-reviewer: no duplicate `stage_runs`, the same row carries the
 *   new run and the stage completes and merges), a lost red proof job runs again, a lost script gate
 *   job runs again and the ticket finishes.
 * Depends on: helpers/pipeline-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  agentOf,
  makePipelineRig,
  review,
  reviewDone,
  runIds,
  setProjectPipelines,
  stageRows,
  writerDone,
} from '#tests/helpers/pipeline-rig.js';

describe('restart mid-pipeline', () => {
  it('takes over the reviewer attempt for the retried run, without a second stage row', async () => {
    const v = await makePipelineRig();
    const { rig, host } = v;
    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.test.ts' }]);
    await rig.tick();
    await writerDone(rig, 'run-2', [{ kind: 'edited', path: 'src/a.ts' }]);
    await rig.tick();

    const before = await stageRows(rig, id);
    const reviewerRow = before.find((r) => r.stage_id === 'reviewer');
    expect(reviewerRow).toMatchObject({ status: 'running', run_id: 'run-3' });

    // The server dies with the reviewer running; a new one starts over the same storage.
    const b = rig.restart('srv-b');
    const first = await rig.tickOn(b);
    expect(first.crashed).toEqual(['run-3']);

    rig.clock.advance(10_001);
    await rig.tickOn(b);

    const after = await stageRows(rig, id);
    const rows = after.filter((r) => r.stage_id === 'reviewer');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: reviewerRow?.id,
      run_id: 'run-4',
      status: 'running',
    });

    expect(await agentOf(rig, 'run-4')).toBe('reviewer');
    expect(host.count('merge')).toBe(0);

    await reviewDone(rig, 'run-4', review('pass'));
    await rig.tickOn(b);

    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(
      (await stageRows(rig, id)).filter((r) => r.stage_id === 'reviewer'),
    ).toHaveLength(1);

    expect(runIds(rig)).toEqual(['run-1', 'run-2', 'run-3', 'run-4']);
  });

  it('runs a red proof again when its job died with the process', async () => {
    const v = await makePipelineRig();
    const { rig, scripts } = v;
    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.test.ts' }]);
    await rig.tick();

    expect(scripts.requests).toHaveLength(1);
    // Put the proof back as it was when the process died: running, with no job and no result.
    const proof = (await stageRows(rig, id)).find((r) => r.member_id === 'proof')!;
    await rig.storage.transaction(async (tx) => {
      await tx.stageRuns.finish(proof.id, {
        status: 'running',
        outcome: {},
        ended_at: null,
      });
    });

    const b = rig.restart('srv-b');
    await rig.tickOn(b);

    expect(scripts.requests).toHaveLength(2);
    expect(
      (await stageRows(rig, id)).filter((r) => r.member_id === 'proof'),
    ).toHaveLength(1);
  });

  it('runs a script gate again when its job died with the process, and the ticket finishes', async () => {
    const v = await makePipelineRig({ tier: 'A' });
    const { rig, scripts, host } = v;
    await setProjectPipelines(rig, {
      standard: {
        stages: [
          { id: 'implementer', kind: 'agent', label: 'Implement', agent: 'implementer' },
          { id: 'g1', kind: 'script_gate', label: 'Gate G1', run: { builtin: 'g1' } },
          {
            id: 'scan',
            kind: 'script_gate',
            label: 'Scan',
            run: {
              command: 'node scripts/scan.mjs',
              timeout_ms: 60_000,
              guard_paths: [],
            },
          },
          { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
        ],
      },
    });

    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.ts' }]);
    await rig.tick();

    // The first server only started the scan; its result was never applied.
    expect((await stageRows(rig, id)).find((r) => r.stage_id === 'scan')?.status).toBe(
      'running',
    );

    const started = scripts.requests.length;

    const b = rig.restart('srv-b');
    await rig.tickOn(b);
    await rig.tickOn(b);

    expect(scripts.requests.length).toBeGreaterThan(started);
    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(host.count('merge')).toBe(1);
    expect((await stageRows(rig, id)).filter((r) => r.stage_id === 'scan')).toHaveLength(
      1,
    );
  });
});
