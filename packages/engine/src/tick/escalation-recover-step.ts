/**
 * The Director's first look at a failed ticket: the `ticket_recover` step.
 *
 * Why: a ticket that hit a retry cap, a turn limit or the rework cap is stuck, and what the owner
 *   needs first is "what happened, and is another go worth it?". Some failures are noise and one
 *   more run with a good note fixes them; others are real, and another run only burns budget. The
 *   step reads the failure, the runs so far and the ticket's plan entry and answers retry or
 *   escalate with a plain diagnosis, and it is shown the newest error the runs reported (as data, clipped), so it
 *   does not have to guess why they stopped. The engine bounds it: it may retry a ticket itself only as
 *   many times, per failure cause, as the owner allowed (default one), so a ticket can never loop
 *   through the Director; the retry itself goes through the same door as the owner's (settle the
 *   escalation, `transition()`, wake with the note). Anything else, and any error, hands the
 *   failure to the owner with the diagnosis when there is one. A lane hold or a timed-out question
 *   never reaches this step: those are the owner's choice. The look runs in a job and returns the
 *   write (the retry, or the hand-over) as an `apply` the tick runs after re-checking the wait.
 *
 * Exports: lookAtFailure().
 * Depends on: tick/memory-context (the memory shown to the Director), @forge/core (step schemas, escalation types), domain/escalation-decision, steps/run-step,
 *   tick/card-budget, tick/escalation-effects, tick/escalation-raise, tick/plan-keys, tick/planning-state.
 *   Reads and writes storage.
 */

import { EscalationAnswer, TicketRecoverOutput } from '@forge/core';
import type { EscalationFailure, Interaction, StorageTx, Ticket } from '@forge/core';
import { directorMayRetry } from '#/domain/escalation-decision.js';
import { rejectStep, runStep } from '#/steps/run-step.js';
import { buildMemoryContext, questionOf } from '#/tick/memory-context.js';
import { addDirectorSpend } from '#/tick/card-budget.js';
import { retryTx } from '#/tick/escalation-effects.js';
import { handToOwner } from '#/tick/escalation-raise.js';
import { planEntryOf } from '#/tick/plan-keys.js';
import { directorFor } from '#/tick/planning-state.js';
import type { DirectorApply } from '#/types/director-jobs.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** How many times the Director already retried this ticket for this failure cause. */
async function directorRetries(
  ctx: EngineCtx,
  ticket: Ticket,
  cause: EscalationFailure['cause'],
): Promise<number> {
  const rows = await ctx.deps.storage.transaction((tx) =>
    tx.interactions.listByTicket(ticket.id),
  );

  return rows.filter((r) => {
    const a = EscalationAnswer.safeParse(r.answer);
    const p = r.payload as { kind?: string; cause?: string } | null;

    return (
      r.status === 'answered' &&
      a.success &&
      a.data.by === 'director' &&
      a.data.action === 'retry' &&
      p?.kind === 'failure' &&
      p.cause === cause
    );
  }).length;
}

const LAST_ERROR_MAX = 300;

/** The message of the newest `error` event across the ticket's runs (newest run first), clipped; undefined when none. */
async function lastErrorOf(tx: StorageTx, ticketId: string): Promise<string | undefined> {
  const runs = [...(await tx.runs.listByTicket(ticketId))].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  );

  for (const run of runs) {
    const events = await tx.runEvents.listByRun(run.id);
    for (const e of [...events].reverse()) {
      if (e.type === 'error' && e.message.trim() !== '') {
        return e.message.trim().slice(0, LAST_ERROR_MAX);
      }
    }
  }

  return undefined;
}

/** Looks at one director-stage failure: one more try with a note, or the owner with a diagnosis. Returns the write for the tick to apply. */
export async function lookAtFailure(
  ctx: EngineCtx,
  row: Interaction,
  ticket: Ticket,
  failure: EscalationFailure,
): Promise<DirectorApply> {
  const loaded = await ctx.deps.storage.transaction(async (tx) => ({
    project: await tx.projects.get(ticket.project),
    entry: await planEntryOf(tx, ticket),
    lastError: await lastErrorOf(tx, ticket.id),
  }));

  const slug = loaded.project?.slug ?? ticket.project;
  const { director } = directorFor(ctx, slug);
  const used = await directorRetries(ctx, ticket, failure.cause);
  const memory = await buildMemoryContext(ctx, slug, {
    question: questionOf(ticket.title, ticket.body),
    rewrite: false,
  });

  const playbook = director.playbooks['recover-failure'];

  let cost = 0;
  const result = await runStep(
    ctx,
    'ticket_recover',
    {
      playbook: playbook
        ? { id: 'recover-failure', title: playbook.title, body: playbook.body }
        : null,
      house_rules: director.house_rules,
      ticket: {
        id: ticket.id,
        title: ticket.title,
        body: ticket.body,
        lane: ticket.lane,
        tier_predicted: ticket.tier_predicted,
        rework_count: ticket.rework_count,
        acceptance: loaded.entry?.entry.acceptance ?? [],
        planned_files: loaded.entry?.entry.files ?? [],
      },
      failure: {
        cause: failure.cause,
        summary: failure.summary,
        attempts: failure.attempts,
        error_family: failure.error_family ?? null,
        ...(loaded.lastError === undefined ? {} : { last_error: loaded.lastError }),
      },
      director_retries: { used, max: director.escalation.max_director_retries },
      project_rules: {
        decisions: memory.decisions,
        rejected: memory.rejected,
        ...(memory.note === undefined ? {} : { note: memory.note }),
      },
    },
    TicketRecoverOutput,
    {
      timeoutMs: director.step_timeouts_ms.ticket_recover,
      onCost: (usd) => {
        cost += usd;
      },
    },
  );

  if (!result.ok) {
    rejectStep(ctx, 'ticket_recover', ticket.id, result.error);
  }

  const out = result.ok ? result.value : null;
  const retry =
    out?.decision === 'retry' &&
    directorMayRetry(used, director.escalation.max_director_retries);

  return (tick) =>
    tick.deps.storage.transaction(async (tx) => {
      await addDirectorSpend(
        tx,
        row.card_id,
        cost,
        tick.nowIso,
        director.budget_warning_usd,
        { kind: 'escalation_recover', ticketId: row.ticket_id },
      );

      if (retry) {
        const end = await retryTx(
          tick.deps,
          tx,
          tick.nowIso,
          row,
          {
            action: 'retry',
            by: 'director',
            ...(out.note === undefined ? {} : { note: out.note }),
          },
          'engine',
        );

        if (end === 'done') {
          return;
        }
      }

      await handToOwner(tx, tick.nowIso, row, {
        ...failure,
        ...(out === null ? {} : { diagnosis: out.diagnosis }),
      });
    });
}
