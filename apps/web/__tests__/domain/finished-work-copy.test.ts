/**
 * Pins: the words of a held decision and a sign-off: findings ordered worst first and placed as
 * `file:line`, the sign-off checks line, the titles of every decision and sign-off cause, the
 * labels of the two overrule actions, and the banner sentence that leads to the Review tab.
 *
 * Why: the same item reads in the card chat, on the Ticket page and in the Inbox, so its sentences
 * are chosen once. A finding list that buries the serious one, a location the owner cannot open,
 * or a cause that arrives without a title would each leave the owner deciding blind.
 * Depends on: src/domain/finished-work-copy, src/domain/escalation-copy. Pure.
 */

import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, escalationTitle, settledWords } from '#/domain/escalation-copy.js';
import {
  DECISION_LEAD,
  SIGN_OFF_WHY,
  TIER_WORDS,
  bySeverity,
  checksLine,
  reviewHeadline,
  reworkLine,
  unplannedLine,
  whereOf,
} from '#/domain/finished-work-copy.js';
import { DecisionCause, EscalationView, SignOffCause } from '#/schemas/escalation.js';
import { decisionView, signOffView } from '#tests/helpers/finished-work-views.js';

const finding = (
  severity: 'critical' | 'high' | 'medium' | 'low',
  file?: string,
  line?: number,
) => ({
  severity,
  issue: `${severity} issue`,
  evidence: 'evidence',
  ...(file === undefined ? {} : { file }),
  ...(line === undefined ? {} : { line }),
});

describe('findings', () => {
  it('orders worst first and keeps the given order inside a severity', () => {
    const sorted = bySeverity([
      finding('low', 'a.ts'),
      finding('high', 'b.ts'),
      finding('medium', 'c.ts'),
      finding('high', 'd.ts'),
      finding('critical', 'e.ts'),
    ]);

    expect(sorted.map((f) => f.file)).toEqual(['e.ts', 'b.ts', 'd.ts', 'c.ts', 'a.ts']);
  });

  it('does not reorder the list it was given', () => {
    const given = [finding('low'), finding('high')];

    bySeverity(given);

    expect(given.map((f) => f.severity)).toEqual(['low', 'high']);
  });

  it('places a finding as file:line, file alone, or nothing', () => {
    expect(whereOf(finding('low', 'src/a.ts', 12))).toBe('src/a.ts:12');
    expect(whereOf(finding('low', 'src/a.ts'))).toBe('src/a.ts');
    expect(whereOf(finding('low'))).toBe('');
  });
});

describe('lines of the decision and the sign-off', () => {
  it('says how often work was sent back, and nothing before the first time', () => {
    expect(reworkLine({ count: 0, cap: 2 })).toBeNull();
    expect(reworkLine({ count: 2, cap: 2 })).toBe('Sent back 2 of 2 times so far.');
  });

  it('counts the unplanned files with the right noun', () => {
    expect(unplannedLine(1)).toBe('1 file the plan did not name');
    expect(unplannedLine(3)).toBe('3 files the plan did not name');
  });

  it('says what stood behind a sign-off: passed checks, findings and overrules', () => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };

    expect(checksLine({ passed: 1, counts, overrides: 0 })).toBe('1 check passed.');
    expect(
      checksLine({ passed: 3, counts: { ...counts, high: 1, low: 2 }, overrides: 2 }),
    ).toBe('3 checks passed. 1 high, 2 low. 2 held findings overruled by you.');
  });
});

describe('titles and labels', () => {
  it('words every decision cause and every sign-off cause, with the tier in words', () => {
    for (const cause of DecisionCause.options) {
      expect(DECISION_LEAD[cause]).toMatch(/\.$/);
      expect(escalationTitle(EscalationView.parse(decisionView(cause)))).toMatch(
        /^Held: /,
      );
    }

    for (const cause of SignOffCause.options) {
      expect(SIGN_OFF_WHY[cause]).toMatch(/\.$/);
      expect(escalationTitle(EscalationView.parse(signOffView(cause)))).not.toBe('');
    }

    expect(Object.values(TIER_WORDS).every((words) => /^Tier [ABC]: /.test(words))).toBe(
      true,
    );
  });

  it('labels the two overrule actions and says who settled them', () => {
    expect(ACTION_LABEL.merge_anyway).toBe('Merge anyway');
    expect(ACTION_LABEL.continue).toBe('Continue');
    expect(settledWords('merge_anyway', 'owner')).toBe('Merged anyway by you');
    expect(settledWords('continue', 'owner')).toBe('Continued as is by you');
  });
});

describe('the banner that leads to the Review tab', () => {
  const detail = (status: string, escalations: object[] = []) =>
    ({ ticket: { status }, escalations }) as never;

  it('names a held decision, a sign-off wait and a plain review', () => {
    const held = { stage: 'owner', payload: { kind: 'decision' } };

    expect(reviewHeadline(detail('waiting_human', [held]))).toBe(
      'This ticket is held for your decision.',
    );

    expect(reviewHeadline(detail('needs_signoff'))).toBe(
      'This ticket needs your sign-off.',
    );

    expect(reviewHeadline(detail('review'))).toBe(
      'This ticket is ready for your review.',
    );
  });
});
