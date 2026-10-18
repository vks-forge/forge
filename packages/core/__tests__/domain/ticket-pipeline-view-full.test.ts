/**
 * Pins what each chip of the Full strip carries beyond its status.
 *
 * Why: the owner reads the strip to see how far a Full ticket got and why it waits, so each chip must
 *   carry what they would otherwise have to open: the current round's findings with file, line and
 *   evidence (capped, so one noisy review cannot flood the page), the Director check's acceptance
 *   verdicts and the files outside the plan, who signed, an owner's override on a held stage, and the
 *   same-family label on a critic. Every chip has a warnings list so the page never branches on its
 *   absence.
 *
 * Pins: findings capped at 20 with the full counts kept; `check`, `unplanned`, `signed_by` and the
 *   Director's reason as the summary; `override` and the same-family warning on a critic; `warnings` on
 *   every chip.
 * Depends on: src/domain/{ticket-pipeline-view,builtin-pipelines,effective-agents,builtin-agents}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { effectiveAgents } from '#/domain/effective-agents.js';
import { ticketPipelineView } from '#/domain/ticket-pipeline-view.js';
import type { TicketId } from '#/schemas/ids.js';
import type { StageRun, TicketPipeline } from '#/schemas/stage-run.js';

const T = '2026-10-18T00:00:00.000Z';
const roster = effectiveAgents({ ...BUILTIN_AGENTS }, undefined, () => ({
  ready: true,
  reasons: [],
}));

const snapshot = (): TicketPipeline => ({
  ticket_id: 'FG-1' as TicketId,
  lane: 'full',
  definition: BUILTIN_PIPELINES.full,
  roles: {
    implementer: 'writer',
    'test-writer': 'tester',
    reviewer: 'reviewer',
    critic: 'reviewer',
  },
  hash: 'a'.repeat(64),
  config_version: 'c1:p1',
  routed: [],
  created_at: T,
  updated_at: T,
});

let n = 0;
const row = (stage_id: string, over: Partial<StageRun> = {}): StageRun => ({
  id: ++n,
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

const view = (rows: StageRun[]) =>
  ticketPipelineView(
    snapshot(),
    rows,
    [],
    { rework_count: 0, status: 'verifying' },
    roster,
  );

describe('the Full lane chips', () => {
  it('carries the current findings (capped at 20) with their place, and the Director check and sign-off facts', () => {
    const findings = Array.from({ length: 25 }, (_, i) => ({
      severity: 'low' as const,
      file: 'a.ts',
      line: i + 1,
      issue: `n${i}`,
      evidence: 'e',
    }));

    const check = {
      verdict: 'pass' as const,
      summary: 'ok',
      acceptance: [{ criterion: 'x', met: 'yes' as const, evidence: 'a.ts:1' }],
      findings: [],
      confidence: 0.9,
    };

    const rows = [
      row('review-group', {
        member_id: 'review',
        outcome: { review: { verdict: 'pass', summary: 's', findings } },
      }),
      row('check-plan', {
        kind: 'director',
        outcome: { check, unplanned: ['b.ts'] },
      }),
      row('sign-off', {
        kind: 'director',
        outcome: { signed_by: 'director', sign_reason: 'Tier A; all passed.' },
      }),
    ];

    const stages = view(rows).stages;
    const byId = new Map(stages.map((s) => [s.id, s]));
    const review = byId.get('review-group')?.members?.find((m) => m.id === 'review');

    expect(review?.findings).toHaveLength(20);
    expect(review?.findings?.[0]).toMatchObject({ file: 'a.ts', line: 1, evidence: 'e' });
    expect(review?.counts?.low).toBe(25);
    expect(byId.get('check-plan')).toMatchObject({
      kind: 'director_check',
      check,
      unplanned: ['b.ts'],
    });

    expect(byId.get('sign-off')).toMatchObject({
      kind: 'sign_off',
      signed_by: 'director',
      summary: 'Tier A; all passed.',
    });
  });

  it('labels a same-family critic and an owner override, and every chip has a warnings list', () => {
    const override = {
      by: 'owner' as const,
      action: 'merge_anyway' as const,
      comment: 'handled upstream',
      at: T,
    };

    const rows = [
      row('review-group', {
        member_id: 'critique',
        outcome: { override, same_family: true },
      }),
    ];

    const stages = view(rows).stages;
    const critique = stages
      .find((s) => s.id === 'review-group')
      ?.members?.find((m) => m.id === 'critique');

    expect(critique?.override).toEqual(override);
    expect(critique?.warnings).toHaveLength(1);
    expect(stages.every((s) => Array.isArray(s.warnings))).toBe(true);
  });
});
