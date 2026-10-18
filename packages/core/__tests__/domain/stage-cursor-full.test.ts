/**
 * Pins the stage cursor for the Full lane: writer groups, the Director check, the sign-off and overrides.
 *
 * Why: the Full lane adds stages whose rows the cursor must read without a stored position: a group of
 *   writers that start one at a time and are all awaited (and all re-run when a check sends the work
 *   back), the Director's check and the sign-off that follow the other checks, and an owner's override
 *   that makes a held row count as passed so the stage is not asked for again. A cursor that skipped
 *   one of these, restarted a stage the owner had overruled, or let the merge through before the
 *   sign-off would break the safety of the lane.
 *
 * Pins: writer groups ask for the members without a row and wait for the rest; G1 only after every
 *   member passed; a check's rework re-runs every member; the Director check then the sign-off then
 *   the merge; a waiting sign-off row holds the merge; a held row with an override counts as passed;
 *   a failed Director check goes back to the last writer.
 * Depends on: src/domain/{stage-cursor,builtin-pipelines}, helpers/stage-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { currentCycle } from '#/domain/stage-cursor.js';
import type { SnapshotView, StageRecord } from '#/types/stage-cursor.types.js';
import { fullLane, next, roles, row, snap } from '#tests/helpers/stage-fixtures.js';

describe('writer groups, the Director check, the sign-off and overrides', () => {
  const writers = snap({
    stages: [
      {
        id: 'writers',
        kind: 'group',
        label: 'Writers',
        join: 'all',
        members: [
          { id: 'fe', kind: 'agent', label: 'Frontend', agent: 'frontend-writer' },
          { id: 'be', kind: 'agent', label: 'Backend', agent: 'backend-writer' },
        ],
      },
      ...BUILTIN_PIPELINES.full.stages.slice(2),
    ],
  });

  const withWriters = {
    ...writers,
    roles: { ...roles, 'frontend-writer': 'writer', 'backend-writer': 'writer' },
  } as SnapshotView;

  const done = (id: string, over: Partial<StageRecord> = {}) =>
    row(id, 'passed', { kind: 'script_gate', ...over });

  it('is not vacuous: the shipped Full lane has a Director check and a sign-off', () => {
    expect(BUILTIN_PIPELINES.full.stages.map((s) => s.kind)).toEqual(
      expect.arrayContaining(['director_check', 'sign_off']),
    );
  });

  it('asks for the members of a writer group that have not started, and waits for the rest', () => {
    expect(next(withWriters, [])).toMatchObject({
      kind: 'run_writers',
      stage: { id: 'writers' },
      members: [{ id: 'fe' }, { id: 'be' }],
    });

    const one = [row('writers', 'running', { member_id: 'fe' })];

    expect(next(withWriters, one)).toMatchObject({
      kind: 'run_writers',
      members: [{ id: 'be' }],
    });

    const both = [...one, row('writers', 'running', { member_id: 'be' })];

    expect(next(withWriters, both).kind).toBe('await');
    expect(
      next(withWriters, [
        row('writers', 'passed', { member_id: 'fe' }),
        row('writers', 'running', { member_id: 'be' }),
      ]).kind,
    ).toBe('await');
  });

  it('moves past the writer group to G1 only when every member passed', () => {
    const rows = [
      row('writers', 'passed', { member_id: 'fe' }),
      row('writers', 'passed', { member_id: 'be' }),
    ];

    expect(next(withWriters, rows)).toMatchObject({
      kind: 'start_gates',
      stage: { id: 'g1' },
    });
  });

  it('re-runs every member of a writer group when a check sends the work back', () => {
    const rows = [
      row('writers', 'passed', { member_id: 'fe' }),
      row('writers', 'passed', { member_id: 'be' }),
      done('g1'),
      row('review-group', 'failed', { member_id: 'review' }),
      row('review-group', 'passed', { member_id: 'critique' }),
    ];

    expect(next(withWriters, rows)).toMatchObject({
      kind: 'run_writers',
      cycle: 1,
      members: [{ id: 'fe' }, { id: 'be' }],
    });
  });

  const upToCheck = [
    row('test-writer', 'passed'),
    row('test-writer', 'passed', { member_id: 'proof', kind: 'script_gate' }),
    row('implementer', 'passed'),
    done('g1'),
    row('review-group', 'passed', { member_id: 'review' }),
    row('review-group', 'passed', { member_id: 'critique' }),
  ];

  it('asks for the Director check, then the sign-off, then the merge', () => {
    expect(next(fullLane, upToCheck)).toMatchObject({
      kind: 'director_check',
      stage: { id: 'check-plan' },
    });

    const checked = [...upToCheck, row('check-plan', 'passed', { kind: 'director' })];

    expect(next(fullLane, checked)).toMatchObject({
      kind: 'sign_off',
      stage: { id: 'sign-off' },
    });

    const signed = [...checked, row('sign-off', 'passed', { kind: 'director' })];

    expect(next(fullLane, signed)).toMatchObject({ kind: 'merge', hold: false });
  });

  it('waits while the Director check runs, and runs it again after an error', () => {
    const running = [...upToCheck, row('check-plan', 'running', { kind: 'director' })];

    expect(next(fullLane, running).kind).toBe('await');
    expect(
      next(fullLane, [...upToCheck, row('check-plan', 'error', { kind: 'director' })])
        .kind,
    ).toBe('director_check');
  });

  it('holds the merge for the owner while a sign-off row is waiting', () => {
    const waiting = [
      ...upToCheck,
      row('check-plan', 'passed', { kind: 'director' }),
      row('sign-off', 'waiting', { kind: 'human' }),
    ];

    expect(next(fullLane, waiting)).toMatchObject({ kind: 'merge', hold: true });
  });

  const override = {
    by: 'owner',
    action: 'merge_anyway',
    comment: 'known and accepted',
    at: '2026-10-18T00:00:00.000Z',
  } as const;

  it('counts a held row the owner overruled as passed, and does not restart the stage', () => {
    const held = [...upToCheck, row('check-plan', 'waiting', { kind: 'director' })];

    expect(currentCycle(held)).toBe(1);
    expect(next(fullLane, held)).toMatchObject({ kind: 'director_check', cycle: 1 });

    const overridden = [
      ...upToCheck,
      row('check-plan', 'passed', { kind: 'director', outcome: { override } }),
    ];

    expect(currentCycle(overridden)).toBe(0);
    expect(next(fullLane, overridden).kind).toBe('sign_off');
  });

  it('counts an overridden row as passed even if its status still says waiting', () => {
    const rows = [
      ...upToCheck,
      row('check-plan', 'waiting', { kind: 'director', outcome: { override } }),
    ];

    expect(currentCycle(rows)).toBe(0);
    expect(next(fullLane, rows).kind).toBe('sign_off');
  });

  it('sends a failed Director check back to the last writer', () => {
    const rows = [...upToCheck, row('check-plan', 'failed', { kind: 'director' })];

    expect(next(fullLane, rows)).toMatchObject({
      kind: 'run_writer',
      stage: { id: 'implementer' },
      cycle: 1,
    });
  });
});
