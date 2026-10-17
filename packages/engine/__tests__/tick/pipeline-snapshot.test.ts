/**
 * Pins the ticket's own copy of its pipeline: taken once at the first dispatch, checked against
 * the roster, extended by routing on the plan's files, and never changed by a later settings edit.
 *
 * Why: an owner edits pipelines while tickets run. A started ticket must finish on the list it
 *   began with (otherwise a Worker could be told "you are done" by a pipeline that no longer
 *   asks for the review it was promised), a list that no longer holds under today's roster must
 *   stop the ticket visibly instead of running (fail closed), a ticket that was already past its
 *   writers when pipelines went live must not be asked to write again, and a lane raised later
 *   takes the heavier list at the next stage boundary without redoing what passed.
 *
 * Pins: snapshot hash and config version recorded once and kept after a company edit; an
 *   archived reviewer parks a Standard ticket at its first dispatch with the reason; routing
 *   rules add a check from the plan's files at snapshot; a verifying ticket from before pipelines
 *   adopts its writer and finishes; a raised lane re-snapshots and adopts the writers it is past;
 *   a check run is never the ticket's assignee and never resumes a session.
 * Depends on: helpers/pipeline-rig, helpers/planning-rig, vitest.
 */

import { pipelineHash } from '@forge/core';
import type { Ticket } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  makePipelineRig,
  review,
  reviewDone,
  runIds,
  setProjectPipelines,
  stageRows,
  writerDone,
} from '#tests/helpers/pipeline-rig.js';
import {
  oneTicketPlan,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
} from '#tests/helpers/planning-rig.js';
import { makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

const snapshotOf = (rig: { storage: import('@forge/core').StorageAdapter }, id: string) =>
  rig.storage.transaction((tx) => tx.ticketPipelines.get(id));

describe('the snapshot', () => {
  it('is taken at the first dispatch with its hash and settings version, and kept after a later edit', async () => {
    const v = await makePipelineRig();
    const { rig } = v;
    const id = await rig.request('Fix the doctor check');
    await rig.tick();

    const first = await snapshotOf(rig, id);
    expect(first?.lane).toBe('standard');
    expect(first?.hash).toBe(pipelineHash(first!.definition));
    expect(first?.config_version).toMatch(/^c\d+:p\d+$/);
    expect(first?.definition.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer',
      'merge',
    ]);

    // The owner removes the reviewer from Standard while the ticket is running.
    await setProjectPipelines(rig, {
      standard: {
        stages: [
          { id: 'implementer', kind: 'agent', label: 'Implement', agent: 'implementer' },
          { id: 'g1', kind: 'script_gate', label: 'Gate G1', run: { builtin: 'g1' } },
          { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
        ],
      },
    });

    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.test.ts' }]);
    await rig.tick();
    await writerDone(rig, 'run-2', [{ kind: 'edited', path: 'src/a.ts' }]);
    await rig.tick();

    expect(await snapshotOf(rig, id)).toEqual(first);
    // The reviewer the ticket was promised still runs.
    const agents = await Promise.all(
      runIds(rig).map(
        async (r) => (await rig.storage.transaction((tx) => tx.runs.get(r)))?.agent_id,
      ),
    );

    expect(agents).toEqual(['test-writer', 'implementer', 'reviewer']);
  });

  it('stops a ticket at its first dispatch, with the reason, when a stage agent is archived', async () => {
    const v = await makePipelineRig();
    const { rig } = v;
    await rig.config.append({
      scope: 'company',
      doc: { agents: { reviewer: { archived: true } } },
      author: 'test',
      reason: 'archive the reviewer',
      expectedVersion: 0,
    });

    const id = await rig.request('Fix the doctor check');
    await rig.tick();

    const t = await rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toContain('cannot run');
    expect(t.blocked_reason).toContain('disabled or archived');
    expect(rig.driver.starts).toEqual([]);
    expect(await snapshotOf(rig, id)).toBeNull();
  });

  it('never makes a check run the assignee or resume a writer session', async () => {
    const v = await makePipelineRig();
    const { rig } = v;
    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    await writerDone(rig, 'run-1');
    await rig.tick();
    await writerDone(rig, 'run-2');
    await rig.tick();

    const reviewer = rig.driver.starts.at(-1)!;
    expect(reviewer.resume).toBeUndefined();
    expect(await rig.ticket(id)).toMatchObject({ assignee_run_id: 'run-2' });
    const run = await rig.storage.transaction((tx) => tx.runs.get(reviewer.runId));

    expect(run?.retry_of).toBeUndefined();
    await reviewDone(rig, reviewer.runId, review('pass'));
    await rig.tick();
    expect(
      (await stageRows(rig, id)).find((r) => r.stage_id === 'reviewer')?.run_id,
    ).toBe(reviewer.runId);
  });
});

describe('routing at the snapshot', () => {
  it('adds a check for the plan files a rule matches, once, before merge', async () => {
    const rig = await planningRig();
    const plan = oneTicketPlan(['infra/main.tf']);
    (plan['tickets'] as { lane: string }[])[0]!.lane = 'standard';
    scriptTodo(rig, { write_plan: [plan] });
    await setProjectPipelines(rig, {
      routing: [
        { id: 'net', paths: ['**/*.tf'], add: 'critic', label: 'Network review' },
      ],
    });

    const card = await planUntilDecision(rig);
    await rig.tick();

    const [ticket] = await tickets(rig, card);
    const snap = await snapshotOf(rig, ticket!.id);

    expect(snap?.routed).toEqual([
      { rule_id: 'net', agent: 'critic', stage_id: 'route-net', at: 'snapshot' },
    ]);

    expect(snap?.definition.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer',
      'route-net',
      'merge',
    ]);
  });
});

