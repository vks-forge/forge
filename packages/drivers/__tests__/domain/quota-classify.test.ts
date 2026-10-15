/**
 * Pins: how an exhausted account is told apart from a plain rate limit, where the quota
 * reset time comes from, and what a quota end turns into in the run result.
 *
 * Why: the Director waits differently for the two. A 429 clears with a short backoff; a
 *   used-up usage window does not, so the engine parks the whole harness until the reset
 *   (d-0097). Calling a quota error a rate limit would burn the retry budget and park
 *   tickets, and calling a throttle a quota error would idle a healthy harness for an hour.
 *
 * Depends on: src/domain/failure-classify, src/domain/run-result, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyCliResult,
  classifyText,
  quotaEnd,
  resetFromText,
} from '#/domain/failure-classify.js';
import { buildRunResult } from '#/domain/run-result.js';

const rate = () => '2026-01-01T00:00:00.000Z';
const base = {
  session: 's',
  usage: { in: 0, out: 0, cachedIn: 0, cacheWrite: 0 },
  costUsd: null,
  filesTouched: [] as string[],
  pendingAsk: null,
};

describe('quota classification', () => {
  it('classifies an exhausted account as quota and keeps a plain 429 a rate limit', () => {
    const r = (o: object) => classifyCliResult({ type: 'result', ...o }, rate);

    expect(r({ api_error_status: 429, result: "You've hit your limit" }).kind).toBe(
      'quota',
    );

    expect(r({ api_error_status: 429, result: 'Too many requests' }).kind).toBe(
      'rate_limit',
    );

    expect(classifyText('Claude usage limit reached', rate).kind).toBe('quota');
    expect(classifyText('overloaded', rate).kind).toBe('rate_limit');
  });

  it('takes the quota reset from the report, else from the message, else names none', () => {
    expect(quotaEnd('x', { resetsAt: 2_000_000_000 }).retryNotBefore).toBe(
      new Date(2_000_000_000_000).toISOString(),
    );

    expect(
      quotaEnd('limit reached, resets 2026-10-15T14:20:00Z', null).retryNotBefore,
    ).toBe('2026-10-15T14:20:00.000Z');

    expect(quotaEnd('limit reached', null)).toEqual({
      kind: 'quota',
      detail: 'limit reached',
    });

    expect(resetFromText('resets at 2000000000')).toBe(
      new Date(2_000_000_000_000).toISOString(),
    );

    expect(resetFromText('resets soon')).toBeUndefined();
  });

  it('a quota end becomes the quota family and keeps the reset it named', () => {
    const q = buildRunResult({
      ...base,
      end: { kind: 'quota', retryNotBefore: '2026-10-15T14:20:00.000Z' },
      override: null,
    });

    expect(q).toMatchObject({
      status: 'error',
      errorFamily: 'quota',
      retryNotBefore: '2026-10-15T14:20:00.000Z',
    });

    expect(
      buildRunResult({ ...base, end: { kind: 'quota' }, override: null }).retryNotBefore,
    ).toBeUndefined();
  });
});
