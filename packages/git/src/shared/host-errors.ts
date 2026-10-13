/**
 * GitHostError — typed failures of the GitHost adapters.
 *
 * Why: the engine decides retry, rework or park from `errorFamily`, never from message
 *   text. A host refusing a merge (conflict, branch protection, closed PR) is a policy
 *   answer that must not be retried; a rejected token is an auth problem for the user; a
 *   5xx is a transient crash. This class maps each host outcome to the right family while
 *   `reason` keeps the finer cause for logs and tests. Messages never carry credentials.
 *
 * Exports: GitHostError, reasonForStatus().
 * Depends on: @forge/core (ForgeError). No IO.
 */

import { ForgeError } from '@forge/core';
import type { ErrorFamily } from '@forge/core';
import type { GitHostReason } from '#/types/host-errors.types.js';

const FAMILY: Record<GitHostReason, ErrorFamily> = {
  auth: 'auth',
  rate_limit: 'rate_limit',
  not_found: 'invalid_input',
  merge_refused: 'policy_denied',
  invalid: 'invalid_input',
  unavailable: 'crash',
};

export class GitHostError extends ForgeError {
  readonly reason: GitHostReason;
  /** HTTP status for REST failures, absent for local ones. */
  readonly status: number | undefined;

  constructor(reason: GitHostReason, message: string, status?: number) {
    super(FAMILY[reason], message);
    this.reason = reason;
    this.status = status;
  }
}

/** Maps a GitHub REST status to a reason; `rateLimited` marks a 403 that is a quota, not a permission. */
export function reasonForStatus(status: number, rateLimited: boolean): GitHostReason {
  if (status === 401) {
    return 'auth';
  }

  if (status === 429 || (status === 403 && rateLimited)) {
    return 'rate_limit';
  }

  if (status === 403) {
    return 'auth';
  }

  if (status === 404) {
    return 'not_found';
  }

  if (status === 405 || status === 409) {
    return 'merge_refused';
  }

  if (status === 422) {
    return 'invalid';
  }

  return 'unavailable';
}
