/**
 * Pins how a harness failure about the model itself is told apart from every other failure.
 *
 * Why: when the model an agent asked for does not exist on the harness (unknown, retired, not allowed), a retry
 *   on the same model can never work, and the agent's fallback list is the remedy (d-0080). The opposite mistake
 *   is worse: reading an unrelated 404, a crash or a throttle as "swap the model" would change who writes the
 *   code on a guess. So the pattern is narrow (the text must name the model and say it is missing), a plain
 *   rate limit stays a rate limit even when it mentions the model, and anything unmatched stays `unknown`, which
 *   retries as a crash and never swaps silently.
 *
 * Pins: text that names a missing model, a CLI 404 that does, text that must not match, unmatched text staying
 *   `unknown`, and the run result's family.
 * Depends on: src/domain/failure-classify, src/domain/run-result, vitest.
 */

import { describe, expect, it } from 'vitest';
import { classifyCliResult, classifyText } from '#/domain/failure-classify.js';
import { buildRunResult } from '#/domain/run-result.js';

const rate = () => '2026-01-01T00:00:00.000Z';

describe('model_unavailable classification', () => {
  it.each([
    'There is an issue with the selected model (claude-foo-9). It may not exist or you may not have access. Unknown model: claude-foo-9',
    'Invalid model: sonnet-17',
    'model: claude-3-opus-20240229 has been retired',
    'The model claude-x is not available for your account',
    'no such model',
    'Model not found',
    'error: model does not exist',
  ])('reads "%s" as model_unavailable', (text) => {
    expect(classifyText(text, rate).kind).toBe('model_unavailable');
  });

  it('reads a CLI 404 that names the model the same way', () => {
    const end = classifyCliResult(
      {
        type: 'result',
        api_error_status: 404,
        is_error: true,
        result: 'model: nope was not found; unknown model',
      },
      rate,
    );

    expect(end.kind).toBe('model_unavailable');
  });

  it.each([
    'Rate limit reached for requests',
    'Overloaded: the model is busy, retry soon',
    'HTTP 404 route not found',
    'ENOENT: no such file or directory, open model.json',
    'The Claude account has no available quota.',
    'something went wrong',
  ])('does not read "%s" as model_unavailable', (text) => {
    expect(classifyText(text, rate).kind).not.toBe('model_unavailable');
  });

  it('leaves unmatched text as unknown (a crash retry, never a silent swap)', () => {
    expect(classifyText('something went wrong', rate).kind).toBe('unknown');
  });

  it('turns the end into a failed run with the model_unavailable family', () => {
    const result = buildRunResult({
      end: { kind: 'model_unavailable', detail: 'unknown model' },
      override: null,
      session: 's',
      usage: { in: 0, out: 0, cachedIn: 0, cacheWrite: 0 },
      costUsd: null,
      filesTouched: [],
      pendingAsk: null,
    });

    expect(result).toMatchObject({ status: 'error', errorFamily: 'model_unavailable' });
  });
});
