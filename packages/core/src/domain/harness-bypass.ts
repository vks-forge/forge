/**
 * Bypass default for a harness row.
 *
 * Why: "Bypass permissions" (d-0183) is on unless the owner turns it off, but a stored harness row
 * may not carry the flag yet. Every reader (the engine building a run request, the Settings page)
 * must read the same default, so it lives in this one function.
 *
 * Exports: bypassOn().
 * Depends on: schemas/harness. No IO.
 */

import type { Harness } from '#/schemas/harness.js';

/** True unless the harness row explicitly turns Bypass permissions off. */
export function bypassOn(h: Pick<Harness, 'bypass_permissions'>): boolean {
  return h.bypass_permissions ?? true;
}
