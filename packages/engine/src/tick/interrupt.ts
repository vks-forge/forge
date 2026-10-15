/**
 * Interrupt: how a live run is left when the server shuts down.
 *
 * Why: stopping Forge (closing the terminal, an update, Ctrl-C) used to cancel every Worker
 *   into a crash, which threw away hours of work and an agent's whole conversation. A run
 *   the server stops is instead marked `interrupted`, with the harness session it can be
 *   resumed from (d-0092). Everything the resume needs stays: the worktree and its changes,
 *   the run's token hash and its receipts; nothing is settled, revoked or retried. The mark is
 *   written before the harness is told to stop, and the pump is flagged, so the stream that
 *   ends because of the stop can never be mistaken for the run's own result and settled as a
 *   cancelled or failed run by a tick that is still in flight. A run whose result has already
 *   arrived is not touched: it finished by itself and is settled in the normal way.
 *
 * Exports: interruptRun().
 * Depends on: @forge/core (Run), shared/time, types/engine-state, types/engine. IO only through the engine ports.
 */

import type { RunStatus } from '@forge/core';
import { iso } from '#/shared/time.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** Statuses a shutdown can interrupt: the run was alive. */
const LIVE: readonly RunStatus[] = ['starting', 'running', 'settling'];

/** Marks `runId` interrupted and stops its harness; a run with no live pump is left alone. */
export async function interruptRun(
  deps: EngineDeps,
  state: EngineState,
  runId: string,
): Promise<void> {
  const pump = state.pumps.get(runId);
  if (!pump || pump.done) {
    return;
  }

  pump.interrupted = true;
  const at = iso(deps.clock.now());
  await deps.storage.transaction(async (tx) => {
    const run = await tx.runs.get(runId);
    if (!run || !LIVE.includes(run.status)) {
      return;
    }

    // The pump stores the session on the row as the harness reports it; a run stopped
    // before that has none and the next start retries it instead of resuming it.
    await tx.runs.update(runId, {
      status: 'interrupted',
      interrupted_at: at,
      ...(run.session_ref ? { resumable_session: run.session_ref } : {}),
    });
  });

  await pump.driver.cancel(pump.handle).catch((e: unknown) => {
    deps.log?.('warn', `could not stop the harness of interrupted run ${runId}`, {
      error: String(e),
    });
  });
}
