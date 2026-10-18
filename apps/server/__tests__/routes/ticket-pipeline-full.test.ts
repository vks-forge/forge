/**
 * The ticket strip for the Full lane: the Director check, the sign-off, overrides, writer members.
 *
 * Why: the owner reads the strip to see how far a Full ticket got and why it is waiting, so each chip
 *   must carry what the owner would otherwise have to open: the current round's findings with file,
 *   line and evidence (capped), the Director check's acceptance verdicts and the files outside the
 *   plan, who signed (the Director, or the owner), an owner override on a held stage, the
 *   same-family warning on a critic, and the write scope of each member of a writer group. A stage
 *   that is not there yet reads pending, and the new kinds must come through as such.
 *
 * Pins: stage kinds `director_check` and `sign_off`; `findings` with file, line and evidence (the cap of twenty is pinned in core);
 *   `warnings` on a same-family critic; `check` and `unplanned` on the Director check; `signed_by`
 *   and `override` on their rows; `scope` on writer-group members only.
 * Depends on: helpers/agent-rig. IO: a loopback socket and in-memory storage.
 */

import {
  BUILTIN_PIPELINES,
  SAME_FAMILY_WARNING,
  makeTicketId,
  pipelineHash,
} from '@forge/core';
import type { PipelineDefinition, Ticket, TicketPipelineView } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;

const NOW = '2026-10-18T12:00:00.000Z';

const ticket = (n: number): Ticket => ({
  id: makeTicketId('DM', n),
  project: 'demo',
  title: `Ticket ${n}`,
  body: 'body',
  type: 'feat',
  lane: 'full',
  tier_predicted: 'A',
  status: 'verifying',
  status_version: 1,
  rework_count: 0,
  priority: 0,
  created_at: NOW,
  updated_at: NOW,
  blocked_by: [],
});

const ROLES = {
  'test-writer': 'tester',
  implementer: 'writer',
  reviewer: 'reviewer',
  critic: 'reviewer',
} as const;

type Row = {
  stage: string;
  member?: string;
  kind: 'agent' | 'script_gate' | 'director' | 'human';
  status: 'passed' | 'waiting' | 'running';
  agent?: string;
  outcome?: Record<string, unknown>;
};

async function seedFull(rows: Row[]): Promise<void> {
  await rig.storage.transaction(async (tx) => {
    await tx.tickets.insert(ticket(1));
    await tx.ticketPipelines.insert({
      ticket_id: 'DM-1' as Ticket['id'],
      lane: 'full',
      definition: BUILTIN_PIPELINES.full,
      roles: ROLES,
      hash: pipelineHash(BUILTIN_PIPELINES.full),
      config_version: 'c0:p0',
      routed: [],
      created_at: NOW,
      updated_at: NOW,
    });

    for (const r of rows) {
      await tx.stageRuns.start({
        ticket_id: 'DM-1' as Ticket['id'],
        stage_id: r.stage,
        member_id: r.member ?? '',
        cycle: 0,
        kind: r.kind,
        ...(r.agent ? { agent_id: r.agent } : {}),
        status: r.status,
        outcome: (r.outcome ?? {}) as never,
        started_at: NOW,
      });
    }
  });
}

const view = async (): Promise<TicketPipelineView> =>
  (
    (await rig.http.json('GET', '/tickets/DM-1/pipeline')).body as {
      pipeline: TicketPipelineView;
    }
  ).pipeline;

