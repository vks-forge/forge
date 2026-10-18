/**
 * Pins parallel writers: a group of writers with disjoint scopes runs side by side in one worktree.
 *
 * Why: large changes split cleanly (a frontend part and a backend part), and one Worker doing both is
 *   slower and loses focus (d-0076). Two writers in one worktree are only safe when each is held to
 *   its own folders, and they must still obey the Worker limits: each member is its own start, placed
 *   by the scheduler, so a project allowed two Workers runs both and a project allowed one runs them
 *   in turn. Each member's result must be kept (a settle dropped because a sibling was the ticket's
 *   current run would lose work), a finding that sends the work back must send every member back, and
 *   a restart must neither lose a member nor start it twice.
 *
 * Pins: Done-when 8 (cap 2 starts both runs, cap 1 runs them one after another, each settle is kept,
 *   a finding re-runs both) and Done-when 11 for a writer member (a crashed member run is retried
 *   by its own stage row, with no duplicate row).
 * Depends on: helpers/pipeline-rig, @forge/core, vitest.
 */

import { BUILTIN_AGENTS } from '@forge/core';
import type { AgentDefinition } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  G1,
  MERGE,
  agentOf,
  makePipelineRig,
  review,
  reviewDone,
  runIds,
  stageRows,
  writerDone,
} from '#tests/helpers/pipeline-rig.js';
import type { PipelineRig } from '#tests/helpers/pipeline-rig.js';

const writer = (name: string, scope: string): AgentDefinition => ({
  ...(BUILTIN_AGENTS['implementer'] as AgentDefinition),
  name,
  write_scope: [scope],
  origin: 'custom',
});

const GROUP = {
  id: 'writers',
  kind: 'group',
  label: 'Writers',
  join: 'all',
  members: [
    { id: 'fe', kind: 'agent', label: 'Frontend', agent: 'frontend-writer' },
    { id: 'be', kind: 'agent', label: 'Backend', agent: 'backend-writer' },
  ],
};

const REVIEW = { id: 'reviewer', kind: 'agent', label: 'Review', agent: 'reviewer' };

async function makeRig(cap: number): Promise<PipelineRig> {
  const v = await makePipelineRig({
    tier: 'A',
    engine: { max_concurrent_per_project: cap },
  });

  const current = await v.rig.config.project('forge');
  // A project's settings are stored whole per version, so the agents and the pipeline go in one save.
  await v.rig.config.append({
    scope: 'project',
    project: 'forge',
    doc: {
      ecosystems: ['node'],
      default_harness: 'scripted',
      checks: [{ name: 'test', role: 'test', command: 'pnpm test' }],
      agents: {
        custom: {
          'frontend-writer': writer('Frontend', 'apps/web/**'),
          'backend-writer': writer('Backend', 'packages/**'),
        },
      },
      pipelines: { standard: { stages: [GROUP, G1, REVIEW, MERGE] } } as never,
    },
    author: 'test',
    reason: 'writers',
    expectedVersion: current.version.project,
  });

  return v;
}

describe('a writer group under two Worker slots', () => {
  it('starts both members, keeps both settles, and merges after the reviewer', async () => {
    const v = await makeRig(2);
    const { rig, host } = v;
    const id = await rig.request('Split work');
    await rig.tick();
    await rig.tick();

    expect(runIds(rig)).toEqual(['run-1', 'run-2']);
    expect(await Promise.all(runIds(rig).map((r) => agentOf(rig, r)))).toEqual([
      'frontend-writer',
      'backend-writer',
    ]);

    const rows = await stageRows(rig, id);
    expect(rows.map((r) => [r.stage_id, r.member_id, r.status])).toEqual([
      ['writers', 'fe', 'running'],
      ['writers', 'be', 'running'],
    ]);

    // The newest start is the ticket's current run; the first member's settle must still count.
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'apps/web/a.ts' }]);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('in_progress');
    expect((await stageRows(rig, id)).find((r) => r.member_id === 'fe')).toMatchObject({
      status: 'passed',
    });

    await writerDone(rig, 'run-2', [{ kind: 'edited', path: 'packages/b.ts' }]);
    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'verifying' });
    expect(await agentOf(rig, 'run-3')).toBe('reviewer');
    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(host.count('merge')).toBe(1);
  });

  it('sends a finding back to both members', async () => {
    const v = await makeRig(2);
    const { rig } = v;
    const id = await rig.request('Split work');
    await rig.tick();
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'apps/web/a.ts' }]);
    await writerDone(rig, 'run-2', [{ kind: 'edited', path: 'packages/b.ts' }]);
    await rig.tick();
    await reviewDone(
      rig,
      'run-3',
      review('changes', [
        {
          severity: 'high',
          file: 'apps/web/a.ts',
          line: 3,
          issue: 'bug',
          evidence: 'a.ts:3 `x`',
        },
      ]),
    );

    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 1,
    });

    expect(runIds(rig)).toEqual(['run-1', 'run-2', 'run-3', 'run-4', 'run-5']);
    expect(await Promise.all(['run-4', 'run-5'].map((r) => agentOf(rig, r)))).toEqual([
      'frontend-writer',
      'backend-writer',
    ]);

    const again = (await stageRows(rig, id)).filter((r) => r.cycle === 1);

    expect(again.map((r) => [r.member_id, r.status])).toEqual([
      ['fe', 'running'],
      ['be', 'running'],
    ]);

    // Both reworked Workers were told the finding.
    const prompts = rig.llm.callsTo('dispatch_prompt').slice(-2);
    for (const p of prompts) {
      expect(JSON.stringify(p.input)).toContain('bug');
    }
  });
});

describe('a writer group under one Worker slot', () => {
  it('runs the members one after another', async () => {
    const v = await makeRig(1);
    const { rig } = v;
    const id = await rig.request('Split work');
    await rig.tick();
    await rig.tick();

    expect(runIds(rig)).toEqual(['run-1']);
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'apps/web/a.ts' }]);
    await rig.tick();

    expect(runIds(rig)).toEqual(['run-1', 'run-2']);
    expect(await agentOf(rig, 'run-2')).toBe('backend-writer');
    await writerDone(rig, 'run-2', [{ kind: 'edited', path: 'packages/b.ts' }]);
    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'verifying' });
  });

  it('retries a member whose run died with the server on its own stage row, without a duplicate', async () => {
    const v = await makeRig(2);
    const { rig } = v;
    const id = await rig.request('Split work');
    await rig.tick();
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'apps/web/a.ts' }]);
    await rig.tick();

    const b = rig.restart('srv-b');
    const first = await rig.tickOn(b);
    expect(first.crashed).toEqual(['run-2']);
    rig.clock.advance(10_001);
    await rig.tickOn(b);

    expect(runIds(rig)).toEqual(['run-1', 'run-2', 'run-3']);
    expect(await agentOf(rig, 'run-3')).toBe('backend-writer');
    const be = (await stageRows(rig, id)).filter((r) => r.member_id === 'be');

    expect(be).toHaveLength(1);
    expect(be[0]).toMatchObject({ run_id: 'run-3', status: 'running' });

    await writerDone(rig, 'run-3', [{ kind: 'edited', path: 'packages/b.ts' }]);
    await rig.tickOn(b);

    expect(await rig.ticket(id)).toMatchObject({ status: 'verifying' });
  });
});
