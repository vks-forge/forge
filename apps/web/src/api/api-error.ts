/**
 * ApiError: the one error type a failed call to the Forge server becomes.
 *
 * Why: screens show three different states for a failed read: "cannot reach Forge" (network),
 *   "Forge said no" (a status and code the user can act on, such as an expired credential), and
 *   "Forge answered something this version of the UI does not understand" (payload). Throwing
 *   one typed error with a `kind` lets a component choose the state and the wording from data,
 *   never from message text. It is a ForgeError so the error family is the same closed set the
 *   server uses (code.md rule 7).
 *
 * Exports: ApiError, errorFamilyOfStatus().
 * Depends on: @forge/core (ForgeError), types/api.types.
 */

import { ForgeError } from '@forge/core';
import type { ErrorFamily } from '@forge/core';
import type { ApiErrorKind } from '#/types/api.types.js';

/** Maps an HTTP status to the closest family: 401 and 403 are `auth`, 429 `rate_limit`, other 4xx the caller's input. */
export function errorFamilyOfStatus(status: number): ErrorFamily {
  if (status === 401 || status === 403) {
    return 'auth';
  }

  if (status === 429) {
    return 'rate_limit';
  }

  return status >= 400 && status < 500 ? 'invalid_input' : 'unknown';
}

export class ApiError extends ForgeError {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;
  /** The server's whole refusal body, for extras such as a dependency cycle; never trusted. */
  readonly body: unknown;

  constructor(
    kind: ApiErrorKind,
    message: string,
    details: { status?: number; code?: string; cause?: unknown; body?: unknown } = {},
  ) {
    super(
      details.status === undefined ? 'unknown' : errorFamilyOfStatus(details.status),
      message,
      details.cause === undefined ? undefined : { cause: details.cause },
    );

    this.kind = kind;
    this.status = details.status;
    this.code = details.code;
    this.body = details.body;
  }
}
