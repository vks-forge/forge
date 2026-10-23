/**
 * Pins: the words of what Re-plan, Cancel ticket and Merge anyway change, built from the server's
 * lists: held and kept tickets, the stop, what a cancel deletes, the overruled check.
 *
 * Why: the popups say these sentences before an irreversible act. A held ticket not named, a
 *   cancel that omits the closed pull request or a merge anyway that does not say the merge
 *   cannot be undone would leave the owner confirming blind.
 * Depends on: src/domain/consequence-copy. Pure.
 */

import { describe, expect, it } from 'vitest';
import {
  cancelWords,
  cheaperLine,
  mechanicalWords,
  mergeAnywayWords,
  replanWords,
} from '#/domain/consequence-copy.js';

const ticket = { id: 'CHE-6', title: 'Report' } as never;

describe('replanWords', () => {
  const base = {
    action: 'replan' as const,
    ticket,
    card_id: null,
    ticket_replaced: true,
    held: [],
    kept: [],
    stop: null,
    mechanical: null,
  };

  it('says no other ticket is waiting when none is held, and always ends with the owner approval', () => {
    const lines = replanWords(base).map((l) => l.text);

    expect(lines).toContain('No other ticket is waiting to start.');
    expect(lines.at(-1)).toBe('You approve the new plan before anything is replaced.');
  });

  it('names held tickets and where each kept ticket stands', () => {
    const lines = replanWords({
      ...base,
      held: [{ id: 'CHE-7', title: 'Export' }] as never,
      kept: [{ id: 'CHE-3', title: 'Schema', status: 'done' }] as never,
    });

    expect(lines.find((l) => l.tickets?.[0]?.id === 'CHE-7')?.text).toMatch(
      /^1 ticket that has not started is held/,
    );

    expect(lines.find((l) => l.tickets?.[0]?.id === 'CHE-3')?.tickets?.[0]?.note).toBe(
      'done',
    );
  });

  it('puts the stop with its finding count in front of the Director', () => {
    const lines = replanWords({
      ...base,
      stop: { cause: 'findings_hold', summary: 'Critique found problems', findings: 1 },
    });

    expect(lines[1]?.text).toBe(
      'The Director gets why CHE-6 stopped (Critique found problems, with 1 finding) together with your comment.',
    );
  });
});

describe('cancelWords', () => {
  it('lists the run, the deleted branch, the closed pull request and the dependents', () => {
    const text = cancelWords({
      action: 'cancel',
      ticket,
      run_active: true,
      branch: 'forge/CHE-6',
      has_worktree: true,
      pr_number: 9,
      dependents: [{ id: 'CHE-8', title: 'Next' }] as never,
    })
      .map((l) => l.text)
      .join(' ');

    expect(text).toMatch(/Worker running on it stops/);
    expect(text).toMatch(/\(forge\/CHE-6\) are deleted/);
    expect(text).toMatch(/Pull request #9 is closed/);
    expect(text).toMatch(/1 ticket waits on it/);
  });
});

describe('mergeAnywayWords', () => {
  it('names the overruled stage and says the merge cannot be undone', () => {
    const text = mergeAnywayWords({
      action: 'merge_anyway',
      ticket,
      overruled: [
        {
          stage_label: 'Critique',
          summary: 's',
          counts: { high: 2 },
          findings: [{ severity: 'high', where: 'a.ts:1', issue: 'Bad' }],
        },
      ],
      branch: null,
      pr_number: null,
    }).map((l) => l.text);

    expect(text[0]).toBe('Overrules Critique: 2 high. a.ts:1 Bad');
    expect(text.at(-1)).toBe('A merge cannot be undone from Forge.');
  });
});

describe('mechanical stops', () => {
  it('names the kind and the cheaper way in the button own words', () => {
    expect(mechanicalWords('generated')).toMatch(/generated-file problem/);
    expect(cheaperLine('Send back for rework')).toBe(
      'Send back for rework fixes this without re-planning.',
    );
  });
});
