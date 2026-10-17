/**
 * Pins the Standard lane end to end: tests first, then the implementation, G1, an independent
 * reviewer, then merge.
 *
 * Why: Standard is the first lane with more than one stage, and the whole point of its pipeline is
 *   that each stage is a different agent doing a different job: a test-writer who proves the tests
 *   fail, an implementer who makes them pass, an independent gate and a reviewer who has never read
 *   the implementer's own account of its work (d-0070). If the stages ran in a different order,
 *   the reviewer saw the Worker's narrative, a tier B change merged without the owner, or a stage
 *   left nothing to read afterwards, the lane would cost more than Express and be no safer.
 *
 * Pins: Done-when 2 (test-writer run, red proof, `stage` wake, implementer run, G1, reviewer run,
 *   tier A merged; tier B ends in review and approve merges; the reviewer prompt holds no sentinel
 *   from the implementer's summary; artifacts stored for every stage), the stage rows of each step,
 *   and that a check run never becomes the ticket's assignee.
 * Depends on: helpers/pipeline-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
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

const SENTINEL = 'SENTINEL-IMPLEMENTER-NARRATIVE-7f3a';

/** Plays the first two writers; returns with the ticket in Verifying after the gates and the reviewer started. */
async function toReviewer(v: PipelineRig): Promise<string> {
  const { rig } = v;
  const id = await rig.request('Fix the doctor check');
  await rig.tick();
  await writerDone(
    rig,
    'run-1',
    [{ kind: 'edited', path: 'src/a.test.ts' }],
    'wrote the tests',
  );

  await rig.tick();
  await writerDone(rig, 'run-2', [{ kind: 'edited', path: 'src/a.ts' }], SENTINEL);
  await rig.tick();

  return id;
}

describe('Standard lane, tier A', () => {
  it('runs test-writer, implementer, G1 and the reviewer in order, then merges', async () => {
    const v = await makePipelineRig({ tier: 'A' });
    const { rig, host } = v;
    const id = await toReviewer(v);

    expect(runIds(rig)).toEqual(['run-1', 'run-2', 'run-3']);
    expect(await Promise.all(runIds(rig).map((r) => agentOf(rig, r)))).toEqual([
      'test-writer',
      'implementer',
      'reviewer',
    ]);

    // The reviewer is a check: the ticket is still the implementer's, and still verifying.
    expect(await rig.ticket(id)).toMatchObject({
      status: 'verifying',
      assignee_run_id: 'run-2',
    });

    expect(host.count('merge')).toBe(0);

    await reviewDone(
      rig,
      'run-3',
      review('pass', [{ severity: 'low', issue: 'name', evidence: 'x.ts:1 `a`' }]),
    );

    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'done', tier_actual: 'A' });
    expect(host.count('merge')).toBe(1);
    const rows = await stageRows(rig, id);
    expect(rows.map((r) => [r.stage_id, r.member_id, r.status])).toEqual([
      ['test-writer', '', 'passed'],
      ['test-writer', 'proof', 'passed'],
      ['implementer', '', 'passed'],
      ['g1', '', 'passed'],
      ['reviewer', '', 'passed'],
    ]);
  });

  it('runs the red proof with expect fail on the project test command', async () => {
    const v = await makePipelineRig();
    await toReviewer(v);

    expect(v.scripts.requests).toHaveLength(1);
    expect(v.scripts.requests[0]).toMatchObject({
      command: 'pnpm test',
      expect: 'fail',
      guardPaths: [],
    });
  });

  it('shows the reviewer the diff and the claims but never the implementer narrative', async () => {
    const v = await makePipelineRig();
    const { rig } = v;
    rig.worktrees.patch = 'diff --git a/src/a.ts b/src/a.ts\n+changed line';
    await toReviewer(v);

    const prompt = rig.driver.starts[2]?.prompt ?? '';

    expect(prompt).toContain('+changed line');
    expect(prompt).toContain('submit_review');
    expect(prompt).not.toContain(SENTINEL);
    expect(prompt).not.toContain("The Worker's own account");
  });

  it('stores what each stage was shown or left, with its hash', async () => {
    const v = await makePipelineRig();
    const { rig } = v;
    const id = await toReviewer(v);

    const artifacts = await rig.storage.transaction((tx) =>
      tx.stageArtifacts.listByTicket(id),
    );

    const rows = await stageRows(rig, id);
    const kindsOf = (stage: string, member = ''): string[] =>
      artifacts
        .filter((a) =>
          rows.find(
            (r) =>
              r.id === a.stage_run_id && r.stage_id === stage && r.member_id === member,
          ),
        )
        .map((a) => a.kind);

    expect(kindsOf('test-writer')).toEqual(
      expect.arrayContaining(['finish_claims', 'narrative']),
    );

    expect(kindsOf('implementer')).toEqual(
      expect.arrayContaining(['finish_claims', 'narrative']),
    );

    expect(kindsOf('reviewer')).toEqual(expect.arrayContaining(['ticket']));
    expect(artifacts.every((a) => /^[0-9a-f]{64}$/.test(a.sha256))).toBe(true);

    const narrative = artifacts.find(
      (a) =>
        a.kind === 'narrative' &&
        a.stage_run_id === rows.find((r) => r.stage_id === 'implementer')?.id,
    );

    const full = narrative
      ? await rig.storage.transaction((tx) => tx.stageArtifacts.get(id, narrative.id))
      : null;

    expect(full?.content).toBe(SENTINEL);
  });
});

describe('Standard lane, tier B', () => {
  it('ends in review after the reviewer, and the owner approving merges', async () => {
    const v = await makePipelineRig({ tier: 'B' });
    const { rig, host } = v;
    const id = await toReviewer(v);
    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'review', tier_actual: 'B' });
    expect(host.count('merge')).toBe(0);

    const out = await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    expect(out).toEqual({ status: 'done', interaction: null });
    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(host.count('merge')).toBe(1);
  });
});
