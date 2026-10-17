/**
 * Pins the stage cursor: what a ticket's pipeline asks for next, from its stage rows alone.
 *
 * Why: nothing stores "the current stage", so a restart, a double tick or a rework must all land
 *   on the same answer from the same rows. If the cursor ever skipped a stage, re-ran a passed one
 *   after a rework, or reached merge with a check unpassed, a ticket would be judged twice or ship
 *   unreviewed. The cursor must also fail closed: a row it cannot make sense of stalls a ticket
 *   visibly and can never let one through.
 *
 * Pins: the walk through writers, red proof, G1 and the reviewer to merge; an errored check runs again;
 *   a failed row ends its cycle and the next one restarts at `rework_to` (default the last writer)
 *   while earlier writers count as satisfied; a held check restarts itself; a human stage waiting
 *   does not end a cycle and sending it back does. Groups, fail-closed cases and properties are in
 *   stage-cursor-groups.test.ts.
 * Depends on: src/domain/{stage-cursor,builtin-pipelines}, helpers/stage-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { currentCycle, cycleStart, reworkTarget } from '#/domain/stage-cursor.js';
import type { PipelineDefinition } from '#/schemas/pipeline.js';
import { full, next, row, snap, standard } from '#tests/helpers/stage-fixtures.js';

describe('walking a Standard pipeline', () => {
  it('asks for the test-writer first, then its red proof, then the implementer', () => {
    expect(next(standard, [])).toMatchObject({
      kind: 'run_writer',
      stage: { id: 'test-writer' },
    });

    expect(next(standard, [row('test-writer', 'running')])).toMatchObject({
      kind: 'run_writer',
      stage: { id: 'test-writer' },
    });

    expect(next(standard, [row('test-writer', 'passed')])).toMatchObject({
      kind: 'run_proof',
      stage: { id: 'test-writer' },
    });

    expect(
      next(standard, [
        row('test-writer', 'passed'),
        row('test-writer', 'running', { member_id: 'proof', kind: 'script_gate' }),
      ]),
    ).toMatchObject({ kind: 'await' });

    expect(
      next(standard, [
        row('test-writer', 'passed'),
        row('test-writer', 'passed', { member_id: 'proof', kind: 'script_gate' }),
      ]),
    ).toMatchObject({ kind: 'run_writer', stage: { id: 'implementer' } });
  });

  it('asks for the gates after the last writer, then the reviewer, then merge', () => {
    const written = [
      row('test-writer', 'passed'),
      row('test-writer', 'passed', { member_id: 'proof', kind: 'script_gate' }),
      row('implementer', 'passed'),
    ];

    expect(next(standard, written)).toMatchObject({
      kind: 'start_gates',
      stage: { id: 'g1' },
    });

    const gated = [...written, row('g1', 'passed', { kind: 'script_gate' })];

    expect(next(standard, gated)).toMatchObject({
      kind: 'run_checks',
      stage: { id: 'reviewer' },
      members: [{ id: '' }],
    });

    expect(next(standard, [...gated, row('reviewer', 'running')]).kind).toBe('await');
    expect(next(standard, [...gated, row('reviewer', 'passed')])).toMatchObject({
      kind: 'merge',
      hold: false,
    });
  });

  it('treats an errored check as not started, so it runs again', () => {
    const rows = [
      row('test-writer', 'adopted'),
      row('implementer', 'passed'),
      row('g1', 'passed', { kind: 'script_gate' }),
      row('reviewer', 'error'),
    ];

    expect(next(standard, rows).kind).toBe('run_checks');
  });
});

describe('rework cycles', () => {
  const failedReview = [
    row('test-writer', 'passed'),
    row('test-writer', 'passed', { member_id: 'proof', kind: 'script_gate' }),
    row('implementer', 'passed'),
    row('g1', 'passed', { kind: 'script_gate' }),
    row('reviewer', 'failed'),
  ];

  it('a failed row ends its cycle: the next one restarts at the last writer, not the test-writer', () => {
    expect(currentCycle(failedReview)).toBe(1);
    expect(next(standard, failedReview)).toMatchObject({
      kind: 'run_writer',
      stage: { id: 'implementer' },
      cycle: 1,
    });
  });

  it('after the writer ran again, the gates and the reviewer run again in the new cycle', () => {
    const again = [...failedReview, row('implementer', 'passed', { cycle: 1 })];

    expect(next(standard, again)).toMatchObject({ kind: 'start_gates', cycle: 1 });
    expect(
      next(standard, [...again, row('g1', 'passed', { cycle: 1, kind: 'script_gate' })]),
    ).toMatchObject({ kind: 'run_checks', stage: { id: 'reviewer' }, cycle: 1 });
  });

  it('a rework_to naming the test-writer restarts there', () => {
    const stages = BUILTIN_PIPELINES.standard.stages.map((s) =>
      s.id === 'reviewer' ? { ...s, rework_to: 'test-writer' } : s,
    );

    const s = snap({ stages } as PipelineDefinition);

    expect(reworkTarget(s, 'reviewer')).toBe('test-writer');
    expect(next(s, failedReview)).toMatchObject({
      kind: 'run_writer',
      stage: { id: 'test-writer' },
      cycle: 1,
    });
  });

  it('the default target of any check or gate is the last writer above it; of human and merge, the last writer', () => {
    expect(reworkTarget(standard, 'g1')).toBe('implementer');
    expect(reworkTarget(standard, 'reviewer')).toBe('implementer');
    expect(reworkTarget(standard, 'merge')).toBe('implementer');
    expect(reworkTarget(full, 'human')).toBe('implementer');
    expect(reworkTarget(standard, 'implementer')).toBe('implementer');
    expect(reworkTarget(standard, 'no-such-stage')).toBe('implementer');
  });

  it('a held check restarts at itself in a new cycle, keeping everything before it', () => {
    const held = [
      row('test-writer', 'passed'),
      row('test-writer', 'passed', { member_id: 'proof', kind: 'script_gate' }),
      row('implementer', 'passed'),
      row('g1', 'passed', { kind: 'script_gate' }),
      row('reviewer', 'waiting'),
    ];

    expect(currentCycle(held)).toBe(1);
    expect(cycleStart(standard, held, 1)).toBe(3);
    expect(next(standard, held)).toMatchObject({
      kind: 'run_checks',
      stage: { id: 'reviewer' },
      cycle: 1,
    });
  });

  it('a human stage waiting for the owner does not end the cycle; sending it back does', () => {
    const waiting = [
      row('test-writer', 'passed'),
      row('test-writer', 'passed', { member_id: 'proof', kind: 'script_gate' }),
      row('implementer', 'passed'),
      row('g1', 'passed', { kind: 'script_gate' }),
      row('review-group', 'passed', { member_id: 'review' }),
      row('review-group', 'passed', { member_id: 'critique' }),
      row('human', 'waiting'),
    ];

    expect(currentCycle(waiting)).toBe(0);
    expect(next(full, waiting)).toMatchObject({ kind: 'merge', hold: true });

    const sentBack = [...waiting.slice(0, -1), row('human', 'failed')];

    expect(currentCycle(sentBack)).toBe(1);
    expect(next(full, sentBack)).toMatchObject({
      kind: 'run_writer',
      stage: { id: 'implementer' },
      cycle: 1,
    });
  });
});
