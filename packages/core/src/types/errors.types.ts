/**
 * Option bag for ForgeError constructors.
 *
 * Why: every ForgeError subclass takes the same optional `cause`, so the shape lives once (code.md rule 7).
 *
 * Exports: ForgeErrorOptions.
 * Depends on: No IO (types only).
 */

/** Optional constructor options shared by all {@link ForgeError} subclasses. */
export interface ForgeErrorOptions {
  readonly cause?: unknown;
}
