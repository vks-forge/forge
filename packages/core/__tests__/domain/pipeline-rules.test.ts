/**
 * Pins the rules that make a pipeline safe to save and to run.
 *
 * Why: a pipeline is data an owner edits, and the rules are the product's safety floor: merge is
 *   locked last, G1 judges the work after the last writer exactly once, nobody approves their own
 *   work, a reviewer has something to review, the only way back is a rework edge to an earlier
 *   writer (which is also what rules out loops). If any list that breaks a rule validated, a ticket
 *   could merge on a review its own author wrote, or skip the independent gate (d-0006), so the
 *   rules are pinned both by case and as properties over random lists.
 *
 * Pins: every shipped lane is valid; each problem code is reported by a list built to break
 *   exactly that rule (with the stage it names); routing rules only name reviewers and researchers.
 *   The property tests over random stage lists are in pipeline-rules-properties.test.ts.
 * Depends on: src/domain/{pipeline-rules,builtin-pipelines,effective-agents,builtin-agents}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { effectiveAgents } from '#/domain/effective-agents.js';
import { pipelineProblems, routingProblems } from '#/domain/pipeline-rules.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';

const ready = () => ({ ready: true, reasons: [] });
const roster = effectiveAgents({ ...BUILTIN_AGENTS }, undefined, ready);
const ctx = { roster, lane: 'standard' as const };

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

const script: Stage = {
  id: 'scan',
  kind: 'script_gate',
  label: 'Scan',
  run: { command: 'node scan.mjs', timeout_ms: 60_000, guard_paths: [] },
};

const human: Stage = { id: 'human', kind: 'human', label: 'You', prompt: 'Look.' };
const def = (...stages: Stage[]): PipelineDefinition => ({ stages });
const codes = (d: PipelineDefinition): string[] =>
  pipelineProblems(d, ctx).map((p) => p.code);

describe('shipped pipelines', () => {
  it.each(['express', 'standard', 'full'] as const)('the %s lane is valid', (lane) => {
    expect(pipelineProblems(BUILTIN_PIPELINES[lane], { roster, lane })).toEqual([]);
  });
});

describe('each rule, one list that breaks it', () => {
  it('merge_missing and merge_not_last', () => {
    expect(codes(def(impl, g1))).toContain('merge_missing');
    expect(codes(def(impl, merge, g1))).toContain('merge_not_last');
    expect(codes(def(impl, g1, merge, merge))).toContain('merge_not_last');
  });

  it('no_writer, g1_missing, g1_duplicate and g1_before_writer', () => {
    expect(codes(def(reviewer, g1, merge))).toContain('no_writer');
    expect(codes(def(impl, merge))).toContain('g1_missing');
    expect(codes(def(impl, g1, { ...g1, id: 'g1b' }, merge))).toContain('g1_duplicate');
    expect(codes(def(g1, impl, merge))).toContain('g1_before_writer');
  });

  it('duplicate_stage_id, including a group member', () => {
    expect(codes(def(impl, g1, { ...reviewer, id: 'g1' }, merge))).toContain(
      'duplicate_stage_id',
    );

    const group: Stage = {
      id: 'grp',
      kind: 'group',
      label: 'Group',
      join: 'all',
      members: [
        { id: 'implementer', kind: 'agent', label: 'R', agent: 'reviewer' },
        { id: 'm2', kind: 'agent', label: 'C', agent: 'critic' },
      ],
    };

    expect(codes(def(impl, g1, group, merge))).toContain('duplicate_stage_id');
  });

  it('unknown_agent and agent_unavailable', () => {
    expect(codes(def(impl, g1, { ...reviewer, agent: 'nobody' }, merge))).toContain(
      'unknown_agent',
    );

    const off = effectiveAgents(
      { ...BUILTIN_AGENTS },
      { custom: {}, overrides: {}, disabled: ['reviewer'] },
      ready,
    );

    expect(
      pipelineProblems(def(impl, g1, reviewer, merge), {
        roster: off,
        lane: 'standard',
      }).map((p) => p.code),
    ).toContain('agent_unavailable');
  });

  it('role_mismatch: proof on a non-tester, policy on a writer', () => {
    expect(codes(def({ ...impl, proof: 'red' }, g1, merge))).toContain('role_mismatch');
    expect(codes(def({ ...impl, on_blocking: 'hold' }, g1, merge))).toContain(
      'role_mismatch',
    );
  });

  it('reviewer_first', () => {
    expect(codes(def(reviewer, impl, g1, merge))).toContain('reviewer_first');
  });

  it('self_review: the writer agent sits where the checks sit', () => {
    const problems = pipelineProblems(
      def(impl, g1, { ...impl, id: 'again', label: 'Again' }, merge),
      ctx,
    );

    expect(problems).toContainEqual(
      expect.objectContaining({ code: 'self_review', stage_id: 'again' }),
    );
  });

  it('writer_after_check', () => {
    const problems = pipelineProblems(def(impl, g1, reviewer, tests, merge), ctx);

    expect(problems).toContainEqual(
      expect.objectContaining({ code: 'writer_after_check', stage_id: 'test-writer' }),
    );
  });

  it('group_writer and group_size', () => {
    const grp = (members: Extract<Stage, { kind: 'group' }>['members']): Stage => ({
      id: 'grp',
      kind: 'group',
      label: 'Group',
      join: 'all',
      members,
    });

    const w = { id: 'm1', kind: 'agent' as const, label: 'W', agent: 'implementer' };
    const r = { id: 'm2', kind: 'agent' as const, label: 'R', agent: 'reviewer' };

    expect(codes(def(impl, g1, grp([w, r]), merge))).toContain('group_writer');
    expect(codes(def(impl, g1, grp([r]), merge))).toContain('group_size');
  });

  it('human_position: one human stage, after every check', () => {
    expect(codes(def(impl, g1, human, reviewer, merge))).toContain('human_position');
    expect(codes(def(impl, g1, human, { ...human, id: 'h2' }, merge))).toContain(
      'human_position',
    );
  });

  it('rework_target: a self, forward, unknown or non-writer target is refused', () => {
    expect(codes(def(impl, g1, { ...reviewer, rework_to: 'reviewer' }, merge))).toContain(
      'rework_target',
    );

    expect(codes(def(impl, { ...g1, rework_to: 'reviewer' }, reviewer, merge))).toContain(
      'rework_target',
    );

    expect(codes(def(impl, g1, { ...reviewer, rework_to: 'g1' }, merge))).toContain(
      'rework_target',
    );

    expect(codes(def(impl, g1, { ...reviewer, rework_to: 'ghost' }, merge))).toContain(
      'rework_target',
    );

    expect(
      codes(def(tests, impl, g1, { ...reviewer, rework_to: 'test-writer' }, merge)),
    ).toEqual([]);
  });

  it('script_invalid: an empty command, a multi-line command, a folder outside the worktree, G1 in a group', () => {
    const bad = (run: Record<string, unknown>): Stage =>
      ({ ...script, run: { ...(script as { run: object }).run, ...run } }) as Stage;

    expect(codes(def(impl, g1, bad({ command: ' ' }), merge))).toContain(
      'script_invalid',
    );

    expect(codes(def(impl, g1, bad({ command: 'a\nb' }), merge))).toContain(
      'script_invalid',
    );

    expect(codes(def(impl, g1, bad({ cwd: '../x' }), merge))).toContain('script_invalid');

    const inGroup: Stage = {
      id: 'grp',
      kind: 'group',
      label: 'G',
      join: 'all',
      members: [
        { id: 'a', kind: 'script_gate', label: 'A', run: { builtin: 'g1' } },
        { id: 'b', kind: 'agent', label: 'B', agent: 'reviewer' },
      ],
    };

    expect(codes(def(impl, g1, inGroup, merge))).toContain('script_invalid');
  });

  it('review_tool_missing: a check agent that cannot submit a review', () => {
    const mute = {
      ...(BUILTIN_AGENTS['reviewer'] as (typeof BUILTIN_AGENTS)[string]),
      tools: ['read', 'grep'],
    };

    const r = effectiveAgents({ ...BUILTIN_AGENTS, reviewer: mute }, undefined, ready);

    expect(
      pipelineProblems(def(impl, g1, reviewer, merge), {
        roster: r,
        lane: 'standard',
      }).map((p) => p.code),
    ).toContain('review_tool_missing');
  });

  it('too_many_stages', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ ...reviewer, id: `r${i}` }));

    expect(codes({ stages: [impl, g1, ...many, merge] })).toContain('too_many_stages');
  });

  it('names the stage a problem concerns', () => {
    const problems = pipelineProblems(
      def(impl, g1, { ...reviewer, agent: 'nobody' }, merge),
      ctx,
    );

    expect(problems[0]).toMatchObject({ code: 'unknown_agent', stage_id: 'reviewer' });
  });
});

describe('routing rules', () => {
  const rule = (over: Record<string, unknown> = {}) => ({
    id: 'net',
    paths: ['**/*.tf'],
    add: 'reviewer',
    ...over,
  });

  it('accepts a reviewer and a researcher-role check and refuses writers, unknown agents and duplicates', () => {
    expect(routingProblems([rule()], roster)).toEqual([]);
    expect(
      routingProblems([rule({ add: 'implementer' })], roster).map((p) => p.code),
    ).toEqual(['routing_writer']);

    expect(
      routingProblems([rule({ add: 'test-writer' })], roster).map((p) => p.code),
    ).toEqual(['routing_writer']);

    expect(routingProblems([rule({ add: 'nobody' })], roster).map((p) => p.code)).toEqual(
      ['unknown_agent'],
    );

    expect(
      routingProblems([rule(), rule({ add: 'critic' })], roster).map((p) => p.code),
    ).toEqual(['duplicate_rule_id']);
  });
});
