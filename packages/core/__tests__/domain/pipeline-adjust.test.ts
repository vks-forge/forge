/**
 * Pins what the Director may and may not change in a ticket's own pipeline copy.
 *
 * Why: the Director writes these ops from a plan that was drafted out of repository text a stranger may
 *   have written. The hard limits (d-0149, d-0151) must hold in plain code whatever it asks: merge, G1, every
 *   script gate, the human and sign-off stages and any stage a routing rule added can never be removed or
 *   altered; a swap keeps the role and never widens a writer's scope; every result still passes the
 *   pipeline rules; a stage that already started cannot be touched. A refused op is recorded with a
 *   reason and the rest of the list stands, so one bad op never loses the owner's pipeline.
 *
 * Pins: what applies (add, remove, swap, move, later ops on earlier results), what is locked (merge, G1, a script
 *   gate, a human or sign-off stage, a routed stage, a started stage, a group with a command in it) and the reason
 *   given for each refusal.
 * Depends on: src/domain/{pipeline-adjust,builtin-pipelines,stage-kinds}, tests/helpers/adjust-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { applyAdjustments } from '#/domain/pipeline-adjust.js';
import { flattenStages } from '#/domain/stage-kinds.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';
import {
  ISO,
  WHY,
  add,
  apply,
  at,
  ctx,
  ids,
  meta,
  remove,
  swap,
} from '#tests/helpers/adjust-fixtures.js';

const standard = BUILTIN_PIPELINES.standard;
const full = BUILTIN_PIPELINES.full;

describe('applyAdjustments: what is allowed', () => {
  it('adds a reviewer after G1 and logs it as applied', () => {
    const out = apply(standard, [add('security-reviewer', 'g1')]);

    expect(out.problems).toEqual([]);
    expect(ids(out.definition)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'dir-sec',
      'reviewer',
      'merge',
    ]);

    expect(out.log).toHaveLength(1);
    expect(out.log[0]).toMatchObject({
      seq: 0,
      status: 'applied',
      by: 'director',
      cause: 'plan',
      key: 'standard:add:security-reviewer@after:g1',
      at: ISO,
    });
  });

  it('numbers entries from the given start and carries the plan version', () => {
    const out = applyAdjustments(standard, [remove('reviewer')], ctx(), {
      ...meta,
      seq: 3,
      plan_version: 2,
    });

    expect(out.log[0]).toMatchObject({ seq: 3, plan_version: 2, status: 'applied' });
  });

  it('removes an agent stage and a group member (a lone member replaces its group)', () => {
    expect(ids(apply(standard, [remove('reviewer')]).definition)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'merge',
    ]);

    const out = apply(full, [remove('critique')], 'full');

    expect(out.problems).toEqual([]);
    expect(out.definition.stages.find((s) => s.id === 'review')).toMatchObject({
      kind: 'agent',
      agent: 'reviewer',
    });

    expect(out.definition.stages.some((s) => s.id === 'review-group')).toBe(false);
  });

  it('swaps a writer for a narrower one and a reviewer for another reviewer', () => {
    const base: PipelineDefinition = {
      stages: [
        at(standard, 0),
        { ...at(standard, 1), agent: 'frontend-writer' } as Stage,
        ...standard.stages.slice(2),
      ],
    };

    const narrower = apply(base, [swap('implementer', 'web-ui-writer')]);

    expect(narrower.problems).toEqual([]);
    expect(
      flattenStages(narrower.definition).find((s) => s.id === 'implementer'),
    ).toMatchObject({
      agent: 'web-ui-writer',
    });

    const rev = apply(standard, [swap('reviewer', 'security-reviewer')]);

    expect(rev.problems).toEqual([]);
    expect(flattenStages(rev.definition).find((s) => s.id === 'reviewer')).toMatchObject({
      agent: 'security-reviewer',
    });
  });

  it('swaps a group member', () => {
    const out = apply(full, [swap('review-group', 'perf-reviewer', 'critique')], 'full');

    expect(out.problems).toEqual([]);
    expect(flattenStages(out.definition).find((s) => s.id === 'critique')).toMatchObject({
      agent: 'perf-reviewer',
    });
  });

  it('moves a check after another stage', () => {
    const withTwo = apply(standard, [add('security-reviewer', 'g1')]).definition;
    const out = apply(withTwo, [
      { op: 'move', stage_id: 'dir-sec', after: 'reviewer', reason: WHY },
    ]);

    expect(out.problems).toEqual([]);
    expect(ids(out.definition).slice(3)).toEqual(['reviewer', 'dir-sec', 'merge']);
  });

  it('applies later ops to the result of earlier ones, and drops only the bad one', () => {
    const out = apply(standard, [
      add('security-reviewer', 'g1'),
      remove('g1'),
      add('perf-reviewer', 'dir-sec', 'dir-perf'),
    ]);

    expect(out.log.map((l) => l.status)).toEqual(['applied', 'dropped', 'applied']);
    expect(out.problems.map((p) => p.code)).toEqual(['locked_stage']);
    expect(ids(out.definition)).toContain('dir-perf');
    expect(ids(out.definition)).toContain('g1');
    expect(out.log[1]?.problem).toMatch(/locked|cannot/i);
    expect(out.applied).toHaveLength(2);
    expect(out.dropped).toHaveLength(1);
  });
});
