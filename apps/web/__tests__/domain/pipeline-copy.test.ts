/**
 * Pins: the words of the pipeline editor and the ticket strip: a sentence for every problem
 * code, the reading of a refused write, the lane tags, and the strip's status and rework words.
 *
 * Why: the editor refuses an unsafe list with a code the owner must be able to act on. A code
 * without a sentence would leak an enum value onto the screen; a refusal explained from the
 * message instead of the code would change when the server rewords it. The strip's "Rework 1 of
 * 2" is the only warning that the cap is near.
 * Depends on: domain/pipeline-copy, domain/stage-view-copy, api/api-error.
 */

import { PIPELINE_PROBLEM_CODES } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import {
  PROBLEM_WORDS,
  pipelineErrorText,
  problemWords,
  problemsOf,
  tagWords,
} from '#/domain/pipeline-copy.js';
import {
  STATUS_VIEW,
  artifactLabel,
  countsLine,
  reworkBadge,
  ruleFor,
} from '#/domain/stage-view-copy.js';

const refusal = (code: string, body: unknown = {}) =>
  new ApiError('http', 'raw server text', { status: 400, code, body });

describe('problem words', () => {
  it('has a distinct plain sentence for every problem code and never an enum value', () => {
    const sentences = PIPELINE_PROBLEM_CODES.map((code) =>
      problemWords({ code, message: 'server text' }),
    );

    expect(new Set(sentences).size).toBe(PIPELINE_PROBLEM_CODES.length);
    expect(Object.keys(PROBLEM_WORDS)).toHaveLength(PIPELINE_PROBLEM_CODES.length);

    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });

  it('reads the problems a refused save carries, and none from anything else', () => {
    const problem = { code: 'self_review', stage_id: 'reviewer', message: 'm' };

    expect(
      problemsOf(
        refusal('pipeline_invalid', {
          error: { code: 'pipeline_invalid', problems: [problem] },
        }),
      ),
    ).toEqual([problem]);

    expect(
      problemsOf(refusal('pipeline_invalid', { error: { problems: 'nope' } })),
    ).toEqual([]);

    expect(problemsOf(new Error('x'))).toEqual([]);
  });
});

describe('refused writes', () => {
  it.each([
    ['pipeline_invalid', 'This pipeline cannot be saved'],
    ['routing_invalid', 'These rules cannot be saved'],
    ['not_overridden', 'Nothing to reset'],
    ['lane_unknown', 'No such lane'],
    ['project_not_found', 'This project is gone'],
    ['invalid_request', 'Forge did not accept this'],
  ])('explains %s from its code, not its message', (code, title) => {
    const text = pipelineErrorText(refusal(code));

    expect(text.title).toBe(title);
    expect(text.detail).not.toContain('raw server text');
  });

  it('falls back to the general words for anything else', () => {
    expect(pipelineErrorText(new ApiError('network', 'x')).title).toBe(
      'Cannot reach Forge',
    );
  });
});

describe('lane tags', () => {
  it('says built-in or edited for the company and changed or same for a project', () => {
    expect(tagWords(['builtin'], 'company').label).toBe('Built-in');
    expect(tagWords(['edited'], 'company').label).toBe('Edited');
    expect(tagWords(['builtin', 'project'], 'project').label).toBe(
      'Changed from company default',
    );

    expect(tagWords(['builtin', 'company'], 'project').label).toBe(
      'Same as company default',
    );
  });
});

describe('strip words', () => {
  it('has a label for every stage status', () => {
    expect(Object.keys(STATUS_VIEW).sort()).toEqual([
      'adopted',
      'error',
      'failed',
      'passed',
      'pending',
      'running',
      'skipped',
      'waiting',
    ]);
  });

  it('words the rework count, the findings and the artifacts', () => {
    expect(reworkBadge({ count: 0, cap: 2 })).toBeNull();
    expect(reworkBadge({ count: 1, cap: 2 })).toBe('Rework 1 of 2');
    expect(countsLine({ critical: 0, high: 2, medium: 0, low: 1 })).toBe('2 high, 1 low');
    expect(countsLine({ critical: 0, high: 0, medium: 0, low: 0 })).toBe('No findings');
    expect(countsLine(undefined)).toBeNull();
    expect(artifactLabel('narrative')).toBe('Worker’s own account');
    expect(artifactLabel('mystery')).toBe('mystery');
  });

  it('finds the rule that added a stage', () => {
    const routed = [
      { rule_id: 'tf', agent: 'reviewer', stage_id: 'net', at: 'diff' as const },
    ];

    expect(ruleFor(routed, 'net')?.rule_id).toBe('tf');
    expect(ruleFor(routed, 'other')).toBeUndefined();
  });
});
