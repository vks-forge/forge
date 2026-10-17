/**
 * Reconcile: bring recorded runs in line with what is actually alive.
 *
 * Why: the database says which runs exist; only this process knows which are really
 *   running. Two gaps open between the two while the server runs. A run whose harness hangs
 *   emits nothing, so a run silent for `stall_ms` is cancelled and settled as a stall. And
 *   a run whose stream has ended is settled here so its ticket moves on. Both end in the same
 *   `settleRun`, so retry and park rules apply uniformly. A run the server itself interrupted
 *   at shutdown is skipped: it belongs to the next start, which resumes it (`tick/restart`).
 *   Runs left by an earlier server are handled there too. A resumed run whose harness fails
 *   before reporting anything never got its session back: it is retried as a new run, not
 *   counted as an ordinary failure.
 *
 * Exports: settleFinishedPumps(), cancelStalled().
 * Depends on: @forge/core (WorkerDriver port), tick/settle, tick/settle-guard, tick/pump, domain/results.
 *   Each run settles in isolation: one that throws is counted and parked after repeated failures.
 */

import type { RunResult } from '@forge/core';
import { failureResult } from '#/domain/results.js';
import { pumpResult } from '#/tick/pump.js';
import { settleRun } from '#/tick/settle.js';
import { settleGuarded } from '#/tick/settle-guard.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Grace for a cancelled harness to report before the stall is settled without its result. */
const CANCEL_GRACE_MS = 10_000;

/** Settles every pump whose stream and result are in. */
export async function settleFinishedPumps(ctx: EngineCtx): Promise<void> {
  for (const pump of [...ctx.state.pumps.values()]) {
    if (!pump.done || pump.interrupted) {
      continue;
    }

    const run = await ctx.deps.storage.transaction((tx) => tx.runs.get(pump.runId));
    if (!run) {
      ctx.state.pumps.delete(pump.runId);
      continue;
    }

    const result = pumpResult(pump);
    if (pump.resumed && pump.events === 0 && result.status === 'error') {
      // The harness never gave the session back (no event, not even the session report):
      // retry as a new run in the same worktree rather than as an ordinary failure.
      const family = result.errorFamily;
      const plain = family === undefined || family === 'unknown' || family === 'crash';
      ctx.report.resumeFailed.push(run.id);
      await settleGuarded(ctx, run, () =>
        settleRun(ctx, run, plain ? { ...result, errorFamily: 'crash' } : result, pump, {
          status: 'settled',
          retryReason: 'resume_failed',
        }),
      );

      continue;
    }

    await settleGuarded(ctx, run, () => settleRun(ctx, run, result, pump));
  }
}

/** Cancels runs silent for `stall_ms` and settles them as `stall` in the same tick. */
export async function cancelStalled(ctx: EngineCtx): Promise<void> {
  const { deps, state } = ctx;
  for (const pump of [...state.pumps.values()]) {
    if (pump.done || pump.interrupted) {
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
      await pump.driver.cancel(pump.handle);
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

    await settleGuarded(ctx, run, () =>
      settleRun(ctx, run, { ...base, status: 'timeout', errorFamily: 'stall' }, pump),
    );
  }
}
