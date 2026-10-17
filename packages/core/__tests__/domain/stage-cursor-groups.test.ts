/**
 * Pins the stage cursor for groups, human and merge, its fail-closed cases and its properties.
 *
 * Why: nothing stores "the current stage", so a restart, a double tick or a rework must all land
 *   on the same answer from the same rows. If the cursor ever skipped a stage, re-ran a passed one
 *   after a rework, or reached merge with a check unpassed, a ticket would be judged twice or ship
 *   unreviewed. The cursor must also fail closed: a row it cannot make sense of stalls a ticket
 *   visibly and can never let one through.
 *
 * Pins: a group starts every member together and waits for each; the human stage holds the merge
 *   until it passes; done after the merge row; an adopted writer needs no proof; an agent the
 *   snapshot does not know stalls the cursor; a failed row in the asked cycle stalls it; monotonic
 *   progress, idempotence on re-applied rows, and merge only when every check passed (properties).
 * Depends on: src/domain/{stage-cursor,builtin-pipelines}, helpers/stage-fixtures, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { stageCursor } from '#/domain/stage-cursor.js';
import type { StageRunStatus } from '#/schemas/stage-run.js';
import type { SnapshotView, StageRecord } from '#/types/stage-cursor.types.js';
import { full, kindOf, next, row, standard } from '#tests/helpers/stage-fixtures.js';

describe('groups, human and merge', () => {
  const upToGate = [
    row('test-writer', 'passed'),
    row('test-writer', 'passed', { member_id: 'proof', kind: 'script_gate' }),
    row('implementer', 'passed'),
    row('g1', 'passed', { kind: 'script_gate' }),
  ];

  it('starts every member of a group together and waits for each one', () => {
    expect(next(full, upToGate)).toMatchObject({
      kind: 'run_checks',
      stage: { id: 'review-group' },
      members: [{ id: 'review' }, { id: 'critique' }],
    });

    const one = [...upToGate, row('review-group', 'running', { member_id: 'review' })];

    expect(next(full, one)).toMatchObject({
      kind: 'run_checks',
      members: [{ id: 'critique' }],
    });

    expect(
      next(full, [
        ...upToGate,
        row('review-group', 'running', { member_id: 'review' }),
        row('review-group', 'running', { member_id: 'critique' }),
      ]).kind,
    ).toBe('await');

    expect(
      next(full, [
        ...upToGate,
        row('review-group', 'passed', { member_id: 'review' }),
        row('review-group', 'running', { member_id: 'critique' }),
      ]).kind,
    ).toBe('await');
  });

  it('reaches the human stage only after the whole group passed, and holds the merge for it', () => {
    const grouped = [
      ...upToGate,
      row('review-group', 'passed', { member_id: 'review' }),
      row('review-group', 'passed', { member_id: 'critique' }),
    ];

    expect(next(full, grouped)).toMatchObject({ kind: 'merge', hold: true });
    expect(next(full, [...grouped, row('human', 'passed')])).toMatchObject({
      kind: 'merge',
      hold: false,
    });
  });

  it('is done once the merge row passed', () => {
    const all = [
      ...upToGate,
      row('reviewer', 'passed'),
      row('merge', 'passed', { kind: 'script_gate' }),
    ];

    expect(next(standard, all)).toEqual({ kind: 'done' });
  });

  it('never needs a red proof from an adopted writer', () => {
    const rows = [row('test-writer', 'adopted'), row('implementer', 'passed')];

    expect(next(standard, rows)).toMatchObject({ kind: 'start_gates' });
  });
});

describe('fail-closed', () => {
  it('an agent the snapshot does not know stalls the cursor instead of passing the stage', () => {
    const s: SnapshotView = {
      definition: BUILTIN_PIPELINES.standard,
      roles: { implementer: 'writer', 'test-writer': 'tester' },
    };

    const rows = [
      row('test-writer', 'adopted'),
      row('implementer', 'passed'),
      row('g1', 'passed', { kind: 'script_gate' }),
    ];

    expect(next(s, rows)).toMatchObject({ kind: 'await', stage: { id: 'reviewer' } });
  });

  it('a failed row in the cycle it is asked about stalls it', () => {
    const rows = [
      row('test-writer', 'adopted'),
      row('implementer', 'passed'),
      row('g1', 'passed', { kind: 'script_gate' }),
      row('reviewer', 'failed'),
    ];

    expect(stageCursor(standard, rows, 0).kind).toBe('await');
  });

  it('with no row at all for the cycle it is asked about, everything runs from the start', () => {
    const rows = [row('implementer', 'passed')];

    expect(stageCursor(standard, rows, 3)).toMatchObject({
      kind: 'run_writer',
      stage: { id: 'test-writer' },
    });
  });
});

describe('properties', () => {
  const ORDER = ['test-writer', 'proof', 'implementer', 'g1', 'reviewer'] as const;
  const rowsUpTo = (n: number): StageRecord[] =>
    ORDER.slice(0, n).map((id) =>
      id === 'proof'
        ? row('test-writer', 'passed', { member_id: 'proof', kind: 'script_gate' })
        : row(id, 'passed', { kind: id === 'g1' ? 'script_gate' : 'agent' }),
    );

  /** How far along the pipeline the cursor points: stage position, the proof just after its writer, merge last. */
  const progress = (rows: StageRecord[]): number => {
    const c = next(standard, rows);
    const stages = BUILTIN_PIPELINES.standard.stages;
    if (c.kind === 'done') {
      return stages.length * 2 + 1;
    }

    if (c.kind === 'merge') {
      return stages.length * 2;
    }

    return (
      stages.findIndex((st) => st.id === c.stage.id) * 2 +
      (c.kind === 'run_proof' ? 1 : 0)
    );
  };

  it('is monotonic within a cycle: more passed rows never move the cursor back', () => {
    const steps = ORDER.map((_, n) => progress(rowsUpTo(n)));

    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1] as number);
    }

    expect(kindOf(standard, rowsUpTo(ORDER.length))).toBe('merge');
  });

  it('is idempotent on re-applied rows: duplicated or reordered rows give the same answer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: ORDER.length }),
        fc.boolean(),
        (n, reverse) => {
          const rows = rowsUpTo(n);
          const again = [...(reverse ? [...rows].reverse() : rows), ...rows];

          expect(next(standard, again)).toEqual(next(standard, rows));
        },
      ),
    );
  });

  it('reaches merge only when every check stage has a passed row', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<StageRunStatus>(
            'running',
            'passed',
            'error',
            'adopted',
            'skipped',
          ),
          {
            minLength: 5,
            maxLength: 5,
          },
        ),
        (statuses) => {
          const rows = [
            row('test-writer', statuses[0] as StageRunStatus),
            row('test-writer', statuses[1] as StageRunStatus, {
              member_id: 'proof',
              kind: 'script_gate',
            }),
            row('implementer', statuses[2] as StageRunStatus),
            row('g1', statuses[3] as StageRunStatus, { kind: 'script_gate' }),
            row('reviewer', statuses[4] as StageRunStatus),
          ];

          if (kindOf(standard, rows) === 'merge') {
            // An adopted test-writer never ran here, so its (absent) red proof is not required.
            const needed = statuses.filter(
              (_, i) => !(i === 1 && statuses[0] === 'adopted'),
            );

            expect(
              needed.every((s) => ['passed', 'adopted', 'skipped'].includes(s)),
            ).toBe(true);
          }
        },
      ),
    );
  });
});
