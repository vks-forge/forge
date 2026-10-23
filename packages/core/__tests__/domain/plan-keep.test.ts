/**
 * Tests for the plan keep rule.
 *
 * Why: a new plan once cancelled tickets that had runs, a branch and a worktree (CHE-3, CHE-6)
 *   because only the status was checked. These cases pin what counts as started, so the
 *   Director's input and the approval cannot disagree again.
 *
 * Pins: untouched tickets are replaceable; a run or open item keeps a
 *   ticket; running, finished and cancelled statuses.
 * Depends on: src/domain/plan-keep, vitest.
 */

import { describe, expect, it } from 'vitest';
import { isKeptTicket, isReplaceableTicket } from '#/domain/plan-keep.js';
import type { PlanKeepFacts } from '#/types/plan-keep.types.js';

const facts = (over: Partial<PlanKeepFacts> = {}): PlanKeepFacts => ({
  status: 'planned',
  hasRuns: false,
  openItems: false,
  ...over,
});

describe('plan keep rule', () => {
  it.each(['inbox', 'planned', 'waiting_human', 'blocked'] as const)(
    'replaces a never-started %s ticket',
    (status) => {
      expect(isReplaceableTicket(facts({ status }))).toBe(true);
      expect(isKeptTicket(facts({ status }))).toBe(false);
    },
  );

  it.each([
    ['a run', { hasRuns: true }],
    ['an open interaction', { openItems: true }],
  ] as const)('keeps a planned ticket that has %s', (_name, over) => {
    expect(isKeptTicket(facts(over))).toBe(true);
    expect(isReplaceableTicket(facts(over))).toBe(false);
  });

  it('replaces a never-run ticket that only has a prepared branch and worktree', () => {
    expect(isReplaceableTicket(facts({ status: 'waiting_human' }))).toBe(true);
  });

  it('replaces a ticket with runs only when the owner re-planned from it', () => {
    expect(isReplaceableTicket(facts({ hasRuns: true, replanOrigin: true }))).toBe(true);
    expect(isReplaceableTicket(facts({ hasRuns: true, replanOrigin: false }))).toBe(
      false,
    );

    expect(isKeptTicket(facts({ hasRuns: true, replanOrigin: true }))).toBe(false);
    expect(
      isKeptTicket(facts({ status: 'in_progress', hasRuns: true, replanOrigin: true })),
    ).toBe(true);
  });

  it.each(['in_progress', 'verifying', 'review', 'needs_signoff', 'done'] as const)(
    'keeps a %s ticket',
    (status) => {
      expect(isKeptTicket(facts({ status }))).toBe(true);
    },
  );

  it('treats a cancelled ticket as neither kept nor replaceable', () => {
    expect(isKeptTicket(facts({ status: 'cancelled' }))).toBe(false);
    expect(isReplaceableTicket(facts({ status: 'cancelled' }))).toBe(false);
  });
});
