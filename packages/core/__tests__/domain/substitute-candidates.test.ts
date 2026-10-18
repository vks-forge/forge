/**
 * Pins which agents the Director may be offered as a substitute for a stage that cannot run.
 *
 * Why: the Director picks a substitute from a list code built, never from the whole roster (a model can be
 *   talked into naming anything). A candidate has to be exactly what the pipeline door would accept as a
 *   swap, plus ready to run now: same role, a writer no wider than the one it replaces, usable, not the agent
 *   that already failed, and for a critic not on the Worker's family once two are connected. Empty is a
 *   valid answer: the owner then decides.
 *
 * Pins: same-role usable agents offered, only narrower writers for a scoped writer, an unready harness dropped, a critic
 *   kept off the Worker family with two families connected, and an empty list for a locked stage.
 * Depends on: src/domain/{substitute-candidates,builtin-pipelines}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { substituteCandidates } from '#/domain/substitute-candidates.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';
import { extraAgent, roster } from '#tests/helpers/adjust-fixtures.js';

const ready = () => true;
const standard = { definition: BUILTIN_PIPELINES.standard, lane: 'standard' as const };
const ids = (xs: { id: string }[]): string[] => xs.map((x) => x.id);

describe('substituteCandidates', () => {
  it('offers other reviewers for a reviewer, never the failed agent, a writer or a disabled agent', () => {
    const out = substituteCandidates({
      stage: { id: 'reviewer' },
      failedAgent: 'reviewer',
      roster,
      snapshot: standard,
      ready,
      families: ['claude'],
    });

    expect(ids(out)).toEqual(['critic', 'perf-reviewer', 'security-reviewer']);
  });

  it('offers only narrower writers for a scoped writer', () => {
    const def: PipelineDefinition = {
      stages: BUILTIN_PIPELINES.standard.stages.map((s) =>
        s.id === 'implementer' ? ({ ...s, agent: 'frontend-writer' } as Stage) : s,
      ),
    };

    const out = substituteCandidates({
      stage: { id: 'implementer' },
      failedAgent: 'frontend-writer',
      roster,
      snapshot: { definition: def, lane: 'standard' },
      ready,
      families: ['claude'],
    });

    expect(ids(out)).toEqual(['web-ui-writer']);
  });

  it('drops an agent whose harness is not ready', () => {
    const out = substituteCandidates({
      stage: { id: 'reviewer' },
      failedAgent: 'reviewer',
      roster,
      snapshot: standard,
      ready: (e) => e.id !== 'critic',
      families: ['claude'],
    });

    expect(ids(out)).not.toContain('critic');
  });

  it('keeps a critic off the Worker family once two families are connected', () => {
    const openaiCritic = extraAgent('gpt-critic', 'reviewer');
    openaiCritic.definition.runs_on = {
      ...openaiCritic.definition.runs_on,
      model: { kind: 'model', id: 'gpt-5' },
    };

    const withCritic: PipelineDefinition = {
      stages: [
        ...BUILTIN_PIPELINES.standard.stages.slice(0, 3),
        { id: 'critique', kind: 'agent', label: 'Critic', agent: 'critic' },
        BUILTIN_PIPELINES.standard.stages[4] as Stage,
      ],
    };

    const common = {
      stage: { id: 'critique' },
      failedAgent: 'critic',
      roster: [...roster, openaiCritic],
      snapshot: { definition: withCritic, lane: 'standard' as const },
      ready,
    };

    const one = substituteCandidates({ ...common, families: ['claude'] });
    const two = substituteCandidates({ ...common, families: ['claude', 'openai'] });

    expect(ids(one)).toContain('gpt-critic');
    expect(ids(two)).toEqual(['gpt-critic']);
  });

  it('is empty for a stage the Director may not touch', () => {
    const out = substituteCandidates({
      stage: { id: 'reviewer' },
      failedAgent: 'reviewer',
      roster,
      snapshot: standard,
      routed: ['reviewer'],
      ready,
      families: ['claude'],
    });

    expect(out).toEqual([]);
  });
});
