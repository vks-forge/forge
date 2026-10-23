/**
 * The project's scorecards over seeded rows.
 *
 * Why: the owner reads these numbers to decide whom to trust with a stage, and the Director reads the same ones
 *   (d-0081), so each figure has to follow from the rows: a writer's clean rate counts finished tickets with no
 *   rework, a check's pass rate counts verdicts that passed the first time, the owner's mark on a finding beats
 *   anything derived, a finding the owner merged anyway counts as overruled, a run with no recorded cost widens the
 *   coverage gap instead of being priced, a card on fewer than five tickets says so, and `agent` narrows the reply to one
 *   agent. Nothing here changes anything.
 *
 * Pins: Done-when 9 (clean rate, pass rate, reworks, cost coverage, findings counts, an owner mark beating the
 *   derived verdict, merge_anyway counted overruled, under 5 tickets reads insufficient, filter by agent) and the
 *   errors: 400 invalid_request, 404 project_not_found and agent_not_found.
 * Depends on: helpers/agent-rig. IO: a loopback socket, in-memory storage.
 */

import { BUILTIN_PIPELINES, makeTicketId, pipelineHash } from '@forge/core';
import type { ScorecardReply, StageOutcome, Ticket } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;
const AT = '2026-10-15T12:00:00.000Z'; // 2 days before agent-rig's fixed clock, never the real date
const errorOf = (r: { body: unknown }) => (r.body as { error: { code: string } }).error;
const get = (path: string) => rig.http.json('GET', path);
const card = (reply: ScorecardReply, id: string, by = 'all', value?: string) =>
  reply.agents
    .find((a) => a.agent_id === id)
    ?.rows.find((r) => r.by === by && r.value === value);

const ticket = (n: number, rework: number): Ticket => ({
  id: makeTicketId('DM', n),
  project: 'demo',
  title: `Ticket ${n}`,
  body: 'b',
  type: 'feat',
  lane: 'standard',
  tier_predicted: 'A',
  status: 'done',
  status_version: 1,
  rework_count: rework,
  priority: 0,
  created_at: AT,
  updated_at: AT,
  blocked_by: [],
});

const reviewOf = (...severities: ('high' | 'medium' | 'low')[]): StageOutcome => ({
  review: {
    verdict: severities.length > 0 ? 'changes' : 'pass',
    summary: 'reviewed',
    findings: severities.map((severity, i) => ({
      severity,
      issue: `issue ${i}`,
      evidence: 'seen',
    })),
  },
});

