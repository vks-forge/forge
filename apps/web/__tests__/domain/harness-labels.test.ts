/**
 * Pins: a harness whose last Worker run worked reads "Working" even when the live test was never
 * pressed, the row says "last run" and "live test" as two separate facts, and a failed test or a
 * pause still wins.
 *
 * Why: the eval showed "Not tested yet" after 52 successful runs; the owner distrusted a harness
 *   that was plainly working.
 * Depends on: src/domain/harness-labels. Pure.
 */

import { describe, expect, it } from 'vitest';
import { harnessHealth, lastRunWords, liveTestWords } from '#/domain/harness-labels.js';
import type { HarnessView } from '#/schemas/settings.js';

const harness = (over: Record<string, unknown> = {}): HarnessView =>
  ({
    id: 'claude',
    kind: 'claude',
    status: 'unknown',
    auth_mode: 'login',
    secrets: { api_key: false, oauth_token: false },
    ...over,
  }) as unknown as HarnessView;

const RUN = { at: '2026-10-21T07:12:00.000Z', status: 'success', version: '2.1.304' };

describe('harnessHealth', () => {
  it('is Working from a good last run alone, and Not tested yet with neither', () => {
    expect(harnessHealth(harness({ last_run: RUN })).label).toBe('Working');
    expect(harnessHealth(harness()).label).toBe('Not tested yet');
  });

  it('lets a pause or a failed test win over a good run, and flags a run that ended badly', () => {
    expect(harnessHealth(harness({ status: 'paused', last_run: RUN })).label).toBe(
      'Paused',
    );

    expect(harnessHealth(harness({ status: 'error', last_run: RUN })).tone).toBe('bad');
    expect(harnessHealth(harness({ last_run: { ...RUN, status: 'error' } })).tone).toBe(
      'attn',
    );
  });
});

describe('row words', () => {
  it('names the last run with its version and says the live test was not run', () => {
    expect(lastRunWords(harness({ last_run: RUN }))).toMatch(
      /^last run .*\(2\.1\.304\)$/,
    );

    expect(lastRunWords(harness())).toBeNull();
    expect(liveTestWords(harness())).toBe('live test not run');
  });

  it('says when the live test passed or failed, with the tested version', () => {
    const now = Date.parse('2026-10-21T08:00:00.000Z');
    const checked = { last_checked_at: '2026-10-21T07:00:00.000Z', version: '2.1.300' };

    expect(liveTestWords(harness({ ...checked, status: 'ok' }), now)).toMatch(
      /^live test passed .* \(2\.1\.300\)$/,
    );

    expect(liveTestWords(harness({ ...checked, status: 'error' }), now)).toMatch(
      /^live test failed/,
    );
  });
});
