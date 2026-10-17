/**
 * Approve and merge / sign off and merge: the owner's way forward for finished work.
 *
 * Why: tier B work waits in `review` and tier C in `needs_signoff` for a person, and until now the
 *   only things to do there were send it back or cancel it, so a passed ticket (DCP-1, twice) was
 *   stuck. This is the owner's act: it resolves the same target the verify phase uses, checks
 *   that the stored gate rows really are a pass for this run, and hands the merge to the merge
 *   door (`mergeReviewed`), the only place that calls the git host. The outcome is closed:
 *   `done`, `head_moved` (the PR changed after the gates ran, nothing merged, the ticket went
 *   back to be gated again) or `merge_refused` with the reason (closed PR, conflicts, a host
 *   error), never a thrown string, so a late click is a normal answer.
 *
 * Exports: approveAndMerge().
 * Depends on: @forge/core (ForgeError), domain/gate-rows, tick/{verify, verify-merge, tick-config,
 *   tick-report, card-notify, stage-records, tick-requests}. IO through the git host and worktree ports.
 */

import { ForgeError } from '@forge/core';
import type { Ticket } from '@forge/core';
import { latestPerGate, summarizeGates } from '#/domain/gate-rows.js';
import { iso } from '#/shared/time.js';
import { notifyCard } from '#/tick/card-notify.js';
import { approveHuman } from '#/tick/stage-records.js';
import { loadTickConfig } from '#/tick/tick-config.js';
import { emptyReport } from '#/tick/tick-report.js';
import { requestTick } from '#/tick/tick-requests.js';
import { resolveTarget } from '#/tick/verify.js';
import { mergeReviewed } from '#/tick/verify-merge.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';
import type { ActOutcome } from '#/types/escalation.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** Merges the ticket's PR for the owner; `signer` names who signs off tier C work. */
export async function approveAndMerge(
  deps: EngineDeps,
  state: EngineState,
  ticket: Ticket,
  signer: string | undefined,
): Promise<ActOutcome> {
  const now = deps.clock.now();
  const ctx: EngineCtx = {
    deps,
    state,
    report: emptyReport(iso(now), false),
    config: await loadTickConfig(deps),
    now,
    nowIso: iso(now),
  };

  try {
    const target = await resolveTarget(ctx, ticket);
    if (!target) {
      return {
        status: 'merge_refused',
        detail: 'the ticket has no finished run or git host to merge from',
      };
    }

    const stored = await deps.storage.transaction((tx) =>
      tx.gateResults.listByTicket(ticket.id),
    );

    const rows = latestPerGate(stored.filter((r) => r.run_id === target.run.id));
    // Fail closed: the owner approves a pass the gates recorded, never a guess.
    if (summarizeGates(rows, target.runtime.gates).kind !== 'pass') {
      return {
        status: 'merge_refused',
        detail: 'the gates have no passing verdict for this run',
      };
    }

    const end = await mergeReviewed(ctx, target, rows, signer);
    if (end === 'done') {
      // The owner's approval passes the pipeline's human stage.
      await deps.storage.transaction((tx) => approveHuman(tx, ctx.nowIso, ticket.id));
    }

    requestTick(deps, state);
    if (ticket.card_id) {
      await notifyCard(deps, ticket.card_id);
    }

    return end === 'done'
      ? { status: 'done', interaction: null }
      : { status: 'head_moved' };
  } catch (e) {
    if (e instanceof ForgeError) {
      deps.log?.('warn', `merge of ${ticket.id} refused`, { error: e.message });

      return { status: 'merge_refused', detail: e.message };
    }

    throw e;
  }
}
