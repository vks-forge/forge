/**
 * Mapping thrown values to HTTP statuses and safe JSON bodies.
 *
 * Why: the status a client sees decides whether it retries, fixes its input or gives up,
 *   so each error family must map to a stable status (invalid input 400, policy 403, auth
 *   401, rate limit 429, stale/contention 409). A server-side fault must read as a bare 500:
 *   its message can contain paths, SQL or tokens and must never reach the client.
 *
 * Pins: the family-to-status table, HttpError passthrough, zod issues, 5xx redaction.
 * Depends on: src/services/http/http-errors, @forge/core. No IO.
 */

import {
  AuthError,
  CrashError,
  InvalidInputError,
  PolicyDeniedError,
  RateLimitError,
  StallError,
  UnknownForgeError,
} from '@forge/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError, errorBody, statusOf } from '#/services/http/http-errors.js';

describe('statusOf', () => {
  it.each([
    [new InvalidInputError('x'), 400],
    [new PolicyDeniedError('x'), 403],
    [new AuthError('x'), 401],
    [new RateLimitError('x'), 429],
    [new StallError('x'), 409],
    [new CrashError('x'), 500],
    [new UnknownForgeError('x'), 500],
    [new Error('x'), 500],
    ['a string', 500],
  ])('maps %s to %i', (error, status) => {
    expect(statusOf(error)).toBe(status);
  });

  it('uses the status an HttpError carries', () => {
    expect(statusOf(new HttpError(404, 'nope', 'missing'))).toBe(404);
  });

  it('treats a ZodError as a 400', () => {
    const failed = z.string().safeParse(1);

    expect(failed.success).toBe(false);
    expect(statusOf((failed as { error: z.ZodError }).error)).toBe(400);
  });
});

describe('errorBody', () => {
  it('echoes the message of an HttpError, which is written for the client', () => {
    expect(
      errorBody(new HttpError(409, 'not_pending', 'interaction int-1 is not pending')),
    ).toEqual({
      error: { code: 'not_pending', message: 'interaction int-1 is not pending' },
    });
  });

  it('answers a 4xx ForgeError with its family message, never its own text (L4)', () => {
    expect(
      errorBody(new InvalidInputError('worktree C:/secret/path is not clean')),
    ).toEqual({ error: { code: 'invalid_input', message: 'the request was not valid' } });

    expect(errorBody(new PolicyDeniedError('rule deny:/home/x')).error.message).toBe(
      'denied by policy',
    );

    expect(errorBody(new AuthError('key github-app-key missing')).error.message).toBe(
      'authentication failed',
    );

    expect(errorBody(new StallError('run run-9 stalled')).error.message).toBe(
      'the request conflicts with the current state',
    );
  });

  it('includes the issues of an HttpError', () => {
    const body = errorBody(
      new HttpError(400, 'invalid_request', 'bad', {
        issues: [{ path: 'a', message: 'required' }],
      }),
    );

    expect(body.error.issues).toEqual([{ path: 'a', message: 'required' }]);
  });

  it('renders a ZodError as a list of issues', () => {
    const failed = z.object({ a: z.string() }).safeParse({});
    const body = errorBody((failed as { error: z.ZodError }).error);

    expect(body.error.code).toBe('invalid_request');
    expect(body.error.issues?.[0]?.path).toBe('a');
  });

  it('keeps the code and message of a gateway HttpError (502, 503, 504) written for the client', () => {
    expect(
      errorBody(new HttpError(504, 'step_timeout', 'the Director did not answer')),
    ).toEqual({
      error: { code: 'step_timeout', message: 'the Director did not answer' },
    });

    expect(errorBody(new HttpError(500, 'oops', 'details')).error.code).toBe('internal');
  });

  it('hides the message of a server fault', () => {
    expect(errorBody(new CrashError('/home/x/secret.db locked'))).toEqual({
      error: { code: 'internal', message: 'internal server error' },
    });

    expect(JSON.stringify(errorBody(new Error('token abc')))).not.toContain('abc');
  });
});
