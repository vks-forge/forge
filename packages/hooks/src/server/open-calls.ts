/**
 * Which tool calls of a run are in flight: allowed, but with no effect receipt yet.
 *
 * Why: a graceful stop must not land between a Worker's edit reaching the disk and the
 *   effect receipt that proves it (PostToolUse). The server drains first: it refuses new calls
 *   and waits until every call it had already allowed has its effect, then interrupts the run
 *   (d-0092). This is the one definition of "in flight" for that wait, read from the signed
 *   chain so it cannot disagree with what G1 will later accept. A decision from before the
 *   last `resumed` link belongs to a Worker that was replaced and will never post its effect,
 *   so it is not waited for again.
 *
 * Exports: openToolCalls().
 * Depends on: @forge/tools (Receipt). No IO.
 */

import type { Receipt } from '@forge/tools';

/** Ids of the allowed decisions in the run's current generation that have no effect receipt, oldest first. */
export function openToolCalls(chain: readonly Receipt[]): string[] {
  const open = new Set<string>();

  for (const receipt of chain) {
    if (receipt.kind === 'resumed') {
      open.clear();
    } else if (receipt.kind === 'decision') {
      if (receipt.decision === 'allow') {
        open.add(receipt.id);
      }
    } else {
      open.delete(receipt.decision_id);
    }
  }

  return [...open];
}
