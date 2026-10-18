/**
 * Pins the run-together group and the routing rules of a pipeline.
 *
 * Why: a group runs its members together and passes only when every member has reported, and a
 *   routing rule only ever adds a check (d-0069), so a Terraform change gets a network reviewer
 *   whatever the lane while nothing the owner listed is ever removed. Both end at the same merge
 *   door as every other stage, so neither can ship work a check stopped.
 *
 * Pins: a group's members start together and the merge waits for both; one member's blocking finding
 *   sends the work back; routing at diff time adds the stage before merge and records it; a rule that
 *   matches nothing adds nothing and removes nothing.
 * Depends on: helpers/pipeline-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  G1,
  IMPLEMENT,
  MERGE,
  agentOf,
  makePipelineRig,
  review,
  reviewDone,
  runIds,
  setProjectPipelines,
  stageRows,
  writerDone,
} from '#tests/helpers/pipeline-rig.js';

describe('run-together group', () => {
  const group = {
    id: 'review-group',
    kind: 'group',
    label: 'Review and critique',
    join: 'all',
    members: [
      { id: 'review', kind: 'agent', label: 'Review', agent: 'reviewer' },
      { id: 'critique', kind: 'agent', label: 'Critique', agent: 'critic' },
    ],
  };

  async function toGroup() {
    const v = await makePipelineRig({ tier: 'A' });
    await setProjectPipelines(v.rig, {
      standard: { stages: [IMPLEMENT, G1, group, MERGE] },
    });

    const id = await v.rig.request('Fix the doctor check');
    await v.rig.tick();
    await writerDone(v.rig, 'run-1', [{ kind: 'edited', path: 'src/a.ts' }]);
    await v.rig.tick();

    return { ...v, id };
  }

  it('places each member on its own, so a one-Worker project runs them in turn, and merges only after both reported', async () => {
    const { rig, host, id } = await toGroup();

    // The scheduler placed only the reviewer: the per-project limit of one Worker is still honoured.
    expect(runIds(rig)).toEqual(['run-1', 'run-2']);
    expect(await agentOf(rig, 'run-2')).toBe('reviewer');
    expect(await rig.ticket(id)).toMatchObject({
      status: 'verifying',
      assignee_run_id: 'run-1',
    });

    await reviewDone(rig, 'run-2', review('pass'));
    await rig.tick();

    expect(runIds(rig)).toEqual(['run-1', 'run-2', 'run-3']);
    expect(await agentOf(rig, 'run-3')).toBe('critic');
    expect(host.count('merge')).toBe(0);
    expect(await rig.ticket(id)).toMatchObject({ status: 'verifying' });

    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
    const rows = (await stageRows(rig, id)).filter((r) => r.stage_id === 'review-group');
    expect(rows.map((r) => [r.member_id, r.status])).toEqual([
      ['review', 'passed'],
      ['critique', 'passed'],
    ]);
  });

  it('sends the work back when one member finds a blocking problem', async () => {
    const { rig, host, id } = await toGroup();

    await reviewDone(rig, 'run-2', review('pass'));
    await rig.tick();
    await reviewDone(
      rig,
      'run-3',
      review('changes', [
        {
          severity: 'critical',
          issue: 'drops data',
          evidence: 'src/a.ts:9 `delete all`',
        },
      ]),
    );

    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 1,
    });

    expect(host.count('merge')).toBe(0);
  });
});

describe('routing rules', () => {
  it('adds the rule check before merge when the real diff touches its paths, and records it', async () => {
    const v = await makePipelineRig({ tier: 'A' });
    const { rig, host } = v;
    rig.worktrees.changed = ['infra/main.tf'];
    await setProjectPipelines(rig, {
      standard: { stages: [IMPLEMENT, G1, MERGE] },
      routing: [
        { id: 'net', paths: ['**/*.tf'], add: 'critic', label: 'Network review' },
      ],
    });

    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'infra/main.tf' }]);
    await rig.tick();

    expect(await agentOf(rig, 'run-2')).toBe('critic');
    expect(host.count('merge')).toBe(0);
    const snap = await rig.storage.transaction((tx) => tx.ticketPipelines.get(id));
    expect(snap?.routed).toEqual([
      { rule_id: 'net', agent: 'critic', stage_id: 'route-net', at: 'diff' },
    ]);

    expect(snap?.definition.stages.map((s) => s.id)).toEqual([
      'implementer',
      'g1',
      'route-net',
      'merge',
    ]);

    await reviewDone(rig, 'run-2', review('pass'));
    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
  });

  it('adds nothing when the diff touches no rule path, and never removes a stage', async () => {
    const v = await makePipelineRig({ tier: 'A' });
    const { rig } = v;
    await setProjectPipelines(rig, {
      standard: { stages: [IMPLEMENT, G1, MERGE] },
      routing: [{ id: 'net', paths: ['**/*.tf'], add: 'critic' }],
    });

    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.ts' }]);
    await rig.tick();

    const snap = await rig.storage.transaction((tx) => tx.ticketPipelines.get(id));
    expect(snap?.routed).toEqual([]);
    expect(snap?.definition.stages.map((s) => s.id)).toEqual([
      'implementer',
      'g1',
      'merge',
    ]);

    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
  });
});
