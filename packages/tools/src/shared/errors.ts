/**
 * Typed errors raised while building policy (never while evaluating a call).
 *
 * Why: a grant that would let a remembered approval cover `bash -c`, or a managed layer
 *   that tries to allow something, must stop the run before it starts, and the operator
 *   must be told which rule is at fault. Call evaluation never throws (it returns
 *   `deny`), so these only surface at grant-build or catalogue-build time, as
 *   `policy_denied` errors the Director can classify (tool-system.md §5.2, §13).
 *
 * Exports: BannedAlwaysAllowError, InvalidGrantError.
 * Depends on: @forge/core.
 */

import { PolicyDeniedError } from '@forge/core';

/** A rule would permanently allow an interpreter or wide prefix that must always be asked. */
export class BannedAlwaysAllowError extends PolicyDeniedError {
  readonly rule: string;

  constructor(rule: string) {
    super(`rule would always-allow a banned command prefix: ${rule}`);
    this.rule = rule;
  }
}

/** A grant or rule list failed schema or structural validation. */
export class InvalidGrantError extends PolicyDeniedError {}
