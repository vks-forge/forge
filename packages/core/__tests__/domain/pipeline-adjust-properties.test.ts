/**
 * Property tests: no sequence of Director ops can break a lock, a role or a scope, whatever it asks.
 *
 * Why: the ops come from a plan drafted out of text a stranger may have written, and a hand-written case can only
 *   cover the shapes its author thought of. Random sequences of valid and invalid ops over the shipped lanes must
 *   never remove or alter merge, G1, a script gate, a human or sign-off stage or a routed stage, must always leave a
 *   list that passes the pipeline rules, must never change a role or widen a writer's scope, and must give the same
 *   result for the same input; `scopeWithin` is what keeps a substitute writer inside the original's folders.
 *
 * Pins: the properties above over Standard and Full, a check that some random sequences do apply (so the first
 *   property is not vacuous), and the table of `scopeWithin` answers.
 * Depends on: src/domain/{pipeline-adjust,pipeline-rules,builtin-pipelines,scope-overlap,stage-kinds},
 *   tests/helpers/adjust-fixtures, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { applyAdjustments, isLockedStage } from '#/domain/pipeline-adjust.js';
import { pipelineProblems } from '#/domain/pipeline-rules.js';
import { scopeWithin } from '#/domain/scope-overlap.js';
import { flattenStages } from '#/domain/stage-kinds.js';
import type { PipelineAdjustOp } from '#/schemas/pipeline-adjust.js';
import type { PipelineDefinition } from '#/schemas/pipeline.js';
import { WHY, ctx, meta, roster } from '#tests/helpers/adjust-fixtures.js';

const standard = BUILTIN_PIPELINES.standard;
const full = BUILTIN_PIPELINES.full;

describe('scopeWithin', () => {
  it.each([
    [['apps/web/src/**'], ['apps/web/**'], true],
    [['apps/web/**'], ['apps/web/**'], true],
    [['apps/web/**'], ['apps/web/src/**'], false],
    [['**'], ['**'], true],
    [['**'], ['apps/**'], false],
    [['apps/web/index.ts'], ['apps/web/**'], true],
    [['*.ts'], ['apps/**'], false],
    [[], ['apps/**'], true],
    [['apps/**'], [], false],
  ])('%j within %j is %s', (inner, outer, expected) => {
    expect(scopeWithin(inner, outer)).toBe(expected);
  });
});

/** A random op over the palette of ids and agents the fixtures know, valid or not. */
const opIds = fc.constantFrom(
  'test-writer',
  'implementer',
  'g1',
  'reviewer',
  'merge',
  'review-group',
  'review',
  'critique',
  'check-plan',
  'sign-off',
  'dir-a',
  'dir-b',
  'route-sec',
  'nope',
);

const opAgents = fc.constantFrom(
  'implementer',
  'test-writer',
  'reviewer',
  'critic',
  'security-reviewer',
  'perf-reviewer',
  'frontend-writer',
  'web-ui-writer',
  'backend-writer',
  'disabled-reviewer',
  'ghost',
);

const opArb: fc.Arbitrary<PipelineAdjustOp> = fc.oneof(
  fc.record({
    op: fc.constant('add' as const),
    stage: fc.record({
      id: fc.constantFrom('dir-a', 'dir-b', 'reviewer', 'g1', 'x'),
      kind: fc.constant('agent' as const),
      label: fc.constant('Extra'),
      agent: opAgents,
    }),
    after: opIds,
    reason: fc.constant(WHY),
  }),
  fc.record({
    op: fc.constant('remove' as const),
    stage_id: opIds,
    reason: fc.constant(WHY),
  }),
  fc.record({
    op: fc.constant('swap' as const),
    stage_id: opIds,
    member_id: fc.option(opIds, { nil: undefined }),
    agent: opAgents,
    reason: fc.constant(WHY),
  }),
  fc.record({
    op: fc.constant('move' as const),
    stage_id: opIds,
    after: opIds,
    reason: fc.constant(WHY),
  }),
);

describe('applyAdjustments: properties', () => {
  const bases: [PipelineDefinition, 'standard' | 'full'][] = [
    [standard, 'standard'],
    [full, 'full'],
  ];

  const find = (agent: string) => roster.find((r) => r.id === agent)?.definition;

  it('never removes or alters a locked stage, always passes the rules, never changes a role or widens a scope', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 8 }), fc.nat(1), (ops, which) => {
        const [base, lane] = bases[which] as (typeof bases)[number];
        const routed = ['route-sec'];
        const out = applyAdjustments(base, ops, { ...ctx(lane), routed }, meta);

        // Every locked stage of the base is still there, byte for byte.
        for (const s of base.stages) {
          if (isLockedStage(s, new Set(routed))) {
            expect(out.definition.stages).toContainEqual(s);
          }
        }

        expect(pipelineProblems(out.definition, ctx(lane))).toEqual([]);

        // A stage that survives under its id keeps its role and never gains write scope.
        const before = new Map(flattenStages(base).map((s) => [s.id, s]));
        for (const s of flattenStages(out.definition)) {
          const old = before.get(s.id);
          if (s.kind === 'agent' && old?.kind === 'agent') {
            const now = find(s.agent);
            const was = find(old.agent);

            expect(now?.role).toBe(was?.role);
            if (now?.role === 'writer' || now?.role === 'tester') {
              expect(scopeWithin(now.write_scope, was?.write_scope ?? [])).toBe(true);
            }
          }
        }

        // Every op got exactly one log entry, in order.
        expect(out.log.map((l) => l.seq)).toEqual(ops.map((_, i) => i));
      }),
      { numRuns: 300 },
    );
  });

  it('is deterministic: the same ops on the same base give the same result', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 6 }), (ops) => {
        expect(applyAdjustments(standard, ops, ctx(), meta)).toEqual(
          applyAdjustments(standard, ops, ctx(), meta),
        );
      }),
      { numRuns: 100 },
    );
  });

  it('some random sequences do apply (the first property is not vacuous)', () => {
    let applied = 0;
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 4 }), (ops) => {
        applied += applyAdjustments(standard, ops, ctx(), meta).applied.length;
      }),
      { numRuns: 200 },
    );

    expect(applied).toBeGreaterThan(0);
  });
});
