/**
 * Pins what a reviewer's blocking findings do: send the implementer back, then the owner, or hold.
 *
 * Why: a reviewer that cannot stop a bad change is decoration, and one that can loop forever is a
 *   cost leak. Blocking findings (critical or high, with evidence) take the same bounded road as a
 *   failed gate (d-0152): the work goes back to the implementer with the findings in its wake, at
 *   most twice, then the owner decides. The test-writer is not run again, because only the
 *   implementation was wrong. A stage set to hold parks the ticket for the owner at once without
 *   spending a rework. Findings that are not blocking (medium, low) never stop the merge.
 *
 * Pins: Done-when 4 (a high finding: `gate_failed`, rework count 1, the implementer runs again with
 *   the findings in its prompt and the test-writer does not; the same at 2; the third time
 *   `waiting_human` with a `rework_cap` escalation; `on_blocking: 'hold'` parks from verifying at
 *   once), medium findings pass, a reviewer who submits nothing parks the ticket.
 * Depends on: helpers/pipeline-rig, helpers/escalation-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { pendingOf } from '#tests/helpers/escalation-rig.js';
import {
  agentOf,
  makePipelineRig,
  review,
  reviewDone,
  runIds,
  stageRows,
  writerDone,
} from '#tests/helpers/pipeline-rig.js';
import type { PipelineRig } from '#tests/helpers/pipeline-rig.js';

const HIGH = {
  severity: 'high' as const,
  file: 'src/a.ts',
  line: 12,
  issue: 'the null case is not handled',
  evidence: 'src/a.ts:12 `return x.value` runs when x is null',
};

/** Plays the pipeline up to the reviewer's run; returns the ticket id and the reviewer's run id. */
async function toReviewer(v: PipelineRig): Promise<{ id: string; reviewerRun: string }> {
  const { rig } = v;
  const id = await rig.request('Fix the doctor check');
  await rig.tick();
  await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.test.ts' }]);
  await rig.tick();
  await writerDone(rig, 'run-2', [{ kind: 'edited', path: 'src/a.ts' }]);
  await rig.tick();

  return { id, reviewerRun: runIds(rig).at(-1) as string };
}

/** The implementer (after a send-back) finishes and the next reviewer starts; returns its run id. */
async function reworkRound(v: PipelineRig): Promise<string> {
  const { rig } = v;
  const implementerRun = runIds(rig).at(-1) as string;
  await writerDone(rig, implementerRun, [{ kind: 'edited', path: 'src/a.ts' }]);
  await rig.tick();

  return runIds(rig).at(-1) as string;
}

