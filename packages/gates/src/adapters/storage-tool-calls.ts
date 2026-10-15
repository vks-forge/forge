/**
 * The tool calls the harness reported for a run, read from the stored run events.
 *
 * Why: gate G1 compares what the Worker claims it ran with what the harness says it ran
 *   and with the signed receipt chain. The harness's list is whatever the driver recorded
 *   as `tool_call` run events, so G1 gets it from storage rather than from the driver
 *   process, which a restart would have lost. One kind of call is left out: when a restart
 *   interrupts a run (d-0092) the harness has already announced the calls it was about to
 *   make, and its process dies before their PreToolUse hook is answered. Those calls never ran,
 *   so no receipt is owed. The cut-off shows in the stream: the resumed process registers hook
 *   liveness again, so a call that has no result anywhere and is followed by a later liveness
 *   event was abandoned by the restart. A call with a result ran and needs its receipt, as does
 *   any call left open at the end of the run, so a hook bypass cannot hide behind a restart.
 *   The excuse is narrow on purpose: it needs a liveness registration the run's `generation`
 *   accounts for (a run that never resumed excuses nothing, and a Worker cannot manufacture
 *   extra registrations), and only a read-only tool is excused. A cut-off `Edit`, `Write`,
 *   `Bash` or `PowerShell` call might have run before the process died, so its receipt stays
 *   owed and G1 fails on its absence rather than trusting the gap.
 *
 * Exports: createStorageToolCallLister().
 * Depends on: @forge/core (StorageAdapter, RunEvent), types/g1-deps. IO: reads storage (run events, run generation).
 */

import type { RunEvent, StorageAdapter } from '@forge/core';
import type { ToolCallRef } from '#/types/g1-deps.types.js';

/** Tools that cannot change anything: a cut-off call of one of these needs no receipt. */
const READ_ONLY_TOOLS = new Set(['read', 'glob', 'grep', 'ls']);

/**
 * Read-only calls with no result anywhere in `events` that come before a liveness
 * registration after the first, for as many registrations as the run has generations.
 */
function abandonedByRestart(
  events: readonly RunEvent[],
  generation: number,
): ReadonlySet<string> {
  const finished = new Set(
    events.flatMap((e) => (e.type === 'tool_result' ? [e.call_id] : [])),
  );

  const abandoned = new Set<string>();
  const pending: string[] = [];
  let registrations = 0;
  for (const e of events) {
    if (e.type === 'tool_call' && !finished.has(e.call_id)) {
      if (READ_ONLY_TOOLS.has(e.name.toLowerCase())) {
        pending.push(e.call_id);
      }
    } else if (e.type === 'hook_liveness' && ++registrations > 1) {
      // A later registration: the process that announced `pending` is gone, if the run resumed.
      if (registrations <= generation) {
        pending.splice(0).forEach((id) => abandoned.add(id));
      }
    }
  }

  return abandoned;
}

/** `listToolCalls` for G1 over the run events in `storage`. */
export function createStorageToolCallLister(
  storage: StorageAdapter,
): (runId: string) => Promise<ToolCallRef[]> {
  return async (runId) => {
    const { events, generation } = await storage.transaction(async (tx) => ({
      events: await tx.runEvents.listByRun(runId),
      generation: (await tx.runs.get(runId))?.generation ?? 1,
    }));

    const abandoned = abandonedByRestart(events, generation);

    return events.flatMap((e) =>
      e.type === 'tool_call' && !abandoned.has(e.call_id)
        ? [{ callId: e.call_id, name: e.name }]
        : [],
    );
  };
}
