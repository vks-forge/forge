/**
 * Property tests: no random stage list that validates can break a pipeline safety rule.
 *
 * Why: the rules (merge locked last, G1 once and after the writers, nobody approves their own work,
 *   a reviewer has a writer before it, the only back edge goes to an earlier writer) are the safety
 *   floor, and a hand-written case can only cover the shapes its author thought of. Generating
 *   random lists from the full palette of stage kinds and checking that every list the rules accept
 *   keeps every invariant covers the shapes nobody thought of, and the second property makes sure the
 *   first is not vacuous.
 *
 * Pins: over random stage lists with random rework targets, a list that validates has a last,
 *   single merge; a writer; one G1 after the last writer; no writer after a non-G1 check; no check agent
 *   equal to a writer agent and a writer before every check agent; every rework edge going back to a
 *   writer; one human stage after every check; and some random lists do validate.
 * Depends on: src/domain/{pipeline-rules,effective-agents,builtin-agents}, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { effectiveAgents } from '#/domain/effective-agents.js';
import { pipelineProblems } from '#/domain/pipeline-rules.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';

const roster = effectiveAgents({ ...BUILTIN_AGENTS }, undefined, () => ({
  ready: true,
  reasons: [],
}));

const ctx = { roster, lane: 'standard' as const, families_available: ['claude'] };

const impl: Stage = {
  id: 'implementer',
  kind: 'agent',
  label: 'Implement',
  agent: 'implementer',
};

const tests: Stage = {
  id: 'test-writer',
  kind: 'agent',
  label: 'Tests',
  agent: 'test-writer',
  proof: 'red',
};

const g1: Stage = { id: 'g1', kind: 'script_gate', label: 'G1', run: { builtin: 'g1' } };
const merge: Stage = { id: 'merge', kind: 'merge', label: 'Merge', locked: true };
const reviewer: Stage = {
  id: 'reviewer',
  kind: 'agent',
  label: 'Review',
  agent: 'reviewer',
};

const critic: Stage = { id: 'critic', kind: 'agent', label: 'Critic', agent: 'critic' };
const script: Stage = {
  id: 'scan',
  kind: 'script_gate',
  label: 'Scan',
  run: { command: 'node scan.mjs', timeout_ms: 60_000, guard_paths: [] },
};

const human: Stage = { id: 'human', kind: 'human', label: 'You', prompt: 'Look.' };
const dcheck: Stage = { id: 'check-plan', kind: 'director_check', label: 'Check' };
const signOff: Stage = {
  id: 'sign-off',
  kind: 'sign_off',
  label: 'Sign off',
  signer: 'director_or_owner',
  prompt: 'Sign.',
};

/** A valid skeleton to start from: the shipped lanes, optionally with a script gate or a critic added. */
const skeleton = fc
  .tuple(
    fc.constantFrom<'express' | 'standard' | 'full'>('express', 'standard', 'full'),
    fc.boolean(),
    fc.boolean(),
  )
  .map(([lane, withScript, withCritic]) => {
    const stages = [...BUILTIN_PIPELINES[lane].stages] as Stage[];
    const at = stages.length - 1;
    if (withScript) {
      stages.splice(at, 0, script);
    }

    if (withCritic) {
      stages.splice(at, 0, critic);
    }

    return stages;
  });

const palette: Stage[] = [
  impl,
  tests,
  g1,
  reviewer,
  critic,
  script,
  human,
  dcheck,
  signOff,
  merge,
];

/** One random mutation of a list: swap two stages, drop one, duplicate one, insert from the palette, or point a rework edge somewhere. */
const mutate = (stages: Stage[], pick: number, i: number, j: number): Stage[] => {
  const out = [...stages];
  const a = i % out.length;
  const b = j % out.length;
  switch (pick % 5) {
    case 0:
      [out[a], out[b]] = [out[b] as Stage, out[a] as Stage];

      return out;
    case 1:
      out.splice(a, 1);

      return out;
    case 2:
      out.splice(b, 0, {
        ...(out[a] as Stage),
        id: `${(out[a] as Stage).id}-copy`,
      } as Stage);

      return out;
    case 3:
      out.splice(b, 0, {
        ...(palette[a % palette.length] as Stage),
        id: `x${a}-${b}`,
      } as Stage);

      return out;
    default: {
      const s = out[a] as Stage;
      if (s.kind === 'agent' || s.kind === 'script_gate') {
        out[a] = { ...s, rework_to: (out[b] as Stage).id } as Stage;
      }

      return out;
    }
  }
};

const stageList = fc
  .tuple(
    skeleton,
    fc.array(fc.tuple(fc.nat(4), fc.nat(20), fc.nat(20)), { maxLength: 3 }),
  )
  .map(([base, steps]) =>
    steps.reduce<Stage[]>(
      (acc, [p, i, j]) => (acc.length > 1 ? mutate(acc, p, i, j) : acc),
      base,
    ),
  )
  .filter((stages) => stages.length >= 2 && stages.length <= 12);

