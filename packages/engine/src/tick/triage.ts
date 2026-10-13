/**
 * Triage: turns `inbox` tickets into `planned` ones (or parks them).
 *
 * Why: every request is judged before any Worker starts (d-0025): a deterministic
 *   pre-check, then the `triage` step, then the lane rule that lets the pre-check and the
 *   user's hint have the last word over the model. The result names the real title, type,
 *   lane and tier, and the ticket becomes `planned`. M0 only runs Express: a ticket that
 *   needs a heavier lane parks in WaitingHuman with a plain reason instead of silently
 *   running with too little process (d-0059, brief E1). A rejected triage leaves the
 *   ticket in the inbox and is not retried until its hold passes.
 *
 * Exports: triageInbox().
 * Depends on: @forge/core (preCheckLane, TriageOutput), domain/lane-rules, steps/run-step,
 *   tick/ticket-moves.
 */

import { NewRequestPayload, TriageOutput, preCheckLane } from '@forge/core';
import type { Ticket } from '@forge/core';
import { decideLane } from '#/domain/lane-rules.js';
import { ticketNumber } from '#/domain/ticket-numbers.js';
import { hold, isHeld, rejectStep, runStep } from '#/steps/run-step.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { TicketPlan } from '#/types/tick.types.js';

/** The requester's hint, type and title, read back from the stored intake event so a restart cannot lose them. */
async function requestMeta(
  ctx: EngineCtx,
  ticket: Ticket,
): Promise<NewRequestPayload | null> {
  if (ticket.created_by_intake === undefined) return null;
  const id = ticket.created_by_intake;
  const stored = await ctx.deps.storage.transaction((tx) => tx.intakeEvents.get(id));
  const parsed = NewRequestPayload.safeParse(stored?.payload);
  return parsed.success ? parsed.data : null;
}

async function triageOne(ctx: EngineCtx, ticket: Ticket): Promise<void> {
  const { deps } = ctx;
  const project = await deps.storage.transaction((tx) => tx.projects.get(ticket.project));
  if (!project)
    throw new Error(`ticket ${ticket.id} names unknown project ${ticket.project}`);
  const meta = await requestMeta(ctx, ticket);
  const slice = await deps.memory.slice(project.slug);
  const globs = project.tier_c_globs;
  const early = preCheckLane({
    tierCGlobs: globs,
    bodyLength: ticket.body.length,
    type: ticket.type,
  });

  const answer = await runStep(
    ctx,
    'triage',
    {
      ticket: {
        id: ticket.id,
        title: ticket.title,
        text: ticket.body,
        type: meta?.type ?? null,
      },
      hint: meta?.hint ?? null,
      pre_check: early,
      tier_c_globs: globs,
      memory: slice,
    },
    TriageOutput,
  );
  if (!answer.ok) return rejectStep(ctx, 'triage', ticket.id, answer.error);

  const out = answer.value;
  const type = meta?.type ?? out.type;
  const pre = preCheckLane({
    touchedPaths: out.predicted_files,
    tierCGlobs: globs,
    bodyLength: ticket.body.length,
    type,
  });
  const decision = decideLane({
    pre,
    llm: out,
    ...(meta?.hint ? { hint: meta.hint } : {}),
    threshold: deps.config.engine.confidence_threshold,
    tierCGlobs: globs,
  });
  const parked = decision.lane !== 'express';
  const reason = `lane not enabled in M0: triage chose ${decision.lane}${
    decision.reasons.length ? ` (${decision.reasons.join('; ')})` : ''
  }`;
  const plan: TicketPlan = {
    events: [
      { type: 'triaged', lane: decision.lane, tier_predicted: decision.tier },
      ...(parked ? [{ type: 'parked' as const, reason }] : []),
    ],
    fields: {
      title: meta?.title ?? out.title,
      type,
    },
  };
  const moved = await moveTicket(deps.storage, ticket.id, ctx.nowIso, (t) =>
    t.status === 'inbox' ? plan : null,
  );
  if (!moved.ok) {
    deps.log?.('warn', 'triage could not be applied', { reason: moved.reason });
    return;
  }
  ctx.report.triaged.push({ ticketId: ticket.id, lane: decision.lane, parked });
  if (parked) ctx.report.parked.push({ ticketId: ticket.id, reason });
}

/** Triages every inbox ticket, oldest first; a failure on one does not stop the others. */
export async function triageInbox(ctx: EngineCtx): Promise<void> {
  const inbox = await ctx.deps.storage.transaction((tx) =>
    tx.tickets.listByStatus('inbox'),
  );
  for (const ticket of [...inbox].sort(
    (a, b) => ticketNumber(a.id) - ticketNumber(b.id),
  )) {
    if (isHeld(ctx, `triage:${ticket.id}`)) continue;
    try {
      await triageOne(ctx, ticket);
    } catch (e) {
      hold(ctx, `triage:${ticket.id}`);
      ctx.report.errors.push({
        where: `triage ${ticket.id}`,
        message: String(e instanceof Error ? e.message : e),
      });
    }
  }
}