describe('review rework', () => {
  it('sends a high finding back to the implementer with the findings, never to the test-writer', async () => {
    const v = await makePipelineRig();
    const { rig } = v;
    const { id, reviewerRun } = await toReviewer(v);

    await reviewDone(rig, reviewerRun, review('changes', [HIGH]));
    await rig.tick();

    const t = await rig.ticket(id);
    expect(t).toMatchObject({ status: 'in_progress', rework_count: 1 });
    const again = runIds(rig).at(-1) as string;

    expect(again).not.toBe(reviewerRun);
    expect(await agentOf(rig, again)).toBe('implementer');
    const prompt = rig.driver.starts.find((s) => s.runId === again)?.prompt ?? '';
    const step = rig.llm.callsTo('dispatch_prompt').at(-1);

    expect(JSON.stringify(step?.input)).toContain('the null case is not handled');
    expect(prompt).toContain('Rules of this run');
    const agents = await Promise.all(runIds(rig).map((r) => agentOf(rig, r)));

    expect(agents.filter((a) => a === 'test-writer')).toHaveLength(1);
  });

  it('records the reviewer as failed, so the next cycle restarts at the implementer', async () => {
    const v = await makePipelineRig();
    const { rig } = v;
    const { id, reviewerRun } = await toReviewer(v);
    await reviewDone(rig, reviewerRun, review('changes', [HIGH]));
    await rig.tick();

    const rows = await stageRows(rig, id);
    const failed = rows.find((r) => r.stage_id === 'reviewer');

    expect(failed).toMatchObject({ status: 'failed', cycle: 0 });
    expect(failed?.outcome.blocking).toBe(1);
    expect(rows.find((r) => r.stage_id === 'implementer' && r.cycle === 1)).toMatchObject(
      {
        status: 'running',
      },
    );
  });

  it('allows two automatic reworks and then hands the ticket to the owner with a rework_cap escalation', async () => {
    const v = await makePipelineRig();
    const { rig } = v;
    const { id, reviewerRun } = await toReviewer(v);

    await reviewDone(rig, reviewerRun, review('changes', [HIGH]));
    await rig.tick();
    const second = await reworkRound(v);
    await reviewDone(rig, second, review('changes', [HIGH]));
    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 2,
    });

    const third = await reworkRound(v);
    await reviewDone(rig, third, review('changes', [HIGH]));
    await rig.tick();

    const t = await rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toMatch(/failed after 2 automatic reworks/);
    const [row] = await pendingOf(rig, id, 'failure');

    expect(row?.payload).toMatchObject({ kind: 'failure', cause: 'rework_cap' });
  });

  it('holds the ticket for the owner at once when the stage says hold, without spending a rework', async () => {
    const v = await makePipelineRig();
    const { rig } = v;
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: {
        pipelines: {
          standard: {
            stages: [
              {
                id: 'implementer',
                kind: 'agent',
                label: 'Implement',
                agent: 'implementer',
              },
              { id: 'g1', kind: 'script_gate', label: 'Gate G1', run: { builtin: 'g1' } },
              {
                id: 'reviewer',
                kind: 'agent',
                label: 'Review',
                agent: 'reviewer',
                on_blocking: 'hold',
              },
              { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
            ],
          },
        },
      },
      author: 'test',
      reason: 'hold on blocking',
      expectedVersion: 1,
    });

    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.ts' }]);
    await rig.tick();
    await reviewDone(rig, 'run-2', review('changes', [HIGH]));
    await rig.tick();

    const t = await rig.ticket(id);
    expect(t).toMatchObject({
      status: 'waiting_human',
      rework_count: 0,
      parked_from: 'verifying',
    });

    expect(t.blocked_reason).toContain('holds the merge for you');
    expect(
      (await stageRows(rig, id)).find((r) => r.stage_id === 'reviewer')?.status,
    ).toBe('waiting');

    expect(await pendingOf(rig, id, 'failure')).toHaveLength(1);
  });

  it('lets medium and low findings through: they never stop the merge', async () => {
    const v = await makePipelineRig();
    const { rig, host } = v;
    const { id, reviewerRun } = await toReviewer(v);

    await reviewDone(
      rig,
      reviewerRun,
      review('changes', [
        { severity: 'medium', issue: 'naming', evidence: 'src/a.ts:3 `tmp`' },
        { severity: 'low', issue: 'comment', evidence: 'src/a.ts:4 `// x`' },
      ]),
    );

    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'done', rework_count: 0 });
    expect(host.count('merge')).toBe(1);
  });

  it('parks the ticket, never merges, when the reviewer finishes without submitting a review', async () => {
    const v = await makePipelineRig();
    const { rig, host } = v;
    const { id, reviewerRun } = await toReviewer(v);

    await reviewDone(rig, reviewerRun, null);
    await rig.tick();

    const t = await rig.ticket(id);
    expect(t).toMatchObject({ status: 'waiting_human', parked_from: 'verifying' });
    expect(t.blocked_reason).toContain('without submitting a review');
    expect(host.count('merge')).toBe(0);
    expect(
      (await stageRows(rig, id)).find((r) => r.stage_id === 'reviewer')?.status,
    ).toBe('error');
  });
});