const agentOfStage = (s: Stage): string | undefined =>
  s.kind === 'agent' ? s.agent : undefined;

const writerAgents = new Set(['implementer', 'test-writer']);

describe('the shipped lanes', () => {
  it('are all valid, Full included, with one family or two', () => {
    for (const lane of ['express', 'standard', 'full'] as const) {
      for (const families_available of [['claude'], ['claude', 'openai']]) {
        // Two families: the critic still runs on Claude with the Worker, so only that case differs.
        const problems = pipelineProblems(BUILTIN_PIPELINES[lane], {
          roster,
          lane,
          families_available,
        });

        expect(problems.map((p) => p.code)).toEqual(
          lane === 'full' && families_available.length > 1 ? ['critic_same_family'] : [],
        );
      }
    }
  });
});

describe('properties over random stage lists', () => {
  it('a list that validates keeps every invariant', () => {
    fc.assert(
      fc.property(stageList, (stages) => {
        const d = { stages } as PipelineDefinition;
        if (pipelineProblems(d, ctx).length > 0) {
          return;
        }

        const kinds = stages.map((s) =>
          s.kind === 'agent' ? (writerAgents.has(s.agent) ? 'writer' : 'check') : s.kind,
        );

        const lastWriter = kinds.lastIndexOf('writer');
        const g1s = stages.flatMap((s, i) =>
          s.kind === 'script_gate' && 'builtin' in s.run ? [i] : [],
        );

        const firstCheck = kinds.findIndex(
          (k, i) =>
            k === 'check' || (stages[i]?.kind === 'script_gate' && !g1s.includes(i)),
        );

        const writerAgentIds = new Set(
          stages.flatMap((s) =>
            writerAgents.has(agentOfStage(s) ?? '') ? [agentOfStage(s)] : [],
          ),
        );

        // merge is last and only once
        expect(stages.at(-1)?.kind).toBe('merge');
        expect(stages.filter((s) => s.kind === 'merge')).toHaveLength(1);
        // a writer exists and G1 is once, after the last writer
        expect(lastWriter).toBeGreaterThanOrEqual(0);
        expect(g1s).toHaveLength(1);
        expect(g1s[0]).toBeGreaterThan(lastWriter);
        // no writer after a non-G1 check
        if (firstCheck >= 0) {
          expect(lastWriter).toBeLessThan(firstCheck);
        }

        // no check agent is also a writer agent, and a check agent has a writer before it
        stages.forEach((s, i) => {
          const a = agentOfStage(s);
          if (a !== undefined && kinds[i] === 'check') {
            expect(writerAgentIds.has(a)).toBe(false);
            expect(kinds.slice(0, i)).toContain('writer');
          }

          // a rework edge only goes back, to a writer
          if (
            (s.kind === 'agent' || s.kind === 'script_gate') &&
            s.rework_to !== undefined
          ) {
            const at = stages.findIndex((t) => t.id === s.rework_to);
            expect(at).toBeGreaterThanOrEqual(0);
            expect(at).toBeLessThan(i);
            expect(kinds[at]).toBe('writer');
          }
        });

        // one human or sign-off stage, after every check and the Director check
        const signAt = stages.findIndex(
          (s) => s.kind === 'human' || s.kind === 'sign_off',
        );

        if (signAt >= 0) {
          expect(
            stages.filter((s) => s.kind === 'human' || s.kind === 'sign_off'),
          ).toHaveLength(1);

          expect(kinds.slice(signAt + 1).filter((k) => k === 'check')).toEqual([]);
          expect(kinds.slice(signAt + 1)).not.toContain('director_check');
          expect(g1s[0]).toBeLessThan(signAt);
        }

        // the Director check comes once, after G1 and after every other check
        const dAt = stages.findIndex((s) => s.kind === 'director_check');
        if (dAt >= 0) {
          expect(stages.filter((s) => s.kind === 'director_check')).toHaveLength(1);
          expect(g1s[0]).toBeLessThan(dAt);
          expect(kinds.slice(dAt + 1)).not.toContain('check');
          expect(stages.slice(dAt + 1).some((s) => s.kind === 'script_gate')).toBe(false);
          expect(stages.slice(dAt + 1).some((s) => s.kind === 'group')).toBe(false);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('is not vacuous: random lists include many that validate and many that do not', () => {
    const lists = fc.sample(stageList, 500);
    const accepted = lists.filter(
      (stages) => pipelineProblems({ stages } as PipelineDefinition, ctx).length === 0,
    );

    expect(accepted.length).toBeGreaterThan(50);
    expect(accepted.length).toBeLessThan(lists.length - 50);
  });
});
