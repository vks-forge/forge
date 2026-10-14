/**
 * The tool calls the harness reported for a run, read from the stored run events.
 *
 * Why: gate G1 compares what the Worker claims it ran with what the harness says it ran
 *   and with the signed receipt chain. The harness's list is whatever the driver recorded
 *   as `tool_call` run events, so G1 gets it from storage rather than from the driver
 *   process, which a restart would have lost.
 *
 * Exports: createStorageToolCallLister().
 * Depends on: @forge/core (StorageAdapter), types/g1-deps. IO: reads storage.
 */

import type { StorageAdapter } from '@forge/core';
import type { ToolCallRef } from '#/types/g1-deps.types.js';

/** `listToolCalls` for G1 over the run events in `storage`. */
export function createStorageToolCallLister(
  storage: StorageAdapter,
): (runId: string) => Promise<ToolCallRef[]> {
  return async (runId) => {
    const events = await storage.transaction((tx) => tx.runEvents.listByRun(runId));

    return events.flatMap((e) =>
      e.type === 'tool_call' ? [{ callId: e.call_id, name: e.name }] : [],
    );
  };
}
