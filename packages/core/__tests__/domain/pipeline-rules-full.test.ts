/**
 * Pins the Full lane's pipeline rules: writer groups, the Director check, the sign-off, the critic.
 *
 * Why: the Full lane adds stages that move trust. Two writers share one worktree, so a list that
 *   lets their scopes meet would let them overwrite each other; a group that mixes writers and
 *   checks would let a writer sit in the check phase; the Director's check judges finished work,
 *   so one placed before G1 or before another check judges unfinished work; and a sign-off before
 *   a check would let the owner or Director sign work that was not yet reviewed. Once a second
 *   model family exists the critic must be a different one (d-0073). Each rule is pinned by a list
 *   built to break exactly it, and the scope-overlap test by properties, because a miss lets two
 *   writers edit the same file.
 *
 * Pins: group_mixed, writer_scope_overlap (disjoint accepted, nested, `**` and the same agent
 *   refused), writer_group_proof, group_size, director_check_position and _duplicate,
 *   sign_off_position (also against a human stage), critic_same_family (problem with two families,
 *   none with one), a valid Full list with a writer group, scopesOverlap being symmetric and
 *   conservative, unplannedFiles.
 * Depends on: src/domain/{pipeline-rules,scope-overlap,unplanned-files,effective-agents,builtin-agents}, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { effectiveAgents } from '#/domain/effective-agents.js';
import { pipelineProblems } from '#/domain/pipeline-rules.js';
import { globsOverlap, scopesOverlap } from '#/domain/scope-overlap.js';
import { unplannedFiles } from '#/domain/unplanned-files.js';
import type { AgentDefinition } from '#/schemas/agent.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';

const implementer = BUILTIN_AGENTS['implementer'] as AgentDefinition;
const shippedReviewer = BUILTIN_AGENTS['reviewer'] as AgentDefinition;

const writer = (name: string, write_scope: string[]): AgentDefinition => ({
  ...implementer,
  name,
  write_scope,
});

const ready = () => ({ ready: true, reasons: [] });
const roster = effectiveAgents(
  {
    ...BUILTIN_AGENTS,
    'frontend-writer': writer('Frontend', ['apps/web/**']),
    'backend-writer': writer('Backend', ['packages/**']),
    'api-writer': writer('Api', ['packages/api/**']),
    'whole-writer': writer('Whole', ['**']),
  },
  undefined,
  ready,
);

const ctx = { roster, lane: 'full' as const, families_available: ['claude'] };
const codes = (stages: Stage[], families = ['claude']): string[] =>
  pipelineProblems({ stages } as PipelineDefinition, {
    ...ctx,
    families_available: families,
  }).map((p) => p.code);

const member = (id: string, agent: string, extra: object = {}): Stage =>
  ({ id, kind: 'agent', label: id, agent, ...extra }) as Stage;

const group = (members: Stage[]): Stage =>
  ({ id: 'writers', kind: 'group', label: 'Writers', join: 'all', members }) as Stage;

const g1: Stage = { id: 'g1', kind: 'script_gate', label: 'G1', run: { builtin: 'g1' } };
const merge: Stage = { id: 'merge', kind: 'merge', label: 'Merge', locked: true };
const reviewer = member('reviewer', 'reviewer');
const dcheck: Stage = { id: 'check-plan', kind: 'director_check', label: 'Check' };
const sign: Stage = {
  id: 'sign-off',
  kind: 'sign_off',
  label: 'Sign off',
  signer: 'director_or_owner',
  prompt: 'Sign.',
};

const duo = group([member('fe', 'frontend-writer'), member('be', 'backend-writer')]);

describe('writer groups', () => {
  it('accepts two writers with disjoint scopes before G1', () => {
    expect(codes([duo, g1, reviewer, dcheck, sign, merge])).toEqual([]);
  });

  it('refuses nested scopes, a whole-repo scope and the same agent twice', () => {
    const nested = group([member('be', 'backend-writer'), member('api', 'api-writer')]);
    const whole = group([member('fe', 'frontend-writer'), member('all', 'whole-writer')]);
    const twice = group([member('a', 'frontend-writer'), member('b', 'frontend-writer')]);

    for (const g of [nested, whole, twice]) {
      expect(codes([g, g1, merge])).toContain('writer_scope_overlap');
    }
  });

  it('refuses a group that mixes a writer and a check, with group_mixed on the group', () => {
    const mixed = group([member('fe', 'frontend-writer'), member('r', 'reviewer')]);

    expect(codes([member('implementer', 'implementer'), g1, mixed, merge])).toEqual(
      expect.arrayContaining(['group_mixed', 'group_writer']),
    );
  });

  it('refuses a red proof inside a writer group and a group of one or five', () => {
    const proof = group([
      member('fe', 'frontend-writer'),
      member('be', 'backend-writer', { proof: 'red' }),
    ]);

    expect(codes([proof, g1, merge])).toContain('writer_group_proof');
    expect(codes([group([member('fe', 'frontend-writer')]), g1, merge])).toContain(
      'group_size',
    );
  });
});

describe('the Director check and the sign-off', () => {
  const impl = member('implementer', 'implementer');

  it('refuses a Director check before G1, before another check, or twice', () => {
    expect(codes([impl, dcheck, g1, merge])).toContain('director_check_position');
    expect(codes([impl, g1, dcheck, reviewer, merge])).toContain(
      'director_check_position',
    );

    expect(
      codes([impl, g1, reviewer, dcheck, { ...dcheck, id: 'again' }, merge]),
    ).toContain('director_check_duplicate');
  });

  it('accepts a Director check after G1 and every check', () => {
    expect(codes([impl, g1, reviewer, dcheck, merge])).toEqual([]);
  });

  it('refuses a sign-off before a check, before the Director check, or beside a human stage', () => {
    const human: Stage = { id: 'human', kind: 'human', label: 'You', prompt: 'Look.' };

    expect(codes([impl, g1, sign, reviewer, merge])).toContain('sign_off_position');
    expect(codes([impl, g1, reviewer, sign, dcheck, merge])).toContain(
      'sign_off_position',
    );

    expect(codes([impl, g1, reviewer, human, sign, merge])).toContain(
      'sign_off_position',
    );
  });

  it('keeps a saved list with a human stage and no Director check valid', () => {
    const human: Stage = { id: 'human', kind: 'human', label: 'You', prompt: 'Look.' };

    expect(codes([impl, g1, reviewer, human, merge])).toEqual([]);
  });
});

describe('the critic family rule', () => {
  it('refuses the shipped Full list once two families are connected, and only then', () => {
    expect(codes([...BUILTIN_PIPELINES.full.stages], ['claude'])).toEqual([]);
    expect(codes([...BUILTIN_PIPELINES.full.stages], ['claude', 'openai'])).toContain(
      'critic_same_family',
    );
  });

  it('recognises a hand-made critic by its name', () => {
    const custom = effectiveAgents(
      {
        ...BUILTIN_AGENTS,
        devils: { ...shippedReviewer, name: 'Devil critic' },
      },
      undefined,
      ready,
    );

    const found = pipelineProblems(
      {
        stages: [member('implementer', 'implementer'), g1, member('d', 'devils'), merge],
      } as PipelineDefinition,
      { roster: custom, lane: 'full', families_available: ['claude', 'openai'] },
    );

    expect(found.map((p) => p.code)).toContain('critic_same_family');
  });
});

describe('scopesOverlap', () => {
  it.each([
    [['apps/web/**'], ['packages/**'], false],
    [['src/**'], ['src/api/**'], true],
    [['**'], ['anything/at/all.ts'], true],
    [['docs/readme.md'], ['docs/readme.mdx'], false],
    [['docs/readme.md'], ['docs/**'], true],
    [['*.sql'], ['db/**'], true],
    [['a/*.ts'], ['b/*.ts'], false],
  ])('%j against %j: %s', (a, b, expected) => {
    expect(scopesOverlap(a, b)).toBe(expected);
  });

  it('is symmetric, and a scope always overlaps itself', () => {
    const glob = fc.constantFrom(
      'apps/web/**',
      'packages/**',
      'src/*.ts',
      'src/api/**',
      '**',
      '*.md',
      'docs/a.md',
      'docs/**',
      'lib/{a,b}/**',
    );

    fc.assert(
      fc.property(glob, glob, (a, b) => {
        expect(globsOverlap(a, b)).toBe(globsOverlap(b, a));
        expect(globsOverlap(a, a)).toBe(true);
      }),
    );
  });
});

describe('unplannedFiles', () => {
  it('names changed files the plan did not cover, glob-aware, sorted', () => {
    expect(
      unplannedFiles(
        ['src/api/**', 'docs/readme.md', 'lib'],
        ['src\\api\\a.ts', 'src/web/b.ts', 'docs/readme.md', 'lib/x/y.ts', 'a.txt'],
      ),
    ).toEqual(['a.txt', 'src/web/b.ts']);
  });

  it('judges nothing when the plan lists no files', () => {
    expect(unplannedFiles([], ['a.ts'])).toEqual([]);
  });

  it('counts a deleted planned file as planned', () => {
    expect(unplannedFiles(['src/old.ts'], ['src/old.ts'])).toEqual([]);
  });
});
