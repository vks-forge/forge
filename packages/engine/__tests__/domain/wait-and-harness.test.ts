/**
 * Tests for the wait-reason text, the fallback harness choice and the quota failure answer.
 *
 * Why: the ticket page shows `describeWait` verbatim, so its wording is a contract with the
 *   UI and the CLI; the harness choice decides whether a ticket runs on a different harness
 *   than the project asked for, which must only ever be one the owner listed, installed
 *   and not itself out of quota (d-0080); and the failure table must answer a quota error
 *   with a wait until the reset instead of burning retries.
 *
 * Pins: the three wait lines; chooseHarness keeps the primary unless it is parked, then takes
 *   the first usable fallback in order, else waits on the primary (property over random
 *   lists); decideFailure retries a quota error at its reset, or after the longest backoff.
 * Depends on: src/domain/wait-reason, src/domain/harness-choice, src/domain/failure-policy,
 *   @forge/core, fast-check, vitest.
 */

import { BUILTIN_FORGE_CONFIG } from '@forge/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideFailure } from '#/domain/failure-policy.js';
import { chooseHarness } from '#/domain/harness-choice.js';
import { describeWait } from '#/domain/wait-reason.js';

const NOW = Date.UTC(2026, 9, 15, 13, 0, 0);

describe('describeWait', () => {
  it('words each reason the way the ticket page shows it', () => {
    expect(describeWait({ kind: 'deps', ids: ['PAY-231', 'PAY-232'] })).toBe(
      'deps: PAY-231, PAY-232',
    );

    expect(
      describeWait({
        kind: 'quota',
        harness: 'claude-code',
        until: Date.UTC(2026, 9, 15, 14, 20),
        reason: 'x',
      }),
    ).toBe('quota: claude-code until 14:20 UTC');

    expect(describeWait({ kind: 'cap', scope: 'project', used: 1, limit: 1 })).toBe(
      'cap: per-project 1/1',
    );

    expect(describeWait({ kind: 'cap', scope: 'global', used: 2, limit: 2 })).toBe(
      'cap: global 2/2',
    );

    expect(describeWait({ kind: 'cap', scope: 'harness', used: 2, limit: 2 })).toBe(
      'cap: per-harness 2/2',
    );

    expect(describeWait({ kind: 'cap', scope: 'state', used: 3, limit: 3 })).toBe(
      'cap: in_progress 3/3',
    );
  });
});

describe('chooseHarness', () => {
  const parked = { until: NOW + 1000, reason: 'quota' };

  it('keeps the primary unless it is parked', () => {
    expect(chooseHarness('a', ['b'], {}, () => true, NOW)).toBe('a');
    expect(
      chooseHarness('a', ['b'], { a: { until: NOW, reason: 'x' } }, () => true, NOW),
    ).toBe('a');
  });

  it('takes the first fallback that is installed and not parked, in list order', () => {
    expect(
      chooseHarness(
        'a',
        ['b', 'c', 'd'],
        { a: parked, b: parked },
        (id) => id !== 'x',
        NOW,
      ),
    ).toBe('c');

    expect(chooseHarness('a', ['b', 'c'], { a: parked }, (id) => id === 'c', NOW)).toBe(
      'c',
    );
  });

  it('waits on the primary when no fallback is usable', () => {
    expect(chooseHarness('a', [], { a: parked }, () => true, NOW)).toBe('a');
    expect(chooseHarness('a', ['b'], { a: parked, b: parked }, () => true, NOW)).toBe(
      'a',
    );

    expect(chooseHarness('a', ['b'], { a: parked }, () => false, NOW)).toBe('a');
  });

  it('only ever answers the primary or a usable listed fallback', () => {
    const ids = ['a', 'b', 'c', 'd'];
    fc.assert(
      fc.property(
        fc.subarray(ids, { minLength: 0 }),
        fc.subarray(ids),
        fc.subarray(ids),
        (fallbacks, parkedIds, missing) => {
          const paused = Object.fromEntries(parkedIds.map((id) => [id, parked]));
          const picked = chooseHarness(
            'a',
            fallbacks,
            paused,
            (id) => !missing.includes(id),
            NOW,
          );

          if (picked !== 'a') {
            expect(fallbacks).toContain(picked);
            expect(parkedIds).not.toContain(picked);
            expect(missing).not.toContain(picked);
          } else if (parkedIds.includes('a')) {
            expect(
              fallbacks.some(
                (id) => id !== 'a' && !parkedIds.includes(id) && !missing.includes(id),
              ),
            ).toBe(false);
          }
        },
      ),
    );
  });
});

describe('decideFailure for a quota error', () => {
  const policy = BUILTIN_FORGE_CONFIG.engine.retry;

  it('retries at the reset time the harness named', () => {
    const reset = NOW + 7_200_000;

    expect(
      decideFailure({
        status: 'error',
        family: 'quota',
        attempts: 9,
        retryNotBefore: new Date(reset).toISOString(),
        now: NOW,
        policy,
      }),
    ).toEqual({ action: 'retry', notBefore: reset, family: 'quota' });
  });

  it('waits the longest backoff when no reset is named or it is already past', () => {
    for (const retryNotBefore of [undefined, new Date(NOW - 1000).toISOString()]) {
      expect(
        decideFailure({
          status: 'error',
          family: 'quota',
          attempts: 1,
          ...(retryNotBefore ? { retryNotBefore } : {}),
          now: NOW,
          policy,
        }),
      ).toEqual({
        action: 'retry',
        notBefore: NOW + policy.rate_limit.max_ms,
        family: 'quota',
      });
    }
  });
});
