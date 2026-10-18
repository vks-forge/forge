/**
 * Tests for the run-failure policy (retry vs. park, with backoff).
 *
 * Why: when a Worker run ends badly the Director must pick one of two things: schedule a
 *   retry at a sensible time, or hand the ticket to a human. Retrying an auth failure, a
 *   refusal or a policy denial burns budget and changes nothing; retrying a crash forever is
 *   the Paperclip failure this engine exists to avoid (execution-plane.md §8). The table is
 *   keyed by error family, so it is pinned family by family, with the caps that turn
 *   "retry" into "park".
 *
 * Pins: auth, policy_denied, refusal, budget, invalid_input, max_turns and refused never
 *   retry; rate_limit honours retryNotBefore else backs off exponentially up to a cap;
 *   crash retries once, stall twice, unknown once; a timeout without a family is a stall;
 *   exceeding max attempts parks with a reason naming the family.
 * Depends on: src/domain/failure-policy, @forge/core types, vitest.
 */

import type { RetryPolicy } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { decideFailure } from '#/domain/failure-policy.js';

const policy: RetryPolicy = {
  rate_limit: { base_ms: 1000, max_ms: 8000, max_attempts: 5 },
  crash: { delay_ms: 500, max_attempts: 1 },
  stall: { delay_ms: 700, max_attempts: 2 },
  unknown: { delay_ms: 900, max_attempts: 1 },
};

const now = 1_000_000;

describe('decideFailure', () => {
  it.each(['auth', 'policy_denied', 'refusal', 'budget', 'invalid_input'] as const)(
    'never retries %s',
    (family) => {
      const d = decideFailure({ status: 'error', family, attempts: 1, now, policy });
      expect(d.action).toBe('park');
    },
  );

  it('parks on max_turns, refused and an unexplained cancel', () => {
    for (const status of ['max_turns', 'refused', 'cancelled'] as const) {
      expect(decideFailure({ status, attempts: 1, now, policy }).action).toBe('park');
    }
  });

  it('retries a crash once, then parks', () => {
    const first = decideFailure({
      status: 'error',
      family: 'crash',
      attempts: 1,
      now,
      policy,
    });

    expect(first).toMatchObject({ action: 'retry', notBefore: now + 500 });
    const second = decideFailure({
      status: 'error',
      family: 'crash',
      attempts: 2,
      now,
      policy,
    });

    expect(second.action).toBe('park');
    expect(second.action === 'park' && second.reason).toMatch(/crash/);
  });

  it('retries a stall twice; a timeout with no family counts as a stall', () => {
    expect(decideFailure({ status: 'timeout', attempts: 2, now, policy })).toMatchObject({
      action: 'retry',
      family: 'stall',
    });

    expect(decideFailure({ status: 'timeout', attempts: 3, now, policy }).action).toBe(
      'park',
    );
  });

  it('treats an error with no family as unknown, retried once', () => {
    expect(decideFailure({ status: 'error', attempts: 1, now, policy }).action).toBe(
      'retry',
    );

    expect(decideFailure({ status: 'error', attempts: 2, now, policy }).action).toBe(
      'park',
    );
  });

  it('rate_limit honours retryNotBefore', () => {
    const at = new Date(now + 60_000).toISOString();
    const d = decideFailure({
      status: 'error',
      family: 'rate_limit',
      attempts: 1,
      retryNotBefore: at,
      now,
      policy,
    });

    expect(d).toMatchObject({ action: 'retry', notBefore: now + 60_000 });
  });

  it('rate_limit backs off exponentially up to the cap without a reset time', () => {
    const delays = [1, 2, 3, 4, 5].map((attempts) => {
      const d = decideFailure({
        status: 'error',
        family: 'rate_limit',
        attempts,
        now,
        policy,
      });

      return d.action === 'retry' ? d.notBefore - now : -1;
    });

    expect(delays).toEqual([1000, 2000, 4000, 8000, 8000]);
    expect(
      decideFailure({ status: 'error', family: 'rate_limit', attempts: 6, now, policy })
        .action,
    ).toBe('park');
  });

  it('ignores a retryNotBefore in the past', () => {
    const d = decideFailure({
      status: 'error',
      family: 'rate_limit',
      attempts: 1,
      retryNotBefore: new Date(now - 5000).toISOString(),
      now,
      policy,
    });

    expect(d).toMatchObject({ action: 'retry', notBefore: now + 1000 });
  });
});

describe('decideFailure: model_unavailable', () => {
  it('is never retried on the same model, however few attempts were made', () => {
    const d = decideFailure({
      status: 'error',
      family: 'model_unavailable',
      attempts: 1,
      now,
      policy,
    });

    expect(d.action).toBe('park');
  });
});
