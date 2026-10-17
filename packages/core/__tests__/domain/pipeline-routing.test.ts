/**
 * Pins routing: rules that add a check when the work touches certain paths, and only ever add.
 *
 * Why: some changes deserve another pair of eyes whatever the lane (d-0069), but routing must
 *   never weaken a pipeline: a rule that removed or reordered a stage, or added a writer where a
 *   check belongs, would let an owner's convenience rule bypass the independent gate. So a rule
 *   appends one check right before the human or merge stage, fires at most once per ticket, and is
 *   skipped (not obeyed) when its agent is not a check.
 *
 * Pins: a matching rule appends before merge (before human when there is one); a non-matching rule
 *   adds nothing; the original stages survive in order (property over random rules and paths); a
 *   rule already applied is not added twice; a writer agent is skipped; the 12-stage cap holds;
 *   labels default sensibly.
 * Depends on: src/domain/{pipeline-routing,builtin-pipelines}, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { routeStages, routedStageId } from '#/domain/pipeline-routing.js';
import type { RoutingRule } from '#/schemas/pipeline.js';

const roles = {
  implementer: 'writer',
  'test-writer': 'tester',
  reviewer: 'reviewer',
  critic: 'reviewer',
} as const;

const rule = (over: Partial<RoutingRule> = {}): RoutingRule => ({
  id: 'net',
  paths: ['**/*.tf'],
  add: 'critic',
  ...over,
});

const ids = (stages: readonly { id: string }[]): string[] => stages.map((s) => s.id);

describe('routeStages', () => {
  it('appends the rule check right before merge when a path matches', () => {
    const out = routeStages(
      BUILTIN_PIPELINES.standard,
      [rule()],
      ['infra/main.tf'],
      roles,
    );

    expect(ids(out.definition.stages)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer',
      'route-net',
      'merge',
    ]);

    expect(out.fired).toEqual([
      { rule_id: 'net', agent: 'critic', stage_id: 'route-net' },
    ]);
  });

  it('places it before the human stage when the pipeline has one', () => {
    const out = routeStages(BUILTIN_PIPELINES.full, [rule()], ['a.tf'], roles);

    expect(ids(out.definition.stages).slice(-3)).toEqual(['route-net', 'human', 'merge']);
  });

  it('adds nothing when no path matches, and returns the same definition', () => {
    const out = routeStages(BUILTIN_PIPELINES.standard, [rule()], ['src/a.ts'], roles);

    expect(out.fired).toEqual([]);
    expect(out.definition).toBe(BUILTIN_PIPELINES.standard);
  });

  it('does not add a rule that is already in the pipeline', () => {
    const once = routeStages(BUILTIN_PIPELINES.standard, [rule()], ['a.tf'], roles);
    const twice = routeStages(once.definition, [rule()], ['a.tf'], roles);

    expect(twice.fired).toEqual([]);
    expect(ids(twice.definition.stages)).toEqual(ids(once.definition.stages));
  });

  it('skips a rule whose agent is a writer or unknown to the roles', () => {
    const out = routeStages(
      BUILTIN_PIPELINES.standard,
      [rule({ id: 'a', add: 'implementer' }), rule({ id: 'b', add: 'ghost' })],
      ['x.tf'],
      roles,
    );

    expect(out.fired).toEqual([]);
  });

  it('uses the rule label, else a default naming the rule', () => {
    const labelled = routeStages(
      BUILTIN_PIPELINES.standard,
      [rule({ label: ' Network ' })],
      ['a.tf'],
      roles,
    );

    const plain = routeStages(BUILTIN_PIPELINES.standard, [rule()], ['a.tf'], roles);

    expect(labelled.definition.stages.find((s) => s.id === 'route-net')?.label).toBe(
      'Network',
    );

    expect(plain.definition.stages.find((s) => s.id === 'route-net')?.label).toBe(
      'Check: net',
    );
  });

  it('stops adding at the 12-stage cap', () => {
    const rules = Array.from({ length: 10 }, (_, i) => rule({ id: `r${i}` }));
    const out = routeStages(BUILTIN_PIPELINES.standard, rules, ['a.tf'], roles);

    expect(out.definition.stages).toHaveLength(12);
    expect(out.fired).toHaveLength(7);
  });

  it('gives a stage id that is a valid StageId even for a long rule id', () => {
    expect(routedStageId('x'.repeat(60))).toHaveLength(40);
    expect(routedStageId('net')).toBe('route-net');
  });

  it('only adds: every original stage survives, in order (property)', () => {
    const pathArb = fc.constantFrom(
      'a.tf',
      'src/a.ts',
      'db/migrations/1.sql',
      'docs/x.md',
    );

    const ruleArb = fc.record({
      id: fc.constantFrom('r1', 'r2', 'r3', 'r4'),
      paths: fc.array(fc.constantFrom('**/*.tf', '**/*.sql', 'docs/**', 'src/**'), {
        minLength: 1,
        maxLength: 3,
      }),
      add: fc.constantFrom('critic', 'reviewer', 'implementer'),
    });

    fc.assert(
      fc.property(
        fc.array(ruleArb, { maxLength: 6 }),
        fc.array(pathArb, { maxLength: 4 }),
        (rules, paths) => {
          for (const lane of ['express', 'standard', 'full'] as const) {
            const base = BUILTIN_PIPELINES[lane];
            const out = routeStages(base, rules, paths, roles).definition;
            const survivors = ids(out.stages).filter((id) =>
              ids(base.stages).includes(id),
            );

            expect(survivors).toEqual(ids(base.stages));
            expect(out.stages.at(-1)?.id).toBe('merge');
            expect(out.stages.length).toBeLessThanOrEqual(12);
          }
        },
      ),
    );
  });
});
