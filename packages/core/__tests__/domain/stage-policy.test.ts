/**
 * Pins what counts as blocking, how findings are shown to the next Worker, and what a legacy
 * ticket adopts.
 *
 * Why: these small rules decide whether a stage result stops the merge. A finding blocks only for a
 *   severity the stage lists (default critical and high); a failed gate blocks always; a blocked
 *   ticket's findings must reach the next Worker as text it can act on; and a ticket that was past its
 *   writers when pipelines went live must adopt them rather than be asked to write again.
 *
 * Pins: default and custom blocking severities, an empty list blocks nothing, a failed gate blocks
 *   whatever the review says, the rendered findings name severity, place and evidence, policy
 *   defaults for every stage kind, and `adoptLegacy` per ticket status.
 * Depends on: src/domain/{stage-policy,builtin-pipelines}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import {
  DEFAULT_BLOCKING,
  adoptLegacy,
  blockingCount,
  checkPolicy,
  isBlocking,
  renderBlocking,
} from '#/domain/stage-policy.js';
import type { ReviewSubmission } from '#/schemas/stage-run.js';

const f = (severity: 'critical' | 'high' | 'medium' | 'low', extra = {}) => ({
  severity,
  issue: `a ${severity} issue`,
  evidence: 'x.ts:1 `y`',
  ...extra,
});

const review = (...findings: ReturnType<typeof f>[]): ReviewSubmission => ({
  verdict: 'changes',
  summary: 'looked',
  findings,
});

const policy = checkPolicy(BUILTIN_PIPELINES.standard.stages[3]!);

describe('blocking', () => {
  it('counts critical and high by default, never medium or low', () => {
    expect(policy).toEqual({ on_blocking: 'rework', blocking: DEFAULT_BLOCKING });
    expect(
      blockingCount(review(f('critical'), f('high'), f('medium'), f('low')), policy),
    ).toBe(2);

    expect(blockingCount(review(f('medium'), f('low')), policy)).toBe(0);
    expect(blockingCount(undefined, policy)).toBe(0);
  });

  it('follows the stage policy: a custom list, an empty list, hold', () => {
    const strict = { on_blocking: 'hold' as const, blocking: ['medium' as const] };

    expect(blockingCount(review(f('high'), f('medium')), strict)).toBe(1);
    expect(blockingCount(review(f('critical')), { ...strict, blocking: [] })).toBe(0);
    expect(
      checkPolicy({
        id: 'r',
        kind: 'agent',
        label: 'R',
        agent: 'reviewer',
        on_blocking: 'hold',
        blocking: ['low'],
      }),
    ).toEqual({ on_blocking: 'hold', blocking: ['low'] });
  });

  it('a failed gate blocks whatever the review says; a passed one does not', () => {
    expect(isBlocking({ gate: { status: 'failed' } }, policy)).toBe(true);
    expect(isBlocking({ gate: { status: 'passed' } }, policy)).toBe(false);
    expect(isBlocking({ gate: { status: 'error' } }, policy)).toBe(false);
    expect(isBlocking({ review: review(f('high')) }, policy)).toBe(true);
    expect(isBlocking({}, policy)).toBe(false);
  });

  it('gives the defaults to a stage with no policy of its own, and holds for the Director check', () => {
    for (const stage of BUILTIN_PIPELINES.full.stages) {
      expect(checkPolicy(stage).on_blocking).toBe(
        stage.kind === 'director_check' ? 'hold' : 'rework',
      );
    }
  });

  it('renders only the blocking findings, with severity, place and evidence', () => {
    const text = renderBlocking(
      'Review',
      review(f('high', { file: 'src/a.ts', line: 12 }), f('low')),
      policy,
    );

    expect(text).toContain('1 blocking finding');
    expect(text).toContain('[high] src/a.ts:12: a high issue');
    expect(text).toContain('evidence: x.ts:1');
    expect(text).not.toContain('a low issue');
  });
});

describe('adoptLegacy', () => {
  const snapshot = {
    definition: BUILTIN_PIPELINES.standard,
    roles: { implementer: 'writer', 'test-writer': 'tester', reviewer: 'reviewer' },
  } as const;

  it.each(['verifying', 'review', 'needs_signoff'] as const)(
    'adopts every writer of a ticket that is %s',
    (status) => {
      expect(
        adoptLegacy({ status }, snapshot).map((s) => [s.stage_id, s.status, s.cycle]),
      ).toEqual([
        ['test-writer', 'adopted', 0],
        ['implementer', 'adopted', 0],
      ]);
    },
  );

  it.each([
    'inbox',
    'planned',
    'in_progress',
    'waiting_human',
    'blocked',
    'done',
  ] as const)('adopts nothing for a ticket that is %s', (status) => {
    expect(adoptLegacy({ status }, snapshot)).toEqual([]);
  });
});
