/**
 * Pins the scorecards of check agents and of pipeline shapes: pass rate, what became of the findings, shapes.
 *
 * Why: a reviewer that raises many findings is only useful if they are right, and the owner's mark ("Real" or "False
 *   alarm") is the one direct judgement, so it must beat anything the engine derives: acted on (the cycle ended in a
 *   rework and the stage then passed), overruled (merged anyway) or unjudged. Each finding lands in exactly one bucket.
 *   A pipeline shape is the list a ticket really ran, so tickets group by it, a Director-changed list is labelled and
 *   marked, and its figures follow the same arithmetic as an agent's.
 *
 * Pins: pass rate by first verdict, the findings buckets with the mark winning, holds and overrides, shapes grouped
 *   by hash with label and the changed flag.
 * Depends on: src/domain/scorecards, tests/helpers/scorecard-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { computeScorecards } from '#/domain/scorecards.js';
import type { Finding } from '#/schemas/finding.js';
import type { StageRun } from '#/schemas/stage-run.js';
import {
  HASH,
  HASH2,
  agentRow,
  finding,
  input,
  iso,
  row,
  snapshot,
  ticket,
  DAY,
} from '#tests/helpers/scorecard-fixtures.js';

describe('computeScorecards: check agents and findings', () => {
  const reviewRow = (
    n: number,
    cycle: number,
    status: StageRun['status'],
    findings: Finding[],
    over: Partial<StageRun['outcome']> = {},
  ) =>
    row(n, 'reviewer', 'reviewer', {
      cycle,
      status,
      outcome: {
        review: {
          verdict: findings.length > 0 ? 'changes' : 'pass',
          summary: 'ok',
          findings,
        },
        blocking: findings.length,
        ...over,
      },
    });

  it('pass rate counts a group whose first verdict passed', () => {
    const reply = computeScorecards(
      input({
        tickets: [1, 2, 3].map((n) => ticket(n)),
        snapshots: [1, 2, 3].map((n) => snapshot(n)),
        rows: [
          reviewRow(1, 0, 'passed', []),
          reviewRow(2, 0, 'failed', [finding('high', 'a')]),
          reviewRow(2, 1, 'passed', []),
          reviewRow(3, 0, 'passed', []),
        ],
      }),
    );

    expect(agentRow(reply, 'reviewer')?.pass_rate).toEqual({
      hits: 2,
      total: 3,
      rate: 2 / 3,
    });

    expect(agentRow(reply, 'reviewer')?.clean_rate).toBeNull();
  });

  it('derives acted_on, overruled and unjudged, and lets the owner mark beat all of them', () => {
    const failed = reviewRow(1, 0, 'failed', [
      finding('high', 'a'),
      finding('medium', 'b'),
      finding('low', 'c'),
    ]);

    const passedNext = reviewRow(1, 1, 'passed', []);
    const overruled = reviewRow(2, 0, 'passed', [finding('high', 'd')], {
      override: {
        by: 'owner',
        action: 'merge_anyway',
        comment: 'known and accepted',
        at: iso(DAY),
      },
    });

    const unjudged = reviewRow(3, 0, 'waiting', [finding('critical', 'e')]);
    const reply = computeScorecards(
      input({
        tickets: [1, 2, 3].map((n) => ticket(n)),
        snapshots: [1, 2, 3].map((n) => snapshot(n)),
        rows: [failed, passedNext, overruled, unjudged],
        marks: [
          {
            stage_run_id: failed.id,
            finding_index: 0,
            verdict: 'false_alarm',
            marked_at: iso(DAY),
          },
          {
            stage_run_id: overruled.id,
            finding_index: 0,
            verdict: 'real',
            marked_at: iso(DAY),
          },
        ],
      }),
    );

    const f = agentRow(reply, 'reviewer')?.findings;

    expect(f).toMatchObject({
      real: 1,
      false_alarm: 1,
      acted_on: 2,
      overruled: 0,
      unjudged: 1,
    });

    expect(f?.by_severity).toEqual({ critical: 1, high: 2, medium: 1, low: 1 });
    expect(
      (f?.real ?? 0) +
        (f?.false_alarm ?? 0) +
        (f?.acted_on ?? 0) +
        (f?.overruled ?? 0) +
        (f?.unjudged ?? 0),
    ).toBe(5);
  });

  it('counts an unmarked finding on an overridden row as overruled, and holds and overrides', () => {
    const overruled = reviewRow(1, 0, 'passed', [finding('high', 'd')], {
      override: {
        by: 'owner',
        action: 'merge_anyway',
        comment: 'known and accepted',
        at: iso(DAY),
      },
    });

    const held = reviewRow(2, 0, 'waiting', [finding('high', 'x')]);
    const r = agentRow(
      computeScorecards(
        input({
          tickets: [ticket(1), ticket(2)],
          snapshots: [snapshot(1), snapshot(2)],
          rows: [overruled, held],
        }),
      ),
      'reviewer',
    );

    expect(r?.findings?.overruled).toBe(1);
    expect(r?.holds).toBe(1);
    expect(r?.overrides).toBe(1);
  });
});

describe('computeScorecards: shapes', () => {
  it('groups tickets by the pipeline they ran, labels Director changes and marks them', () => {
    const changed = snapshot(2, {
      hash: HASH2,
      definition: {
        stages: [
          { id: 'implementer', kind: 'agent', label: 'Implement', agent: 'implementer' },
          { id: 'g1', kind: 'script_gate', label: 'G1', run: { builtin: 'g1' } },
          { id: 'dir-sec', kind: 'agent', label: 'Security', agent: 'security-reviewer' },
          { id: 'reviewer', kind: 'agent', label: 'Review', agent: 'reviewer' },
          { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
        ],
      },
      adjustments: [
        {
          seq: 0,
          op: {
            op: 'add',
            stage: {
              id: 'dir-sec',
              kind: 'agent',
              label: 'Security',
              agent: 'security-reviewer',
            },
            after: 'g1',
            reason: 'The change touches auth code.',
          },
          by: 'director',
          cause: 'plan',
          key: 'standard:add:security-reviewer@after:g1',
          status: 'applied',
          at: iso(DAY),
        },
      ],
    });

    const reply = computeScorecards(
      input({
        tickets: [ticket(1), ticket(2), ticket(3, { rework_count: 1 })],
        snapshots: [snapshot(1), changed, snapshot(3)],
      }),
    );

    expect(reply.shapes).toHaveLength(2);
    const plain = reply.shapes.find((s) => s.hash === HASH);
    const extra = reply.shapes.find((s) => s.hash === HASH2);

    expect(plain).toMatchObject({
      label: 'Standard',
      director_changed: false,
      lane: 'standard',
    });

    expect(plain?.rows[0]).toMatchObject({
      tickets: 2,
      clean_rate: { hits: 1, total: 2, rate: 0.5 },
    });

    expect(extra).toMatchObject({
      label: 'Standard + security-reviewer',
      director_changed: true,
    });

    expect(extra?.stages).toEqual(['implementer', 'g1', 'dir-sec', 'reviewer', 'merge']);
  });
});
