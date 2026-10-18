/**
 * HTTP error type and the mapping from any thrown value to a status and JSON body.
 *
 * Why: handlers throw typed errors and one function decides what the client sees
 *   (code.md rule 7). Retry and status decisions read the error family, never the message.
 *   A failure that is the server's own fault (crash, unknown, a plain Error) is reported as
 *   a bare 500 without its message, because such messages can carry paths, SQL or tokens;
 *   only an `HttpError`, which is written for the client, echoes its text (a 502, 503 or 504
 *   keeps its code too: the Director or a harness failed, not Forge); any other
 *   ForgeError answers with its family's fixed message. Secrets and run tokens never
 *   appear in a response.
 *
 * Exports: HttpError, statusOf(), errorBody().
 * Depends on: @forge/core (ForgeError, ErrorFamily), types/http. No IO.
 */

import { ForgeError } from '@forge/core';
import type { ErrorFamily } from '@forge/core';
import { ZodError } from 'zod';
import type { ErrorBody, ErrorDetails, ErrorIssue } from '#/types/http.types.js';

/** An error that carries its HTTP status: 404, 405, 409, 413, 415 and friends. */
export class HttpError extends ForgeError {
  readonly status: number;
  readonly code: string;
  readonly issues?: readonly ErrorIssue[];
  /** The ids of a dependency loop, for `dependency_cycle` (a closed path: the first id is also the last). */
  readonly cycle?: readonly string[];
  /** Extra facts a client acts on: the ticket `key` and its `dependents` of `ticket_has_dependents`, the `detail` of `still_broken`, what `settled` a `not_pending` wait, the `problems` of an invalid pipeline, the `lanes` and `rules` that lock an agent. */
  readonly details?: ErrorDetails;

  constructor(
    status: number,
    code: string,
    message: string,
    options: {
      family?: ErrorFamily;
      issues?: readonly ErrorIssue[];
      cycle?: readonly string[];
      details?: ErrorDetails;
    } = {},
  ) {
    super(options.family ?? 'invalid_input', message);
    this.status = status;
    this.code = code;
    if (options.issues) {
      this.issues = options.issues;
    }

    if (options.cycle) {
      this.cycle = options.cycle;
    }

    if (options.details) {
      this.details = options.details;
    }
  }

  /** 400 listing the zod issues of a rejected body or query. */
  static fromZod(error: ZodError): HttpError {
    const issues = error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));

    return new HttpError(400, 'invalid_request', 'request failed validation', { issues });
  }
}

const STATUS_BY_FAMILY: Readonly<Record<ErrorFamily, number>> = {
  invalid_input: 400,
  policy_denied: 403,
  auth: 401,
  rate_limit: 429,
  quota: 429,
  stall: 409,
  budget: 500,
  refusal: 500,
  crash: 500,
  unknown: 500,
  model_unavailable: 500,
};

/**
 * What a client is told about a ForgeError that is not an `HttpError`. The message of such
 * an error was written for logs and operators (it can name a path, a ref, a secret's name
 * or a command), so the client gets the family's fixed text and the code, never the message.
 */
const FAMILY_MESSAGE: Readonly<Record<ErrorFamily, string>> = {
  invalid_input: 'the request was not valid',
  policy_denied: 'denied by policy',
  auth: 'authentication failed',
  rate_limit: 'too many requests',
  quota: 'quota used up; try again after it resets',
  stall: 'the request conflicts with the current state',
  budget: 'internal server error',
  refusal: 'internal server error',
  crash: 'internal server error',
  unknown: 'internal server error',
  model_unavailable: 'internal server error',
};

/** Status for any thrown value; anything not a ForgeError is 500. */
export function statusOf(error: unknown): number {
  if (error instanceof HttpError) {
    return error.status;
  }

  if (error instanceof ZodError) {
    return 400;
  }

  if (error instanceof ForgeError) {
    return STATUS_BY_FAMILY[error.errorFamily];
  }

  return 500;
}

/**
 * JSON body for `error`; the message of a 500 is replaced by a fixed text. An `HttpError` with a
 * 502, 503 or 504 status is a failure of something the server asked (the Director's model, a
 * harness) written for the client, and keeps its code and message.
 */
export function errorBody(error: unknown): ErrorBody {
  const status = statusOf(error);
  if (status >= 500 && !(error instanceof HttpError && status > 500)) {
    return { error: { code: 'internal', message: 'internal server error' } };
  }

  if (error instanceof HttpError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
        ...(error.cycle ? { cycle: error.cycle } : {}),
        ...(error.details ?? {}),
      },
    };
  }

  if (error instanceof ZodError) {
    return errorBody(HttpError.fromZod(error));
  }

  const family = error instanceof ForgeError ? error.errorFamily : 'unknown';

  return { error: { code: family, message: FAMILY_MESSAGE[family] } };
}
