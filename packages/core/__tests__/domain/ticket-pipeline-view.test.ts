/**
 * Pins the strip the ticket page draws: one chip per stage, rolled up from the stage rows.
 *
 * Why: the owner reads a ticket's progress from this view, so it must show the attempt that
 *   matters now: the current cycle's, or the earlier pass that still stands. A stage that the
 *   current rework cycle has not reached again must read as pending, except the failed attempt
 *   that sent work back, which stays visible so the owner sees why the ticket is back. A group must roll its members up, findings must be counted by severity, and the
 *   artifact list must carry only ids and kinds so the strip stays small.
 *
 * Pins: pending for stages with no row; passed and running chips with agent names, run ids and
 *   times; a failed reviewer with finding counts and its summary; after a rework the restarted
 *   stages read pending, the failed one stays visible and the earlier test-writer stays passed; a group's roll-up (failed
 *   outranks running outranks waiting, all passed is passed); merge reads passed only when the
 *   ticket is done; the rework count and cap; routed stages pass through; artifact ids by stage.
 * Depends on: src/domain/{ticket-pipeline-view,builtin-pipelines,effective-agents,builtin-agents}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { effectiveAgents } from '#/domain/effective-agents.js';
import { ticketPipelineView } from '#/domain/ticket-pipeline-view.js';
import type { StageRun, TicketPipeline } from '#/schemas/stage-run.js';
import type { TicketId } from '#/schemas/ids.js';

const T = '2026-10-13T00:00:00.000Z';
const roster = effectiveAgents({ ...BUILTIN_AGENTS }, undefined, () => ({
  ready: true,
  reasons: [],
}));

const roles = {
  implementer: 'writer',
  'test-writer': 'tester',
  reviewer: 'reviewer',
  critic: 'reviewer',
} as const;

const snapshot = (
  lane: 'standard' | 'full',
  routed: TicketPipeline['routed'] = [],
): TicketPipeline => ({
  ticket_id: 'FG-1' as TicketId,
  lane,
  definition: BUILTIN_PIPELINES[lane],
  roles,
  hash: 'a'.repeat(64),
  config_version: 'c1:p1',
  routed,
  created_at: T,
  updated_at: T,
});

let n = 0;
const row = (
  stage_id: string,
  status: StageRun['status'],
  over: Partial<StageRun> = {},
): StageRun => ({
  id: ++n,
  ticket_id: 'FG-1' as TicketId,
  stage_id,
  member_id: '',
  cycle: 0,
  kind: 'agent',
  status,
  outcome: {},
  started_at: T,
  ...over,
});

const view = (
  snap: TicketPipeline,
  rows: StageRun[],
  ticket: { rework_count: number; status: 'verifying' | 'done' | 'in_progress' } = {
    rework_count: 0,
    status: 'verifying',
  },
  artifacts: { id: number; stage_run_id: number; kind: 'diff' | 'narrative' }[] = [],
) => ticketPipelineView(snap, rows, artifacts, ticket, roster);

const statuses = (v: ReturnType<typeof view>): Record<string, string> =>
  Object.fromEntries(v.stages.map((s) => [s.id, s.status]));

describe('ticketPipelineView', () => {
  it('reads every stage as pending before the first dispatch', () => {
    const v = view(snapshot('standard'), []);

    expect(v.lane).toBe('standard');
    expect(v.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer',
      'merge',
    ]);

    expect(Object.values(statuses(v))).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);

    expect(v.rework).toEqual({ count: 0, cap: 2 });
  });

  it('shows passed and running stages with the agent, run and times', () => {
    const v = view(snapshot('standard'), [
      row('test-writer', 'passed', {
        agent_id: 'test-writer',
        run_id: 'run-1',
        ended_at: T,
      }),
      row('implementer', 'running', { agent_id: 'implementer', run_id: 'run-2' }),
    ]);

    expect(statuses(v)).toMatchObject({
      'test-writer': 'passed',
      implementer: 'running',
      g1: 'pending',
    });

    expect(v.stages[0]).toMatchObject({
      agent: { id: 'test-writer', name: 'Test writer' },
      run_id: 'run-1',
      started_at: T,
      ended_at: T,
    });
  });

  it("counts a failed reviewer's findings by severity and carries its summary", () => {
    const v = view(snapshot('standard'), [
      row('reviewer', 'failed', {
        outcome: {
          review: {
            verdict: 'changes',
            summary: 'two real problems',
            findings: [
              { severity: 'high', issue: 'a', evidence: 'e' },
              { severity: 'high', issue: 'b', evidence: 'e' },
              { severity: 'low', issue: 'c', evidence: 'e' },
            ],
          },
          blocking: 2,
        },
      }),
    ]);

    const reviewer = v.stages.find((s) => s.id === 'reviewer');

    expect(reviewer).toMatchObject({ status: 'failed', summary: 'two real problems' });
    expect(reviewer?.counts).toEqual({ critical: 0, high: 2, medium: 0, low: 1 });
  });

  it('after a rework the restarted stages read pending, the failure that caused it stays visible and the earlier writer stays passed', () => {
    const v = view(
      snapshot('standard'),
      [
        row('test-writer', 'passed'),
        row('implementer', 'passed'),
        row('g1', 'passed', { kind: 'script_gate' }),
        row('reviewer', 'failed'),
        row('implementer', 'running', { cycle: 1 }),
      ],
      { rework_count: 1, status: 'in_progress' },
    );

    expect(statuses(v)).toMatchObject({
      'test-writer': 'passed',
      implementer: 'running',
      g1: 'pending',
      reviewer: 'failed',
    });

    expect(v.rework).toEqual({ count: 1, cap: 2 });
  });

  it('rolls a group up from its members', () => {
    const grouped = (a: StageRun['status'], b: StageRun['status']) =>
      view(snapshot('full'), [
        row('review-group', a, { member_id: 'review' }),
        row('review-group', b, { member_id: 'critique' }),
      ]).stages.find((s) => s.id === 'review-group');

    expect(grouped('passed', 'passed')?.status).toBe('passed');
    expect(grouped('passed', 'running')?.status).toBe('running');
    expect(grouped('failed', 'running')?.status).toBe('failed');
    expect(grouped('waiting', 'passed')?.status).toBe('waiting');
    expect(grouped('adopted', 'adopted')?.status).toBe('adopted');
    expect(grouped('passed', 'passed')?.members?.map((m) => m.id)).toEqual([
      'review',
      'critique',
    ]);

    expect(
      view(snapshot('full'), []).stages.find((s) => s.id === 'review-group')?.status,
    ).toBe('pending');
  });

  it('shows merge passed only when the ticket is done', () => {
    expect(
      view(snapshot('standard'), [], { rework_count: 0, status: 'done' }).stages.at(-1)
        ?.status,
    ).toBe('passed');

    expect(view(snapshot('standard'), []).stages.at(-1)?.status).toBe('pending');
  });

  it('passes routed stages through and lists artifact ids and kinds per stage', () => {
    const routed = [
      { rule_id: 'net', agent: 'critic', stage_id: 'route-net', at: 'diff' as const },
    ];

    const implementer = row('implementer', 'passed');
    const v = view(
      snapshot('standard', routed),
      [implementer],
      { rework_count: 0, status: 'verifying' },
      [
        { id: 7, stage_run_id: implementer.id, kind: 'diff' },
        { id: 8, stage_run_id: implementer.id, kind: 'narrative' },
        { id: 9, stage_run_id: 9999, kind: 'diff' },
      ],
    );

    expect(v.routed).toEqual(routed);
    expect(v.stages.find((s) => s.id === 'implementer')?.artifacts).toEqual([
      { id: 7, kind: 'diff' },
      { id: 8, kind: 'narrative' },
    ]);
  });
});
