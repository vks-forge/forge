/**
 * Settle: closes a run's books, then lets the outcome move its ticket.
 *
 * Why: when a run ends, several records must agree or the audit trail and the gates have
 *   nothing to stand on: the run row (final status, usage, cost, error family, end time),
 *   the receipt chain's last hash (what the Worker's tools actually did), the files git says
 *   changed (not what the Worker claims), the revoked per-run token, and the ticket's next
 *   state. The row goes `settling` first, the slow reads (git, receipts) happen outside the
 *   transaction, and the final writes land together so a crash never leaves a closed run
 *   with an open ticket. The worktree is kept for the PR step; it goes on Done or Cancelled.
 *
 * Exports: settleRun().
 * Depends on: @forge/core, domain/results, tick/card-budget, tick/outcome, tick/stage-artifacts, shared/time. Reads git and receipts via ports.
 */

import type { ErrorFamily, Run, RunResult, TicketId } from '@forge/core';
import { runStatusFor } from '#/domain/results.js';
import { emitTrace } from '#/shared/trace.js';
import { warnOnBudget } from '#/tick/card-budget.js';
import { applyOutcome } from '#/tick/outcome.js';
import { runtimeFor } from '#/tick/project-runtime.js';
import { pipelineHasChecks } from '#/tick/stage-artifacts.js';
import type { EngineCtx, Pump } from '#/types/engine-state.types.js';
import type { SettleOptions } from '#/types/tick.types.js';

/** The family stored on the run row: the driver's, else implied by the status. */
function resolveFamily(result: RunResult): ErrorFamily | undefined {
  if (result.errorFamily) {
    return result.errorFamily;
  }

  if (result.status === 'error') {
    return 'unknown';
  }

  if (result.status === 'timeout') {
    return 'stall';
  }

  return undefined;
}

/** Settles `run` with `result`; `pump` is present for runs this process started. */
export async function settleRun(
  ctx: EngineCtx,
  run: Run,
  result: RunResult,
  pump?: Pump,
  opts: SettleOptions = {},
): Promise<void> {
  const { deps, state } = ctx;
  // An interrupted run goes straight to its ending: `settling` is not on its way out of the
  // interrupted state (core run transitions).
  if (run.status !== 'interrupted') {
    await deps.storage.transaction((tx) =>
      tx.runs.update(run.id, { status: 'settling' }),
    );
  }

  let files = [...result.filesTouched];
  let diff: string | undefined;
  const baseSha = state.baseShas.get(run.id);
  if (baseSha) {
    try {
      const slug =
        run.project ??
        (
          await deps.storage.transaction((tx) =>
            tx.tickets.get(run.ticket_id as TicketId),
          )
        )?.project;

      const runtime = slug ? runtimeFor(ctx, slug) : null;
      if (!runtime) {
        throw new Error(`no runtime for project ${slug ?? '(unknown)'}`);
      }

      files = await runtime.worktrees.changedFiles(run.cwd, baseSha);
      // A pipeline with checks keeps what each writer left as an artifact: the patch is read here,
      // outside the transaction, because it is a git call.
      const snapshot = await deps.storage.transaction((tx) =>
        tx.ticketPipelines.get(run.ticket_id),
      );

      if (snapshot && pipelineHasChecks(snapshot)) {
        diff = (await runtime.worktrees.diff(run.cwd, baseSha)).patch;
      }
    } catch (e) {
      deps.log?.('warn', `could not list changed files for ${run.id}`, {
        error: String(e),
      });
    }
  }

  let chainHash: string | undefined;
  let receipts: SettleOptions['receipts'];
  try {
    receipts = await deps.receipts.list(run.id);
    chainHash = receipts.at(-1)?.hash;
  } catch (e) {
    deps.log?.('warn', `could not read receipt chain for ${run.id}`, {
      error: String(e),
    });
  }

  const family = resolveFamily(result);
  const status = opts.status ?? runStatusFor(result);
  const session = result.session ?? pump?.handle.session ?? null;
  await deps.storage.transaction(async (tx) => {
    await tx.runs.update(run.id, {
      status,
      ended_at: ctx.nowIso,
      usage: result.usage,
      ...(result.costUsd === null ? {} : { cost_usd: result.costUsd }),
      ...(family ? { error_family: family } : {}),
      ...(session ? { session_ref: session } : {}),
      ...(chainHash ? { final_chain_hash: chainHash } : {}),
    });

    await tx.runTokens.revoke(run.id, ctx.nowIso);
    await applyOutcome(ctx, tx, run, result, family, pump, {
      ...opts,
      receipts: opts.receipts ?? receipts,
      diff,
    });

    // The run's cost is now on its row: a card crossing its budget cap is warned, never stopped (d-0143).
    const ticket = await tx.tickets.get(run.ticket_id as TicketId);
    await warnOnBudget(tx, ticket?.card_id, ctx.nowIso);
  });

  emitTrace(deps, {
    level: family ? 'warn' : 'info',
    kind: 'run',
    ticket_id: run.ticket_id,
    run_id: run.id,
    actor: 'engine',
    message: `run settled ${run.id} as ${status}`,
    data: { status, errorFamily: family ?? null, costUsd: result.costUsd, files },
  });

  state.pumps.delete(run.id);
  state.baseShas.delete(run.id);
  ctx.report.settled.push({
    runId: run.id,
    ticketId: run.ticket_id,
    status,
    ...(family ? { errorFamily: family } : {}),
    filesTouched: files,
  });
}