/** Six finished tickets: four clean, one reworked twice (a failed review then a pass), one overruled. */
async function seed(): Promise<{ failedRow: number }> {
  return rig.storage.transaction(async (tx) => {
    const reworks = [0, 0, 0, 0, 2, 1];
    let failedRow = 0;
    for (const [i, rework] of reworks.entries()) {
      const n = i + 1;
      const id = makeTicketId('DM', n);
      await tx.tickets.insert(ticket(n, rework));
      await tx.ticketPipelines.insert({
        ticket_id: id,
        lane: 'standard',
        definition: BUILTIN_PIPELINES.standard,
        roles: {
          'test-writer': 'tester',
          implementer: 'writer',
          reviewer: 'reviewer',
          critic: 'reviewer',
        },
        hash: pipelineHash(BUILTIN_PIPELINES.standard),
        base_hash: pipelineHash(BUILTIN_PIPELINES.standard),
        config_version: 'c0:p0',
        routed: [],
        adjustments: [],
        created_at: AT,
        updated_at: AT,
      });

      const row = async (
        stage: string,
        agent: string,
        status: 'passed' | 'failed',
        outcome: StageOutcome = {},
        cycle = 0,
      ) =>
        (await tx.stageRuns.start({
          ticket_id: id,
          stage_id: stage,
          member_id: '',
          cycle,
          kind: 'agent',
          agent_id: agent,
          status,
          outcome,
          started_at: AT,
        })) as number;

      await row('implementer', 'implementer', 'passed');
      if (n === 5) {
        failedRow = await row('reviewer', 'reviewer', 'failed', reviewOf('high', 'low'));
        await row('reviewer', 'reviewer', 'passed', reviewOf(), 1);
      } else if (n === 6) {
        await row('reviewer', 'reviewer', 'passed', {
          ...reviewOf('medium'),
          override: {
            by: 'owner',
            action: 'merge_anyway',
            comment: 'known and accepted',
            at: AT,
          },
        });
      } else {
        await row('reviewer', 'reviewer', 'passed', reviewOf());
      }

      if (n === 1) {
        await row('critique', 'critic', 'passed', reviewOf());
      }

      await tx.runs.insert({
        id: `run-${n}`,
        ticket_id: id,
        project: 'demo',
        harness: 'claude-code',
        driver_version: '1',
        cwd: '/w',
        lane: 'standard',
        started_at: AT,
        ended_at: new Date(Date.parse(AT) + 60_000).toISOString(),
        status: 'success',
        owner: 'srv',
        agent_id: 'implementer',
        ...(n === 6 ? {} : { cost_usd: 0.5 }),
      });
    }

    return { failedRow };
  });
}

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('GET /projects/:slug/scorecards', () => {
  it('computes a writer: clean rate, reworks per ticket, cost with its coverage, duration', async () => {
    await seed();
    const res = await get('/projects/demo/scorecards?range=30d');
    const row = card(res.body as ScorecardReply, 'implementer');

    expect(res.status).toBe(200);
    expect((res.body as ScorecardReply).range).toBe('30d');
    expect(row).toMatchObject({
      tickets: 6,
      runs: 6,
      insufficient: false,
      clean_rate: { hits: 4, total: 6 },
      pass_rate: null,
      reworks_per_ticket: 0.5,
      cost: { total_usd: 2.5, per_ticket_usd: 2.5 / 6, coverage: { hits: 5, total: 6 } },
      duration: { count: 6, median_ms: 60_000 },
    });

    expect(row?.findings).toBeUndefined();
  });

  it('computes a check: pass rate, findings, an owner mark beating the derived verdict, merge anyway as overruled', async () => {
    const { failedRow } = await seed();
    const mark = await rig.http.json(
      'PUT',
      `/tickets/DM-5/findings/${failedRow}/0/mark`,
      {
        verdict: 'false_alarm',
      },
    );

    expect(mark.status).toBe(200);
    const res = await get('/projects/demo/scorecards');
    const row = card(res.body as ScorecardReply, 'reviewer');

    expect(row).toMatchObject({
      tickets: 6,
      pass_rate: { hits: 5, total: 6 },
      clean_rate: null,
      overrides: 1,
      holds: 0,
    });

    expect(row?.findings).toEqual({
      by_severity: { critical: 0, high: 1, medium: 1, low: 1 },
      real: 0,
      false_alarm: 1,
      acted_on: 1,
      overruled: 1,
      unjudged: 0,
    });

    // The owner changes their mind: the mark now says real, and the count follows.
    await rig.http.json('PUT', `/tickets/DM-5/findings/${failedRow}/0/mark`, {
      verdict: 'real',
    });

    const again = card(
      (await get('/projects/demo/scorecards')).body as ScorecardReply,
      'reviewer',
    );

    expect(again?.findings).toMatchObject({
      real: 1,
      false_alarm: 0,
      acted_on: 1,
      overruled: 1,
    });

    await rig.http.json('PUT', `/tickets/DM-5/findings/${failedRow}/0/mark`, {
      verdict: null,
    });

    const cleared = card(
      (await get('/projects/demo/scorecards')).body as ScorecardReply,
      'reviewer',
    );

    expect(cleared?.findings).toMatchObject({
      real: 0,
      false_alarm: 0,
      acted_on: 2,
      overruled: 1,
    });
  });

  it('reads fewer than five tickets as insufficient, and slices by type and lane', async () => {
    await seed();
    const reply = (await get('/projects/demo/scorecards')).body as ScorecardReply;

    expect(card(reply, 'critic')).toMatchObject({ tickets: 1, insufficient: true });
    expect(card(reply, 'implementer', 'type', 'feat')?.tickets).toBe(6);
    expect(card(reply, 'implementer', 'lane', 'standard')?.tickets).toBe(6);
    expect(reply.shapes).toHaveLength(1);
    expect(reply.shapes[0]).toMatchObject({
      label: 'Standard',
      director_changed: false,
      lane: 'standard',
    });

    expect(reply.shapes[0]?.rows[0]).toMatchObject({
      tickets: 6,
      clean_rate: { hits: 4, total: 6 },
    });
  });

  it('reads null, not zero, for an agent with no history', async () => {
    const reply = (await get('/projects/demo/scorecards')).body as ScorecardReply;

    expect(card(reply, 'implementer')).toMatchObject({
      tickets: 0,
      insufficient: true,
      clean_rate: null,
      pass_rate: null,
      reworks_per_ticket: null,
      cost: { per_ticket_usd: null },
    });
  });

  it('narrows to one agent', async () => {
    await seed();
    const res = await get('/projects/demo/scorecards?agent=reviewer');
    const reply = res.body as ScorecardReply;

    expect(reply.agents.map((a) => a.agent_id)).toEqual(['reviewer']);
    expect(reply.shapes).toEqual([]);
    expect(reply.range).toBe('90d');
  });

  it('answers 400 for a bad query, 404 for an unknown project and agent', async () => {
    const range = await get('/projects/demo/scorecards?range=7d');
    const agent = await get('/projects/demo/scorecards?agent=ghost');
    const project = await get('/projects/ghost/scorecards');
    const badAgent = await get('/projects/demo/scorecards?agent=Not%20An%20Id');

    expect([range.status, errorOf(range).code]).toEqual([400, 'invalid_request']);
    expect([badAgent.status, errorOf(badAgent).code]).toEqual([400, 'invalid_request']);
    expect([agent.status, errorOf(agent).code]).toEqual([404, 'agent_not_found']);
    expect([project.status, errorOf(project).code]).toEqual([404, 'project_not_found']);
  });
});
