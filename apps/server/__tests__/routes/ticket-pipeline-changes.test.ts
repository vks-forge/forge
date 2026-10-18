/**
 * What the ticket's strip says about the Director's changes and about the run that really happened.
 *
 * Why: the owner approved a plan that said "add a critic, drop the second reviewer", and a stage may later have run on a
 *   fallback model. The strip tells what the Director changed in the ticket's own pipeline (an added stage with its
 *   reason, a removed one as a ghost, a swapped agent with its cause) and which harness, model and fallback slot a
 *   stage's run really used, so nothing the Director or a fallback did is hidden.
 *
 * Pins: GET shows `changed`, `removed`, `adjustments` (applied and dropped), `base_hash` and `ran_on`.
 * Depends on: helpers/agent-rig. IO: a loopback socket and in-memory storage.
 */

import { BUILTIN_PIPELINES, makeTicketId, pipelineHash } from '@forge/core';
import type { PipelineAdjustment, Ticket, TicketPipelineView } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;

const AT = '2026-10-18T09:00:00.000Z';
const strip = (r: { body: unknown }): TicketPipelineView =>
  (r.body as { pipeline: TicketPipelineView }).pipeline;

const ticket = (n: number): Ticket => ({
  id: makeTicketId('DM', n),
  project: 'demo',
  title: `Ticket ${n}`,
  body: 'b',
  type: 'feat',
  lane: 'standard',
  tier_predicted: 'A',
  status: 'verifying',
  status_version: 1,
  rework_count: 0,
  priority: 0,
  created_at: AT,
  updated_at: AT,
  blocked_by: [],
});

const snapshot = (
  n: number,
  stages = BUILTIN_PIPELINES.standard.stages,
  adjustments: PipelineAdjustment[] = [],
) => ({
  ticket_id: makeTicketId('DM', n),
  lane: 'standard' as const,
  definition: { stages },
  roles: {
    'test-writer': 'tester' as const,
    implementer: 'writer' as const,
    reviewer: 'reviewer' as const,
    critic: 'reviewer' as const,
  },
  hash: pipelineHash({ stages }),
  base_hash: pipelineHash(BUILTIN_PIPELINES.standard),
  config_version: 'c0:p0',
  routed: [],
  adjustments,
  created_at: AT,
  updated_at: AT,
});

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('GET /tickets/:id/pipeline after the Director changed it', () => {
  it('shows the added stage with its reason, the removed one as a ghost, the log and the base hash', async () => {
    const stages = [
      ...BUILTIN_PIPELINES.standard.stages.filter((s) => s.id !== 'reviewer'),
    ];

    stages.splice(3, 0, {
      id: 'dir-critic',
      kind: 'agent',
      label: 'Critique',
      agent: 'critic',
    });

    const log: PipelineAdjustment[] = [
      {
        seq: 0,
        op: {
          op: 'add',
          stage: { id: 'dir-critic', kind: 'agent', label: 'Critique', agent: 'critic' },
          after: 'g1',
          reason: 'The change touches the session token check.',
        },
        by: 'director',
        cause: 'plan',
        key: 'standard:add:critic@after:g1',
        status: 'applied',
        plan_version: 1,
        at: AT,
      },
      {
        seq: 1,
        op: {
          op: 'remove',
          stage_id: 'reviewer',
          reason: 'The critic covers the review here.',
        },
        by: 'director',
        cause: 'plan',
        key: 'standard:remove:reviewer',
        status: 'applied',
        at: AT,
      },
      {
        seq: 2,
        op: { op: 'remove', stage_id: 'g1', reason: 'Skip the gate to save time.' },
        by: 'director',
        cause: 'plan',
        key: 'standard:remove:g1',
        status: 'dropped',
        problem: 'G1 is locked',
        at: AT,
      },
    ];

    await rig.storage.transaction(async (tx) => {
      await tx.tickets.insert(ticket(1));
      await tx.ticketPipelines.insert(snapshot(1, stages, log));
    });

    const res = await rig.http.json('GET', '/tickets/DM-1/pipeline');
    const view = strip(res);

    expect(view.stages.find((s) => s.id === 'dir-critic')?.changed).toEqual({
      by: 'director',
      op: 'add',
      cause: 'plan',
      reason: 'The change touches the session token check.',
    });

    expect(view.removed).toEqual([
      { id: 'reviewer', label: 'Reviewer', reason: 'The critic covers the review here.' },
    ]);

    expect(view.adjustments.map((a) => a.status)).toEqual([
      'applied',
      'applied',
      'dropped',
    ]);

    expect(view.base_hash).toBe(pipelineHash(BUILTIN_PIPELINES.standard));
    expect(view.hash).not.toBe(view.base_hash);
  });

  it('shows which harness, model and fallback slot the stage really ran on', async () => {
    await rig.storage.transaction(async (tx) => {
      await tx.tickets.insert(ticket(1));
      await tx.ticketPipelines.insert(snapshot(1));
      await tx.runs.insert({
        id: 'run-1',
        ticket_id: 'DM-1',
        project: 'demo',
        harness: 'codex',
        model: 'gpt-5-mini',
        fallback_slot: 2,
        driver_version: '1',
        cwd: '/w',
        lane: 'standard',
        started_at: AT,
        status: 'success',
        owner: 'srv',
      });

      await tx.stageRuns.start({
        ticket_id: makeTicketId('DM', 1),
        stage_id: 'implementer',
        member_id: '',
        cycle: 0,
        kind: 'agent',
        agent_id: 'implementer',
        run_id: 'run-1',
        status: 'passed',
        started_at: AT,
      });
    });

    const view = strip(await rig.http.json('GET', '/tickets/DM-1/pipeline'));

    expect(view.stages.find((s) => s.id === 'implementer')?.ran_on).toEqual({
      harness: 'codex',
      model: 'gpt-5-mini',
      slot: 2,
    });
  });
});
