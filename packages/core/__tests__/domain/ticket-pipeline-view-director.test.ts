/**
 * Pins how the ticket's pipeline strip shows what the Director changed and what really ran.
 *
 * Why: the owner approved a plan that said "add a security reviewer, drop the second reviewer", and a stage
 *   may later have run on a fallback model or a substitute agent. If the strip hid any of that the owner
 *   could not tell their own pipeline from the Director's, nor which model wrote the code. An added, swapped
 *   or moved stage carries the change and its reason, a removed stage is listed (not silently gone), and a
 *   stage's run says which harness, model and fallback slot it used.
 *
 * Pins: an added stage with its reason, a removed stage as a ghost, a swapped stage's cause, a swapped group member,
 *   what each stage's run used, and the row id and owner marks of a stage.
 * Depends on: src/domain/{ticket-pipeline-view,builtin-pipelines,effective-agents,builtin-agents}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { effectiveAgents } from '#/domain/effective-agents.js';
import { ticketPipelineView } from '#/domain/ticket-pipeline-view.js';
import type { TicketId } from '#/schemas/ids.js';
import type { PipelineAdjustment } from '#/schemas/pipeline-adjust.js';
import type { StageRun, TicketPipeline } from '#/schemas/stage-run.js';

const T = '2026-10-18T00:00:00.000Z';
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

const adjustment = (
  over: Partial<PipelineAdjustment> & Pick<PipelineAdjustment, 'op'>,
): PipelineAdjustment => ({
  seq: 0,
  by: 'director',
  cause: 'plan',
  key: 'standard:x',
  status: 'applied',
  at: T,
  ...over,
});

const snapshot = (
  adjustments: PipelineAdjustment[],
  stages = BUILTIN_PIPELINES.standard.stages,
): TicketPipeline => ({
  ticket_id: 'FG-1' as TicketId,
  lane: 'standard',
  definition: { stages },
  roles,
  hash: 'a'.repeat(64),
  base_hash: 'b'.repeat(64),
  config_version: 'c1:p1',
  routed: [],
  adjustments,
  created_at: T,
  updated_at: T,
});

const row = (stage_id: string, over: Partial<StageRun> = {}): StageRun => ({
  id: 1,
  ticket_id: 'FG-1' as TicketId,
  stage_id,
  member_id: '',
  cycle: 0,
  kind: 'agent',
  status: 'passed',
  outcome: {},
  started_at: T,
  ...over,
});

const view = (
  s: TicketPipeline,
  rows: StageRun[] = [],
  runs: Parameters<typeof ticketPipelineView>[5] = [],
  marks: Parameters<typeof ticketPipelineView>[6] = [],
) =>
  ticketPipelineView(
    s,
    rows,
    [],
    { rework_count: 0, status: 'verifying' },
    roster,
    runs,
    marks,
  );

describe('ticketPipelineView: Director changes', () => {
  it('marks an added stage with the change, the cause and the reason', () => {
    const stages = [...BUILTIN_PIPELINES.standard.stages];
    stages.splice(3, 0, {
      id: 'dir-sec',
      kind: 'agent',
      label: 'Security',
      agent: 'reviewer',
    });

    const v = view(
      snapshot(
        [
          adjustment({
            op: {
              op: 'add',
              stage: {
                id: 'dir-sec',
                kind: 'agent',
                label: 'Security',
                agent: 'reviewer',
              },
              after: 'g1',
              reason: 'The change touches authentication.',
            },
          }),
        ],
        stages,
      ),
    );

    expect(v.stages.find((s) => s.id === 'dir-sec')?.changed).toEqual({
      by: 'director',
      op: 'add',
      cause: 'plan',
      reason: 'The change touches authentication.',
    });

    expect(v.stages.find((s) => s.id === 'g1')?.changed).toBeUndefined();
    expect(v.base_hash).toBe('b'.repeat(64));
    expect(v.adjustments).toHaveLength(1);
    expect(v.removed).toEqual([]);
  });

  it('lists a removed stage as a ghost with its reason and shows nothing for a dropped op', () => {
    const stages = BUILTIN_PIPELINES.standard.stages.filter((s) => s.id !== 'reviewer');
    const v = view(
      snapshot(
        [
          adjustment({
            op: {
              op: 'remove',
              stage_id: 'reviewer',
              reason: 'A one-line typo fix needs no review.',
            },
          }),
          adjustment({
            seq: 1,
            status: 'dropped',
            problem: 'g1 is locked',
            op: { op: 'remove', stage_id: 'g1', reason: 'Skip the gate to save time.' },
          }),
        ],
        stages,
      ),
    );

    expect(v.removed).toEqual([
      {
        id: 'reviewer',
        label: 'Reviewer',
        reason: 'A one-line typo fix needs no review.',
      },
    ]);

    expect(v.adjustments).toHaveLength(2);
    expect(v.stages.some((s) => s.changed !== undefined)).toBe(false);
  });

  it('marks a swapped stage with its fallback cause', () => {
    const v = view(
      snapshot([
        adjustment({
          cause: 'fallback',
          op: {
            op: 'swap',
            stage_id: 'implementer',
            agent: 'critic',
            reason: 'The implementer could not run.',
          },
        }),
      ]),
    );

    expect(v.stages.find((s) => s.id === 'implementer')?.changed).toMatchObject({
      op: 'swap',
      cause: 'fallback',
    });
  });

  it('marks the swapped member of a group, not the group', () => {
    const v = view(
      snapshot(
        [
          adjustment({
            op: {
              op: 'swap',
              stage_id: 'review-group',
              member_id: 'critique',
              agent: 'reviewer',
              reason: 'Another critic is better here.',
            },
          }),
        ],
        BUILTIN_PIPELINES.full.stages,
      ),
    );

    const group = v.stages.find((s) => s.id === 'review-group');

    expect(group?.changed).toBeUndefined();
    expect(group?.members?.find((m) => m.id === 'critique')?.changed?.op).toBe('swap');
  });
});

describe('ticketPipelineView: what ran', () => {
  it('reads the harness, model and slot from the run the row points at', () => {
    const v = view(
      snapshot([]),
      [
        row('implementer', { id: 1, run_id: 'r1' }),
        row('reviewer', { id: 2, run_id: 'r2' }),
        row('test-writer', { id: 3, run_id: 'r0' }),
      ],
      [
        { id: 'r1', harness: 'claude-code', model: 'sonnet', fallback_slot: 1 },
        { id: 'r2', harness: 'codex' },
      ],
    );

    expect(v.stages.find((s) => s.id === 'implementer')?.ran_on).toEqual({
      harness: 'claude-code',
      model: 'sonnet',
      slot: 1,
    });

    expect(v.stages.find((s) => s.id === 'reviewer')?.ran_on).toEqual({
      harness: 'codex',
      slot: 0,
    });

    expect(v.stages.find((s) => s.id === 'test-writer')?.ran_on).toBeUndefined();
  });
});

describe('ticketPipelineView: the owner marks', () => {
  it('carries the id of the row each stage shows and the marks on its findings, by position', () => {
    const findings = [
      { severity: 'high' as const, issue: 'a', evidence: 'x' },
      { severity: 'low' as const, issue: 'b', evidence: 'y' },
    ];

    const v = view(
      snapshot([]),
      [
        row('reviewer', {
          id: 7,
          status: 'failed',
          outcome: { review: { verdict: 'changes', summary: 'two', findings } },
        }),
        row('implementer', { id: 8 }),
      ],
      [],
      [
        { stage_run_id: 7, finding_index: 1, verdict: 'false_alarm' },
        { stage_run_id: 7, finding_index: 0, verdict: 'real' },
        { stage_run_id: 8, finding_index: 0, verdict: 'real' },
      ],
    );

    const reviewer = v.stages.find((s) => s.id === 'reviewer');

    expect(reviewer?.row_id).toBe(7);
    expect(reviewer?.marks).toEqual([
      { index: 0, verdict: 'real' },
      { index: 1, verdict: 'false_alarm' },
    ]);

    expect(v.stages.find((s) => s.id === 'test-writer')?.row_id).toBeUndefined();
    expect(v.stages.find((s) => s.id === 'test-writer')?.marks).toBeUndefined();
  });
});
