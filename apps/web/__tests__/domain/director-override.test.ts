/**
 * Pins: how a project's partial Director override is built, written and checked.
 *
 * Why: a project stores only what it changed. Switching an override on must start from the
 *   company value, off must remove the key (so later company changes still reach the project),
 *   and editing one number in a group must write the whole group or the stored section would
 *   lose its other keys. A save that the server would refuse must be caught in the page first.
 * Depends on: domain/director-override, domain/director-settings, domain/director-defaults,
 *   domain/settings-draft. No DOM.
 */

import { describe, expect, it } from 'vitest';
import { FALLBACK_DIRECTOR } from '#/domain/director-defaults.js';
import {
  directorDraftOf,
  directorIssues,
  setDirectorPath,
  toggleDirectorKey,
} from '#/domain/director-override.js';
import { effectiveDirector, overriddenKeys } from '#/domain/director-settings.js';

const company = FALLBACK_DIRECTOR;

describe('an override and what the project sees', () => {
  it('reads a stored override: overridden exactly when it names a key', () => {
    expect(directorDraftOf(undefined)).toEqual({ overridden: false, value: {} });
    expect(directorDraftOf({ house_rules: 'x' })).toEqual({
      overridden: true,
      value: { house_rules: 'x' },
    });
  });

  it('lays the override over the company values; lists replace, groups merge', () => {
    const seen = effectiveDirector(company, {
      house_rules: 'No billing',
      grill: { max_rounds: 1 } as never,
      flow: [company.flow[4]!, company.flow[5]!],
    });

    expect(seen.house_rules).toBe('No billing');
    expect(seen.grill).toEqual({ max_questions_per_round: 8, max_rounds: 1 });
    expect(seen.flow).toHaveLength(2);
    expect(seen.approval_mode).toBe(company.approval_mode);
  });

  it('turns one setting on from the company value and off by removing the key', () => {
    const on = toggleDirectorKey({}, 'approval_mode', true, company);

    expect(on).toEqual({ approval_mode: 'director_or_user' });
    expect(
      toggleDirectorKey({ ...on, house_rules: 'x' }, 'approval_mode', false, company),
    ).toEqual({
      house_rules: 'x',
    });

    expect(overriddenKeys(on)).toEqual(['approval_mode']);
  });

  it('writes the whole group when one number inside it changes', () => {
    const next = setDirectorPath(company, {}, 'director.step_timeouts_ms.verify', 90_000);

    expect(next.step_timeouts_ms).toEqual({
      ...company.step_timeouts_ms,
      verify: 90_000,
    });

    expect(setDirectorPath(company, {}, 'director.budget_warning_usd', 9)).toEqual({
      budget_warning_usd: 9,
    });
  });
});

describe('what would be refused', () => {
  it('passes the company values', () => {
    expect(directorIssues(company, {})).toEqual([]);
    expect(directorIssues(company, { flow: company.flow, grill: company.grill })).toEqual(
      [],
    );
  });

  it('reports a broken flow and non-positive numbers in words', () => {
    const seen = effectiveDirector(company, {});
    const bad = {
      ...seen,
      flow: seen.flow.slice(0, 4),
      grill: { max_questions_per_round: 0, max_rounds: 3 },
      budget_warning_usd: Number.NaN,
      read_caps: { max_files: 1.5, max_bytes: 10 },
      step_timeouts_ms: { ...seen.step_timeouts_ms, verify: -1 },
    };

    const messages = directorIssues(bad, {
      flow: bad.flow,
      grill: bad.grill,
      budget_warning_usd: bad.budget_warning_usd,
      read_caps: bad.read_caps,
      step_timeouts_ms: bad.step_timeouts_ms,
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        'The flow needs exactly one write_plan step.',
        'Question limits must be whole numbers of 1 or more.',
        'The budget warning must be more than 0.',
        'Read caps must be whole numbers of 1 or more.',
        'Every step timeout must be a whole number of 1 or more.',
      ]),
    );
  });
});
