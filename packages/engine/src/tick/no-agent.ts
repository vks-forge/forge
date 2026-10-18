/**
 * No agent available: the failure a stage ends in when every place its agent can run has been tried.
 *
 * Why: after the retries of each place and the agent's whole fallback list, the stage cannot run, and the ticket must
 *   say so in a form the Director can act on and the owner can read: one `parked` event with a reason that starts
 *   `no_agent_available` (so the park is classified from the text like every other), and one failure item listing every
 *   place that was tried. The Director looks first unless the agent says pause. A Retry starts the chain over, so the
 *   places tried on the errored stage rows are cleared (also when the Director swaps in a substitute, which starts its
 *   own chain).
 *
 * Exports: noAgentReason(), parkNoAgent(), raiseNoAgent(), resetFallbackTx().
 * Depends on: @forge/core (ErrorFamily, Run, Ticket), tick/{escalation-raise,ticket-moves}, types/agent-fallback.
 *   Writes inside the caller's transaction.
 */

import type { ErrorFamily, Run, StorageTx, Ticket } from '@forge/core';
import { raiseEscalation, stageFor } from '#/tick/escalation-raise.js';
import { moveTicketTx, parkPlan } from '#/tick/ticket-moves.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { SlotMove } from '#/types/agent-fallback.types.js';

/** The `no_agent_available` reason a parked ticket carries; `classifyPark` reads its prefix. */
export const noAgentReason = (
  agentId: string,
  family: ErrorFamily,
  tried: SlotMove & { kind: 'exhausted' },
): string =>
  `no_agent_available: ${agentId} could not run this stage on any of its ${Math.max(1, tried.tried.length)} place${tried.tried.length === 1 ? '' : 's'} (${family})`;

/**
 * Parks a ticket whose stage ran out of places to run: one `parked` event, and the `no_agent_available`
 * failure with every try listed. The Director looks first unless the agent says pause. For a writer's run.
 */
export async function parkNoAgent(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  run: Run,
  family: ErrorFamily,
  exhausted: SlotMove & { kind: 'exhausted' },
  agentId: string,
): Promise<void> {
  const reason = noAgentReason(agentId, family, exhausted);
  const moved = await moveTicketTx(tx, ticket.id, ctx.nowIso, (t) => parkPlan(t, reason));
  if (!moved.ok) {
    ctx.deps.log?.('error', `could not park ${ticket.id}`, { reason: moved.reason });

    return;
  }

  ctx.report.parked.push({ ticketId: ticket.id, reason });
  await raiseNoAgent(ctx, tx, moved.ticket, run.id, reason, family, exhausted);
}

/** Raises the `no_agent_available` failure (the Director's look first unless the agent says pause). */
export async function raiseNoAgent(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  runId: string | undefined,
  reason: string,
  family: ErrorFamily,
  exhausted: SlotMove & { kind: 'exhausted' },
): Promise<void> {
  await raiseEscalation(
    tx,
    ctx.deps,
    ctx.nowIso,
    ticket,
    {
      kind: 'failure',
      cause: 'no_agent_available',
      summary: reason,
      attempts: exhausted.tried.map((t) => ({
        at: ctx.nowIso,
        what: `place ${t.slot}: ${t.harness}${t.model === undefined ? '' : ` (${t.model})`}`,
        result: family,
      })),
      error_family: family,
      lane: ticket.lane,
    },
    await stageFor(ctx, tx, ticket, exhausted.pause),
    runId,
  );
}

/**
 * Clears the entries tried on the ticket's errored stage rows, so a retry starts the chain over from the agent's
 * own place (the owner's Retry of a `no_agent_available` item).
 */
export async function resetFallbackTx(tx: StorageTx, ticketId: string): Promise<void> {
  for (const row of await tx.stageRuns.listByTicket(ticketId)) {
    if (row.status === 'error' && row.outcome.fallback !== undefined) {
      const { fallback: _gone, ...rest } = row.outcome;
      void _gone;
      await tx.stageRuns.finish(row.id, { outcome: rest });
    }
  }
}
