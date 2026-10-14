/**
 * Reconcile: bring recorded runs in line with what is actually alive.
 *
 * Why: the database says which runs exist; only this process knows which are really
 *   running. Three gaps open between the two. After a restart every run owned by the old
 *   server is dead, because its per-run secret lived in memory only (d-0054): they are
 *   crash-settled and retried, never left assigned to nothing. A run whose harness hangs
 *   emits nothing, so a run silent for `stall_ms` is cancelled and settled as a stall. And
 *   a run whose stream has ended is settled here so its ticket moves on. All three end in
 *   the same `settleRun`, so retry and park rules apply uniformly.
 *
 * Exports: crashForeignRuns(), settleFinishedPumps(), cancelStalled().
 * Depends on: @forge/core (WorkerDriver port), tick/settle, tick/pump, domain/results.
 */

import type { RunResult } from '@forge/core';
import { failureResult } from '#/domain/results.js';
import { pumpResult } from '#/tick/pump.js';
import { settleRun } from '#/tick/settle.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Grace for a cancelled harness to report before the stall is settled without its result. */
const CANCEL_GRACE_MS = 10_000;

/** First tick only: runs owned by another server are dead; settle them as crashes (d-0054). */
export async function crashForeignRuns(ctx: EngineCtx): Promise<void> {
  const open = await ctx.deps.storage.transaction((tx) =>
    tx.runs.listByStatus(['starting', 'running', 'settling']),
  );

  for (const run of open) {
    if (run.owner === ctx.deps.owner) {
      continue;
    }

    await settleRun(ctx, run, failureResult('crash'));
    ctx.report.crashed.push(run.id);
  }
}

/** Settles every pump whose stream and result are in. */
export async function settleFinishedPumps(ctx: EngineCtx): Promise<void> {
  for (const pump of [...ctx.state.pumps.values()]) {
    if (!pump.done) {
      continue;
    }

    const run = await ctx.deps.storage.transaction((tx) => tx.runs.get(pump.runId));
    if (!run) {
      ctx.state.pumps.delete(pump.runId);
      continue;
    }

    await settleRun(ctx, run, pumpResult(pump), pump);
  }
}

/** Cancels runs silent for `stall_ms` and settles them as `stall` in the same tick. */
export async function cancelStalled(ctx: EngineCtx): Promise<void> {
  const { deps, state } = ctx;
  for (const pump of [...state.pumps.values()]) {
    if (pump.done) {
      continue;
    }

    const run = await deps.storage.transaction((tx) => tx.runs.get(pump.runId));
    if (!run) {
      continue;
    }

    const last = Date.parse(run.last_event_at ?? run.started_at);
    if (ctx.now - last <= ctx.config.forge.engine.stall_ms) {
      continue;
    }

    pump.stalled = true;
    deps.log?.('warn', `run ${run.id} silent for ${ctx.now - last} ms; cancelling`, {
      ticket: run.ticket_id,
    });

    let stopTimer = (): void => undefined;
    try {
      await deps.driver.cancel(pump.handle);
      const grace = new Promise<void>((r) => {
        stopTimer = deps.clock.after(CANCEL_GRACE_MS, r);
      });

      await Promise.race([pump.finished, grace]);
    } catch (e) {
      deps.log?.('error', `cancel failed for ${run.id}`, { error: String(e) });
    }

    stopTimer();
    const base: RunResult =
      pump.result ?? failureResult('stall', pump.handle.session ?? null);

    await settleRun(ctx, run, { ...base, status: 'timeout', errorFamily: 'stall' }, pump);
  }
}
