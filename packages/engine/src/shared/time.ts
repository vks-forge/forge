/**
 * Time helpers shared by the engine phases.
 *
 * Why: the engine reads time only from the injected `Clock` (epoch ms) but every stored
 *   timestamp is an ISO string, and "list all pending wakes" has to be expressed as a
 *   `listDue` call with a far-future `now`. One place for both conversions keeps every
 *   phase agreeing on the format storage validates.
 *
 * Exports: iso(), FAR_FUTURE.
 * Depends on: nothing. No IO.
 */

/** Epoch ms to the ISO-8601 string storage expects. */
export const iso = (ms: number): string => new Date(ms).toISOString();

/** Passed as `now` to `listDue` to list every pending wake, including future ones. */
export const FAR_FUTURE = '9999-12-31T23:59:59.999Z';
