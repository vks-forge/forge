/**
 * chooseHarness — which harness a ticket's next run uses when its own is out of quota.
 *
 * Why: when the account behind a project's harness has no quota left, the choice is to wait
 *   for the reset or to run the ticket on another harness the owner listed as acceptable
 *   (d-0080). Falling back silently to any installed harness would change who writes the
 *   code and what policy applies, so only the configured list is tried, in its order, and
 *   only harnesses that are installed and not themselves parked. With no list, or nothing
 *   usable on it, the ticket keeps its own harness and waits for the reset.
 *
 * Exports: chooseHarness().
 * Depends on: types/pick-next. No IO.
 */

import type { PausedHarness } from '#/types/pick-next.types.js';

/**
 * `primary` unless it is parked at `now` (epoch ms); then the first of `fallbacks` that is
 * `installed` and not parked; else `primary` again.
 */
export function chooseHarness(
  primary: string,
  fallbacks: readonly string[],
  paused: Readonly<Record<string, PausedHarness>>,
  installed: (id: string) => boolean,
  now: number,
): string {
  const parked = (id: string): boolean => (paused[id]?.until ?? 0) > now;
  if (!parked(primary)) {
    return primary;
  }

  return (
    fallbacks.find((id) => id !== primary && installed(id) && !parked(id)) ?? primary
  );
}
