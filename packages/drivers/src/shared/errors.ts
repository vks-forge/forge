/**
 * Errors only the Claude driver can raise.
 *
 * Why: Forge runs the `claude` the user installed (d-0087); it never bundles one and never
 *   falls back to some other copy. When none can be found the operator needs one line that
 *   says what to install, and the Director must not retry the run as if it were a transient
 *   crash. The error is an `invalid_input` (a setup problem, never retried as-is) that
 *   carries the install pointer in its message.
 *
 * Exports: INSTALL_CLAUDE_HINT, HarnessNotInstalledError.
 * Depends on: @forge/core (InvalidInputError). No IO.
 */

import { InvalidInputError } from '@forge/core';
import type { ForgeErrorOptions } from '@forge/core';

/** What to tell a user whose machine has no Claude Code. */
export const INSTALL_CLAUDE_HINT =
  'Install Claude Code: https://code.claude.com/docs/en/setup';

/** No usable `claude` executable: not on PATH, not at the configured path, or a shim that cannot be started. */
export class HarnessNotInstalledError extends InvalidInputError {
  constructor(detail: string, options?: ForgeErrorOptions) {
    super(`${INSTALL_CLAUDE_HINT} (${detail})`, options);
  }
}
