/**
 * Option bag for ForgeError constructors.
 *
 * Why: every ForgeError subclass takes the same optional `cause`, so a driver can wrap
 *   the harness's original failure without losing it. The family drives the retry
 *   decision; the cause is what a developer reads afterwards when a run fails in the
 *   field.
 *
 * Exports: ForgeErrorOptions.
 * Depends on: No IO (types only).
 */

/** Optional constructor options shared by all {@link ForgeError} subclasses. */
export interface ForgeErrorOptions {
  readonly cause?: unknown;
}
