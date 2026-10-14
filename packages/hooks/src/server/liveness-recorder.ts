/**
 * Records that a run's hook is alive: the first `SessionStart` registration (d-0033).
 *
 * Why: tool calls are receipted and gated only if the harness really runs our hook. A
 *   Worker whose hook never starts would run unobserved, so the first `SessionStart` the
 *   hook route accepts is stored on the run (a `hook_liveness` event and
 *   `hook_registered_at`) and the engine is woken. The event is the evidence the control
 *   room and a later preflight check read. Only the first one counts: the harness fires
 *   `SessionStart` again on resume, compact and clear, and each of those must not move the
 *   registration time or add liveness events, or the evidence would no longer say when the
 *   hook first proved itself. The fingerprint ties the registration to this run and
 *   harness session.
 *
 * Exports: createLivenessRecorder().
 * Depends on: @forge/core (StorageAdapter), @forge/tools (sha256Hex). IO: writes storage.
 */

import type { StorageAdapter } from '@forge/core';
import { sha256Hex } from '@forge/tools';

/** Returns the `onLiveness` callback of the hook handler. */
export function createLivenessRecorder(deps: {
  storage: StorageAdapter;
  now: () => Date;
  onRegistered: () => void;
}): (runId: string, payload: Record<string, unknown>) => Promise<void> {
  return async (runId, payload) => {
    const session =
      typeof payload['session_id'] === 'string' ? payload['session_id'] : '';

    const ts = deps.now().toISOString();

    const registered = await deps.storage.transaction(async (tx) => {
      const run = await tx.runs.get(runId);
      if (!run || run.hook_registered_at !== undefined) {
        return false;
      }

      await tx.runEvents.append(runId, {
        type: 'hook_liveness',
        ts,
        fingerprint: sha256Hex(`${runId}:${session}`),
      });

      await tx.runs.update(runId, { hook_registered_at: ts });

      return true;
    });

    if (registered) {
      deps.onRegistered();
    }
  };
}
