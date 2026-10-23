/**
 * Triage: turns `inbox` tickets into `planned` ones (or parks them).
 *
 * Why: every request is judged before any Worker starts (d-0025): a deterministic
 *   pre-check, then the `triage` step, then the lane rule that lets the pre-check and the
 *   user's hint have the last word over the model. The result names the real title, type,
 *   lane and tier, and the ticket becomes `planned`. A ticket whose lane has no runner yet
 *   (Full, until its pipeline goes live) parks in WaitingHuman with a plain reason instead of
 *   silently running with too little process (d-0059, brief E1), and the park is a lane-hold
 *   escalation so the owner has a way forward; the engine lifts it when the lane goes live. A rejected triage leaves the
 *   ticket in the inbox and is not retried until its hold passes. The model call is a job beside the
 *   tick (one per ticket, within the Director's step limit, after every step a Worker or an owner waits
 *   on); the tick that collects it applies the move, and drops the answer when the ticket is no longer
 *   in the inbox (cancelled meanwhile), so a slow triage never holds up a Worker.
 *
 * Exports: triageInbox().
 * Depends on: tick/memory-context (the memory shown to the Director), @forge/core (preCheckLane, TriageOutput), domain/lane-rules, steps/run-step,
 *   tick/director-jobs, tick/ticket-moves.
 */

import { NewRequestPayload, TriageOutput, preCheckLane } from '@forge/core';
import type { Lane, Ticket } from '@forge/core';
import { decideLane } from '#/domain/lane-rules.js';
import { isLive } from '#/domain/live-lanes.js';
import { ticketNumber } from '#/domain/ticket-numbers.js';
import { hold, isHeld, rejectStep, runStep } from '#/steps/run-step.js';
import { buildMemoryContext, questionOf } from '#/tick/memory-context.js';
import { directorSlots, startTicketStep, ticketKey } from '#/tick/director-jobs.js';
import { isUnservable, projectSettings } from '#/tick/tick-config.js';
import { raiseEscalation } from '#/tick/escalation-raise.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import type { DirectorApply } from '#/types/director-jobs.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { TicketPlan } from '#/types/tick.types.js';

/** The requester's hint, type and title, read back from the stored intake event so a restart cannot lose them. */
async function requestMeta(
  ctx: EngineCtx,
  ticket: Ticket,
): Promise<NewRequestPayload | null> {
  if (ticket.created_by_intake === undefined) {
    return null;
  }

  const id = ticket.created_by_intake;
  const stored = await ctx.deps.storage.transaction((tx) => tx.intakeEvents.get(id));
  const parsed = NewRequestPayload.safeParse(stored?.payload);

  return parsed.success ? parsed.data : null;
}

/** Asks the triage step about `ticket` (in a job); returns the move to apply, or nothing when the step was rejected. */
async function triageOne(
  ctx: EngineCtx,
  ticket: Ticket,
): Promise<DirectorApply | undefined> {
  const { deps } = ctx;
  const project = await deps.storage.transaction((tx) => tx.projects.get(ticket.project));
  if (!project) {
    throw new Error(`ticket ${ticket.id} names unknown project ${ticket.project}`);
  }

  const meta = await requestMeta(ctx, ticket);
  const slice = await buildMemoryContext(ctx, project.slug, {
    question: questionOf(ticket.title, ticket.body),
    rewrite: false,
  });

  // Tier C paths are policy: they come from the settings snapshot, so an edit applies at once.
  const globs = projectSettings(ctx.config, project.slug).tier_c_globs;
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

  if (!answer.ok) {
    rejectStep(ctx, 'triage', ticket.id, answer.error);

    return undefined;
  }

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
    threshold: ctx.config.forge.engine.confidence_threshold,
    tierCGlobs: globs,
  });

  // Only a lane with no runner yet is held; the engine releases the hold itself once it is live.
  const parked = !isLive(decision.lane);
  const reason = `pipeline_pending: triage chose the ${decision.lane} lane, which goes live in the next update. Run it as Express to start it now${
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

  return (tick) => applyTriage(tick, ticket, plan, decision.lane, parked, reason);
}

/** Writes a triage decision in the tick; dropped when the ticket left the inbox while the step ran. */
async function applyTriage(
  ctx: EngineCtx,
  ticket: Ticket,
  plan: TicketPlan,
  lane: Lane,
  parked: boolean,
  reason: string,
): Promise<void> {
  const { deps } = ctx;
  const moved = await deps.storage.transaction(async (tx) => {
    const made = await moveTicketTx(tx, ticket.id, ctx.nowIso, (t) =>
      t.status === 'inbox' ? plan : null,
    );

    // A held lane is the owner's choice (run as Express, re-plan, cancel), never the Director's.
    if (made.ok && parked) {
      await raiseEscalation(
        tx,
        deps,
        ctx.nowIso,
        made.ticket,
        {
          kind: 'failure',
          cause: 'lane_hold',
          summary: reason,
          attempts: [],
          lane,
        },
        'owner',
      );
    }

    return made;
  });

  if (!moved.ok) {
    deps.log?.('warn', 'triage could not be applied', { reason: moved.reason });

    return;
  }

  ctx.report.triaged.push({ ticketId: ticket.id, lane, parked });
  if (parked) {
    ctx.report.parked.push({ ticketId: ticket.id, reason });
  }
}

/** The job body for one inbox ticket: a failure holds the ticket off and is reported, never thrown. */
async function triageJob(
  job: EngineCtx,
  ticket: Ticket,
): Promise<DirectorApply | undefined> {
  try {
    return await triageOne(job, ticket);
  } catch (e) {
    hold(job, `triage:${ticket.id}`);
    job.report.errors.push({
      where: `triage ${ticket.id}`,
      message: String(e instanceof Error ? e.message : e),
    });

    return undefined;
  }
}

/**
 * Starts a triage job for each inbox ticket, oldest first, while Director slots are free; a ticket
 * with a job in flight waits for it. Returns at once: the answers are applied by the next tick.
 */
export async function triageInbox(ctx: EngineCtx): Promise<void> {
  const inbox = await ctx.deps.storage.transaction((tx) =>
    tx.tickets.listByStatus('inbox'),
  );

  for (const ticket of [...inbox].sort(
    (a, b) => ticketNumber(a.id) - ticketNumber(b.id),
  )) {
    if (directorSlots(ctx) === 0) {
      return;
    }

    if (
      isHeld(ctx, `triage:${ticket.id}`) ||
      isUnservable(ctx.config, ticket.project) ||
      ctx.state.directorJobs.has(ticketKey(ticket.id))
    ) {
      continue;
    }

    startTicketStep(ctx, ticket.id, (job) => triageJob(job, ticket));
  }
}