const HIGH = {
  severity: 'high',
  file: 'src/a.ts',
  line: 12,
  issue: 'the null case is not handled',
  evidence: 'src/a.ts:12 runs when x is null',
};

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('the Full strip', () => {
  it('shows the new kinds as pending before they run, and the findings of a finished check with place and evidence', async () => {
    await seedFull([
      { stage: 'g1', kind: 'script_gate', status: 'passed' },
      {
        stage: 'review-group',
        member: 'review',
        kind: 'agent',
        agent: 'reviewer',
        status: 'passed',
        outcome: {
          review: { verdict: 'pass', summary: 'ok', findings: [HIGH] },
          blocking: 1,
        },
      },
    ]);

    const strip = await view();
    const byId = new Map(strip.stages.map((s) => [s.id, s]));

    expect(strip.stages.map((s) => s.kind)).toEqual([
      'agent',
      'agent',
      'script_gate',
      'group',
      'director_check',
      'sign_off',
      'merge',
    ]);

    expect(byId.get('check-plan')).toMatchObject({ status: 'pending', warnings: [] });
    expect(byId.get('sign-off')).toMatchObject({ status: 'pending', warnings: [] });
    const review = byId.get('review-group')?.members?.find((m) => m.id === 'review');

    expect(review?.findings).toEqual([HIGH]);
    expect(review?.counts).toMatchObject({ high: 1 });
  });

  it('carries the acceptance checklist and the unplanned files on the Director check, and who signed', async () => {
    const check = {
      verdict: 'pass',
      summary: 'Meets the plan.',
      acceptance: [{ criterion: 'lists tickets', met: 'yes', evidence: 'a.ts:1' }],
      findings: [],
      confidence: 0.9,
    };

    await seedFull([
      {
        stage: 'check-plan',
        kind: 'director',
        status: 'passed',
        outcome: { check, unplanned: ['src/other.ts'] },
      },
      {
        stage: 'sign-off',
        kind: 'director',
        status: 'passed',
        outcome: { signed_by: 'director', sign_reason: 'Tier A; every check passed.' },
      },
    ]);

    const byId = new Map((await view()).stages.map((s) => [s.id, s]));

    expect(byId.get('check-plan')).toMatchObject({
      kind: 'director_check',
      status: 'passed',
      check,
      unplanned: ['src/other.ts'],
    });

    expect(byId.get('sign-off')).toMatchObject({
      kind: 'sign_off',
      status: 'passed',
      signed_by: 'director',
      summary: 'Tier A; every check passed.',
    });
  });

  it('shows an owner override on a held stage and waiting for the owner on the sign-off', async () => {
    const override = {
      by: 'owner',
      action: 'merge_anyway',
      comment: 'handled upstream',
      at: NOW,
    };

    await seedFull([
      {
        stage: 'review-group',
        member: 'critique',
        kind: 'agent',
        agent: 'critic',
        status: 'passed',
        outcome: { override, same_family: true },
      },
      {
        stage: 'sign-off',
        kind: 'human',
        status: 'waiting',
        outcome: { note: 'waiting' },
      },
    ]);

    const byId = new Map((await view()).stages.map((s) => [s.id, s]));
    const critique = byId.get('review-group')?.members?.find((m) => m.id === 'critique');

    expect(critique).toMatchObject({ status: 'passed', override });
    expect(critique?.warnings).toEqual([SAME_FAMILY_WARNING]);
    expect(byId.get('sign-off')).toMatchObject({ status: 'waiting' });
    expect(byId.get('sign-off')?.signed_by).toBeUndefined();
  });
});

describe('writer groups on the strip', () => {
  it('gives each writer member its write scope, and no scope to a lone stage', async () => {
    const fe = (
      await rig.http.json('POST', '/settings/agents', {
        agent: agentBody({ name: 'Frontend', write_scope: ['apps/web/**'] }),
        origin: 'custom',
        expected_version: 0,
        reason: 'writer',
      })
    ).body as { id: string };

    const be = (
      await rig.http.json('POST', '/settings/agents', {
        agent: agentBody({ name: 'Backend', write_scope: ['packages/**'] }),
        origin: 'custom',
        expected_version: 1,
        reason: 'writer',
      })
    ).body as { id: string };

    const def: PipelineDefinition = {
      stages: [
        {
          id: 'writers',
          kind: 'group' as const,
          label: 'Writers',
          join: 'all' as const,
          members: [
            { id: 'fe', kind: 'agent' as const, label: 'Frontend', agent: fe.id },
            { id: 'be', kind: 'agent' as const, label: 'Backend', agent: be.id },
          ],
        },
        {
          id: 'g1',
          kind: 'script_gate' as const,
          label: 'G1',
          run: { builtin: 'g1' as const },
        },
        { id: 'merge', kind: 'merge' as const, label: 'Merge', locked: true as const },
      ],
    };

    await rig.storage.transaction(async (tx) => {
      await tx.tickets.insert(ticket(1));
      await tx.ticketPipelines.insert({
        ticket_id: 'DM-1' as Ticket['id'],
        lane: 'full',
        definition: def,
        roles: { [fe.id]: 'writer', [be.id]: 'writer' },
        hash: pipelineHash(def),
        config_version: 'c0:p0',
        routed: [],
        created_at: NOW,
        updated_at: NOW,
      });
    });

    const strip = await view();
    const group = strip.stages.find((s) => s.id === 'writers');

    expect(group?.members?.map((m) => [m.id, m.scope])).toEqual([
      ['fe', ['apps/web/**']],
      ['be', ['packages/**']],
    ]);

    expect(strip.stages.find((s) => s.id === 'g1')?.scope).toBeUndefined();
  });
});
