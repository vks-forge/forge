/**
 * Shutdown drain: refuse new tool calls, wait for the running ones to be receipted.
 *
 * Why: a graceful stop (`forge stop`, Ctrl-C, an update) that lands inside a Worker's Write,
 *   after the edit hit the disk but before the PostToolUse effect receipt, makes the resumed
 *   run fail G1 on an edit nothing signed and costs a rework run (d-0092). Draining closes that
 *   window: the hook handler answers new PreToolUse with `server_draining` while this waits
 *   until every live run has no tool call that was allowed but has no effect receipt yet. The
 *   wait is bounded by the caller; a call that never completes (a long build, a hung tool) is
 *   interrupted at the timeout like before, and G1 still fails it closed. A crash has no
 *   drain and is unchanged.
 *
 * Exports: createDrain().
 * Depends on: @forge/hooks (openToolCalls), types/drain. IO: reads the receipt log.
 */

import { openToolCalls } from '@forge/hooks';
import type { Drain, DrainDeps } from '#/types/drain.types.js';

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function createDrain(deps: DrainDeps): Drain {
  const pollMs = deps.pollMs ?? 50;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  let draining = false;

  // A chain that cannot be read must not hold the shutdown: it counts as quiet.
  const inFlight = async (runIds: readonly string[]): Promise<string[]> => {
    const busy: string[] = [];

    for (const id of runIds) {
      const open = await deps.receipts.list(id).then(openToolCalls, () => []);
      if (open.length > 0) {
        busy.push(id);
      }
    }

    return busy;
  };

  return {
    begin() {
      draining = true;
    },
    isDraining: () => draining,
    async awaitQuiet(runIds, ms) {
      const deadline = now() + ms;
      let busy = await inFlight(runIds);

      while (busy.length > 0 && now() < deadline) {
        await sleep(Math.min(pollMs, Math.max(1, deadline - now())));
        busy = await inFlight(busy);
      }

      return busy;
    },
  };
}
