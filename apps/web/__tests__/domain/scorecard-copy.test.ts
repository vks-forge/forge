/**
 * Pins: how a scorecard row reads without inventing a number: the headline figure by agent role, "No
 * data" for what was never measured (never zero), cost with how many runs were priced, "Too few tickets
 * to judge" instead of a rate under the threshold, run time, the verdicts on findings, and the one-line
 * summary of the roster.
 *
 * Why: the owner chooses agents and stages from these figures. A rate over three tickets, a cost shown
 * as $0.00 when no run recorded one, or a percentage where the server said the sample is too small would
 * each be an invented fact.
 * Depends on: domain/scorecard-copy, helpers/forge-data/proposal-data.
 */

import { describe, expect, it } from 'vitest';
import {
  costText,
  coverageText,
  durationText,
  findingsText,
  headlineFigure,
  insufficientText,
  reworksText,
  rowLabel,
  summaryLine,
} from '#/domain/scorecard-copy.js';
import { scorecardRow } from '#tests/helpers/forge-data/proposal-data.js';

describe('rowLabel', () => {
  it('names the slice', () => {
    expect(rowLabel({ by: 'all' })).toBe('All tickets');
    expect(rowLabel({ by: 'type', value: 'bug' })).toBe('Type: bug');
    expect(rowLabel({ by: 'tier', value: 'B' })).toBe('Tier: B');
    expect(rowLabel({ by: 'lane', value: 'standard' })).toBe('Lane: standard');
  });
});

describe('headlineFigure', () => {
  it('judges a writer by work done without rework', () => {
    expect(headlineFigure(scorecardRow())).toEqual({
      label: 'Done without rework',
      value: '75% (9 of 12)',
    });
  });

  it('judges a check by rows that passed first time', () => {
    expect(
      headlineFigure(
        scorecardRow({ clean_rate: null, pass_rate: { hits: 7, total: 10, rate: 0.7 } }),
      ),
    ).toEqual({ label: 'Passed first time', value: '70% (7 of 10)' });
  });

  it('says No data when nothing was counted, never 0%', () => {
    expect(
      headlineFigure(scorecardRow({ clean_rate: null, pass_rate: null })).value,
    ).toBe('No data');

    expect(
      headlineFigure(scorecardRow({ clean_rate: { hits: 0, total: 0, rate: null } }))
        .value,
    ).toBe('No data');
  });
});

describe('cost, reworks and time', () => {
  it('reads cost per ticket and how many runs were priced', () => {
    expect(costText(scorecardRow())).toBe('$0.42 per ticket');
    expect(coverageText(scorecardRow())).toBe('Priced for 18 of 20 runs');
  });

  it('says No cost recorded while no run recorded one, never $0.00', () => {
    const row = scorecardRow({
      cost: {
        total_usd: 0,
        per_ticket_usd: null,
        coverage: { hits: 0, total: 4, rate: 0 },
      },
    });

    expect(costText(row)).toBe('No cost recorded');
    expect(coverageText(row)).toBe('Priced for 0 of 4 runs');
  });

  it('says No runs when there were none to price', () => {
    expect(
      coverageText({
        cost: {
          total_usd: 0,
          per_ticket_usd: null,
          coverage: { hits: 0, total: 0, rate: null },
        },
      }),
    ).toBe('No runs');
  });

  it('reads reworks and run time, or No data', () => {
    expect(reworksText({ reworks_per_ticket: 0.4 })).toBe('0.4 per ticket');
    expect(reworksText({ reworks_per_ticket: null })).toBe('No data');
    expect(durationText(scorecardRow())).toBe('Median 4m 10s, slowest tenth 12m 00s');
    expect(durationText({ duration: { count: 0, median_ms: null, p90_ms: null } })).toBe(
      'No data',
    );

    expect(durationText({ duration: { count: 1, median_ms: 5000, p90_ms: null } })).toBe(
      'Median 5s',
    );
  });
});

describe('findingsText', () => {
  it('is null for a row without findings, and says none for a row with no findings found', () => {
    expect(findingsText(scorecardRow())).toBeNull();
    expect(
      findingsText({
        findings: {
          by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
          real: 0,
          false_alarm: 0,
          acted_on: 0,
          overruled: 0,
          unjudged: 0,
        },
      }),
    ).toBe('No findings');
  });

  it('lists only the verdicts that happened', () => {
    expect(
      findingsText({
        findings: {
          by_severity: { critical: 0, high: 2, medium: 1, low: 1 },
          real: 2,
          false_alarm: 1,
          acted_on: 0,
          overruled: 1,
          unjudged: 0,
        },
      }),
    ).toBe('4 found: 2 real, 1 false alarm, 1 overruled');
  });
});

describe('summaryLine', () => {
  it('says there is no record yet for no row or no tickets', () => {
    expect(summaryLine(undefined)).toBe('No finished tickets in this window yet');
    expect(summaryLine(scorecardRow({ tickets: 0 }))).toBe(
      'No finished tickets in this window yet',
    );
  });

  it('gives no verdict under the threshold, and no percentage', () => {
    const line = summaryLine(scorecardRow({ tickets: 3, insufficient: true }));

    expect(line).toBe(insufficientText({ tickets: 3 }));
    expect(line).toBe('Too few tickets to judge (3 so far, 5 needed)');
  });

  it('puts the headline first, then reworks, cost and count', () => {
    expect(summaryLine(scorecardRow())).toBe(
      'Done without rework 75% (9 of 12) · Reworks 0.4 per ticket · $0.42 per ticket · 12 tickets',
    );
  });

  it('leaves out reworks it does not have', () => {
    expect(summaryLine(scorecardRow({ reworks_per_ticket: null }))).not.toContain(
      'Reworks',
    );
  });
});
