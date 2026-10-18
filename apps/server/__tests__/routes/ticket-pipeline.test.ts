/**
 * The ticket's pipeline strip and artifacts.
 *
 * Why: the Ticket page draws where a ticket is in its lane pipeline from stored rows and lets the
 *   owner open a stage's artifacts, including the Worker's own narrative that reviewers never
 *   see. The strip must be null before the first dispatch (nothing to draw), must roll the rows
 *   up the way the engine reads them (a failed attempt and the rework after it), and an artifact
 *   must only ever be readable through its own ticket.
 *
 * Pins: 404 ticket_not_found; `{ pipeline: null }` before a snapshot; a populated strip with
 *   agent names, statuses (the passed rework attempt, not the failed first one), finding counts, artifacts and the rework count; artifact fetch with
 *   content; 404 artifact_not_found for an unknown id, a bad id and another ticket's artifact.
 * Depends on: helpers/agent-rig. IO: a loopback socket and in-memory storage.
 */

import { BUILTIN_PIPELINES, makeTicketId, pipelineHash } from '@forge/core';
import type { Ticket, TicketPipelineView } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;

const NOW = '2026-10-17T12:00:00.000Z';
const call = (path: string) => rig.http.json('GET', path);
const errorOf = (r: { body: unknown }) => (r.body as { error: { code: string } }).error;

const ticket = (n: number): Ticket => ({
  id: makeTicketId('DM', n),
  project: 'demo',
  title: `Ticket ${n}`,
  body: 'body',
  type: 'feat',
  lane: 'standard',
  tier_predicted: 'A',
  status: 'verifying',
  status_version: 1,
  rework_count: 1,
  priority: 0,
  created_at: NOW,
  updated_at: NOW,
  blocked_by: [],
});

/** Seeds DM-1 with a Standard snapshot, a passed tester, a failed review and a rework cycle. */
async function seed(): Promise<{ artifact: number }> {
  return rig.storage.transaction(async (tx) => {
    await tx.tickets.insert(ticket(1));
    await tx.tickets.insert(ticket(2));
    await tx.ticketPipelines.insert({
      ticket_id: 'DM-1' as Ticket['id'],
      lane: 'standard',
      definition: BUILTIN_PIPELINES.standard,
      roles: {
        'test-writer': 'tester',
        implementer: 'writer',
        reviewer: 'reviewer',
      },
      hash: pipelineHash(BUILTIN_PIPELINES.standard),
      base_hash: pipelineHash(BUILTIN_PIPELINES.standard),
      config_version: 'c0:p0',
      routed: [],
      adjustments: [],
      created_at: NOW,
      updated_at: NOW,
    });

    const row = (
      stage: string,
      cycle: number,
      status: 'passed' | 'failed',
      agentId?: string,
    ) =>
      tx.stageRuns.start({
        ticket_id: 'DM-1' as Ticket['id'],
        stage_id: stage,
        member_id: '',
        cycle,
        kind: agentId ? 'agent' : 'script_gate',
        ...(agentId ? { agent_id: agentId } : {}),
        status,
        outcome:
          stage === 'reviewer'
            ? {
                review: {
                  verdict: 'pass',
                  summary: 'Two notes.',
                  findings: [
                    { severity: 'medium', issue: 'x', evidence: 'y' },
                    { severity: 'low', issue: 'z', evidence: 'w' },
                  ],
                },
              }
            : {},
        started_at: NOW,
      });

    await row('test-writer', 0, 'passed', 'test-writer');
    await row('implementer', 0, 'passed', 'implementer');
    await row('g1', 0, 'passed');
    await row('reviewer', 0, 'failed', 'reviewer');
    // The rework: the implementer, G1 and the reviewer ran again in cycle 1 (the test-writer did not).
    await row('implementer', 1, 'passed', 'implementer');
    await row('g1', 1, 'passed');
    const review = await row('reviewer', 1, 'passed', 'reviewer');
    const artifact = await tx.stageArtifacts.add({
      ticket_id: 'DM-1' as Ticket['id'],
      stage_run_id: review as number,
      kind: 'narrative',
      content: 'I did it my way',
      truncated: false,
      sha256: 'a'.repeat(64),
      created_at: NOW,
    });

    return { artifact: artifact.id };
  });
}

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('GET /tickets/:id/pipeline', () => {
  it('answers 404 ticket_not_found for a ticket that does not exist', async () => {
    const res = await call('/tickets/DM-9/pipeline');

    expect([res.status, errorOf(res).code]).toEqual([404, 'ticket_not_found']);
  });

  it('answers null before the ticket is first dispatched', async () => {
    await seed();
    const res = await call('/tickets/DM-2/pipeline');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pipeline: null });
  });

  it('rolls the stage rows up into the strip', async () => {
    await seed();
    const res = await call('/tickets/DM-1/pipeline');
    const { pipeline } = res.body as { pipeline: TicketPipelineView };
    const by = Object.fromEntries(pipeline.stages.map((s) => [s.id, s]));

    expect(res.status).toBe(200);
    expect(pipeline.lane).toBe('standard');
    expect(pipeline.rework).toEqual({ count: 1, cap: 2 });
    expect(pipeline.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer',
      'merge',
    ]);

    expect(by['test-writer']?.status).toBe('passed');
    expect(by['test-writer']?.agent).toEqual({ id: 'test-writer', name: 'Test writer' });
    expect(by['reviewer']?.status).toBe('passed');
    expect(by['reviewer']?.cycle).toBe(1);
    expect(by['reviewer']?.counts).toMatchObject({ medium: 1, low: 1 });
    expect(by['reviewer']?.artifacts).toHaveLength(1);
    expect(by['merge']?.status).toBe('pending');
  });
});

describe('GET /tickets/:id/artifacts/:artifactId', () => {
  it('returns the artifact with its content', async () => {
    const { artifact } = await seed();
    const res = await call(`/tickets/DM-1/artifacts/${artifact}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: artifact,
      kind: 'narrative',
      content: 'I did it my way',
    });
  });

  it('answers 404 artifact_not_found for an unknown id, a bad id and another ticket', async () => {
    const { artifact } = await seed();
    const unknown = await call('/tickets/DM-1/artifacts/999');
    const bad = await call('/tickets/DM-1/artifacts/abc');
    const other = await call(`/tickets/DM-2/artifacts/${artifact}`);
    const ticketless = await call(`/tickets/DM-9/artifacts/${artifact}`);

    expect([unknown, bad, other].map((r) => [r.status, errorOf(r).code])).toEqual([
      [404, 'artifact_not_found'],
      [404, 'artifact_not_found'],
      [404, 'artifact_not_found'],
    ]);

    expect([ticketless.status, errorOf(ticketless).code]).toEqual([
      404,
      'ticket_not_found',
    ]);
  });
});
