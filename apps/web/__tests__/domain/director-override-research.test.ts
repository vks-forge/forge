/**
 * Pins: the research caps in a project's Director override are checked in words before a save
 * (ranges the server enforces), toggling the override copies the company value in, and editing
 * one cap writes the whole research section.
 *
 * Why: the server refuses a cap outside its range with a schema error the owner cannot read.
 *   Catching it in the page, in the units the owner typed, keeps a typo from costing a save
 *   attempt with a reason already written. A project override replaces its keys, so one cap
 *   edited alone must carry the others the project already sees.
 * Depends on: domain/director-override, domain/director-defaults. No DOM.
 */

import { describe, expect, it } from 'vitest';
import { FALLBACK_DIRECTOR } from '#/domain/director-defaults.js';
import {
  directorIssues,
  setDirectorPath,
  toggleDirectorKey,
} from '#/domain/director-override.js';

const seen = (research: Partial<typeof FALLBACK_DIRECTOR.research>) => ({
  ...FALLBACK_DIRECTOR,
  research: { ...FALLBACK_DIRECTOR.research, ...research },
});

describe('research caps in a project override', () => {
  it('accepts the shipped caps and the edges of every range', () => {
    expect(directorIssues(seen({}), { research: seen({}).research })).toEqual([]);

    expect(
      directorIssues(
        seen({
          max_rounds: 10,
          max_searches: 0,
          max_fetches: 100,
          max_bytes: 20_000_000,
          max_runs_per_card: 100,
        }),
        { research: seen({}).research },
      ),
    ).toEqual([]);
  });

  it('names a cap outside its range or not a whole number', () => {
    for (const bad of [
      { max_rounds: 11 },
      { max_rounds: 0 },
      { max_searches: 101 },
      { max_fetches: 101 },
      { max_bytes: 20_000_001 },
      { max_fetches: -1 },
      { max_bytes: 10_000 },
      { max_runs_per_card: 101 },
      { max_rounds: 1.5 },
      { max_rounds: Number.NaN },
    ]) {
      const next = seen(bad);

      expect(directorIssues(next, { research: next.research })).toEqual([
        'Research needs 1 to 10 rounds, 0 to 100 searches and pages, 50 to 20000 KB and 1 to 100 runs per card, all whole numbers.',
      ]);
    }
  });

  it('accepts 40 runs per card and 50 searches, and refuses 101 runs (d-0171)', () => {
    const ok = seen({ max_runs_per_card: 40, max_searches: 50 });

    expect(directorIssues(ok, { research: ok.research })).toEqual([]);

    const bad = seen({ max_runs_per_card: 101 });

    expect(directorIssues(bad, { research: bad.research })).toHaveLength(1);
  });

  it('accepts an empty per-call budget and refuses a zero or negative one', () => {
    const empty = seen({});

    expect(directorIssues(empty, { research: empty.research })).toEqual([]);

    for (const bad of [0, -1]) {
      const next = seen({ step_budget_usd: bad });

      expect(directorIssues(next, { research: next.research })).toEqual([
        'The research call budget must be more than 0, or left empty.',
      ]);
    }
  });

  it('says nothing about research while the project does not override it', () => {
    expect(directorIssues(seen({ max_rounds: 99 }), {})).toEqual([]);
  });

  it('copies the company caps in when the override is switched on, and writes the whole section on an edit', () => {
    const on = toggleDirectorKey({}, 'research', true, FALLBACK_DIRECTOR);

    expect(on.research).toEqual(FALLBACK_DIRECTOR.research);

    const edited = setDirectorPath(
      FALLBACK_DIRECTOR,
      on,
      'director.research.max_rounds',
      3,
    );

    expect(edited.research).toEqual({ ...FALLBACK_DIRECTOR.research, max_rounds: 3 });
    expect(toggleDirectorKey(edited, 'research', false, FALLBACK_DIRECTOR)).toEqual({});
  });
});
