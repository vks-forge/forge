/**
 * GitHostError — typed failures of the GitHost adapters.
 *
 * Why: the engine decides retry, rework or park from `errorFamily`, never from message
 *   text. A host refusing a merge (conflict, branch protection, closed PR) is a policy
 *   answer that must not be retried; a rejected token is an auth problem for the user; a
 *   5xx is a transient crash. This class maps each host outcome to the right family while
 *   `reason` keeps the finer cause for logs and tests. Messages never carry credentials.
 *
 * Exports: GitHostError, reasonForStatus(), refineMergeRefusal().
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
  // Backoff family: the same merge is expected to work once the branch stops moving.
  merge_busy: 'rate_limit',
  // The user's own checked-out branch has uncommitted work: a human must commit or stash it.
  dirty_tree: 'invalid_input',
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

/**
 * What a 405/409 on the merge endpoint means, from GitHub's message: the head moved
 * (re-gate it), the base or something else was modified a moment ago (try again shortly),
 * the branch clashes with the base (merge the base in), or a real refusal (protection, not
 * open) that only a human fixes.
 */
export function refineMergeRefusal(
  message: string,
): 'head_moved' | 'merge_busy' | 'conflict' | 'refused' {
  if (/head branch was modified/i.test(message)) {
    return 'head_moved';
  }

  if (/not mergeable|merge conflict|conflicts? with/i.test(message)) {
    return 'conflict';
  }

  return /modified/i.test(message) ? 'merge_busy' : 'refused';
}