describe('tickets that were already past their writers', () => {
  it('adopts the writer of a verifying ticket from before pipelines and finishes it', async () => {
    const { rig, host } = await makeVerifyRig({ tier: 'A' });
    const now = new Date(rig.clock.now()).toISOString();
    await rig.storage.transaction(async (tx) => {
      await tx.tickets.insert({
        id: 'FG-7' as Ticket['id'],
        project: 'forge',
        title: 'Legacy ticket',
        body: 'Already written',
        type: 'fix',
        lane: 'express',
        tier_predicted: 'A',
        status: 'verifying',
        status_version: 5,
        rework_count: 0,
        priority: 0,
        assignee_run_id: 'legacy-run',
        branch: 'fix/FG-7-legacy',
        worktree: '/repo/.worktrees/FG-7',
        created_at: now,
        updated_at: now,
        blocked_by: [],
      });

      await tx.runs.insert({
        id: 'legacy-run',
        ticket_id: 'FG-7',
        project: 'forge',
        harness: 'scripted',
        driver_version: 'unversioned',
        cwd: '/repo/.worktrees/FG-7',
        lane: 'express',
        started_at: now,
        ended_at: now,
        status: 'success',
        owner: 'srv-a',
      });

      await tx.runEvents.append('legacy-run', {
        type: 'finish',
        ts: now,
        summary: 'done',
        structured: { claims: [{ kind: 'edited', path: 'src/a.ts' }] },
      });
    });

    await rig.tick();

    expect(await rig.ticket('FG-7')).toMatchObject({ status: 'done' });
    expect(host.count('merge')).toBe(1);
    const rows = await stageRows(rig, 'FG-7');
    expect(rows.map((r) => [r.stage_id, r.status])).toEqual([
      ['implementer', 'adopted'],
      ['g1', 'passed'],
    ]);
  });
});

describe('a lane raised after the ticket started', () => {
  it('takes the heavier list at the next stage boundary and adopts the writers it is past', async () => {
    const { rig } = await makeVerifyRig({ tier: 'A' });
    const id = await startAndFinish(rig, [{ kind: 'edited', path: 'src/a.ts' }]);
    const t = await rig.ticket(id);
    // The run finished but its outcome is not applied yet; the lane is raised first.
    await rig.storage.transaction((tx) =>
      tx.tickets.updateTicketCas(t.id, t.status_version, { lane: 'standard' }),
    );

    await rig.tick();

    const snap = await snapshotOf(rig, id);
    expect(snap?.lane).toBe('standard');
    expect(snap?.definition.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer',
      'merge',
    ]);

    const rows = await stageRows(rig, id);
    expect(rows.find((r) => r.stage_id === 'implementer')?.status).toBe('passed');
    expect(rows.find((r) => r.stage_id === 'test-writer')?.status).toBe('adopted');
    // The reviewer of the heavier lane now runs before the merge, so nothing merged yet.
    expect(await rig.ticket(id)).toMatchObject({ status: 'verifying' });
    const last = rig.driver.starts.at(-1)!;

    expect(
      (await rig.storage.transaction((tx) => tx.runs.get(last.runId)))?.agent_id,
    ).toBe('reviewer');
  });
});
