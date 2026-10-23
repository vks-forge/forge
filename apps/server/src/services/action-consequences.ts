/**
 * Action consequences: what Re-plan, Cancel ticket and Merge anyway would change right now.
 *
 * Why: the owner confirms these three actions in a popup, and a generic "are you sure?" does not
 *   say that a Re-plan holds tickets 7 and 8 until the new plan is approved, that a Cancel closes
 *   a pull request, or that Merge anyway overrules one named check. This reads the live state
 *   (the card's tickets through the engine's own keep rule, the ticket's branch, worktree, pull
 *   request and live run, the pending stop) and answers with the lists; the web words them. Nothing
 *   is written, and nothing here decides: the engine's doors still judge the act itself.
 *
 * Exports: actionConsequences().
 * Depends on: @forge/core (keep rule inputs, escalation reading, mechanicalStop, schemas),
 *   @forge/engine (replanImpact, openDependents). IO: reads storage inside the caller's transaction.
 */

import { mechanicalStop, toEscalation } from '@forge/core';
import type {
  ActionConsequences,
  ConsequenceAction,
  EscalationPayload,
  OverruledCheck,
  StorageTx,
  Ticket,
} from '@forge/core';
import { openDependents, replanImpact } from '@forge/engine';

const ACTIVE_RUN = new Set(['starting', 'running', 'settling']);
const SHOWN_FINDINGS = 3;

const ref = (t: Pick<Ticket, 'id' | 'title'>) => ({ id: t.id, title: t.title });

/** The newest pending item of the ticket that carries a stop (a failure, a hold, a setup or a sign-off). */
async function pendingStop(
  tx: StorageTx,
  ticketId: string,
): Promise<EscalationPayload | null> {
  const rows = (await tx.interactions.listByTicket(ticketId))
    .filter((r) => r.status === 'pending')
    .sort((a, b) => b.asked_at.localeCompare(a.asked_at));

  for (const row of rows) {
    const { payload } = toEscalation(row);
    if (payload.kind !== 'question' && payload.kind !== 'permission') {
      return payload;
    }
  }

  return null;
}

function stopSummary(payload: EscalationPayload | null) {
  if (payload === null) {
    return null;
  }

  if (payload.kind === 'setup') {
    return { cause: payload.cause.type, summary: payload.summary, findings: 0 };
  }

  if (payload.kind === 'failure') {
    return { cause: payload.cause, summary: payload.summary, findings: 0 };
  }

  if (payload.kind === 'decision') {
    return {
      cause: payload.cause,
      summary: payload.summary,
      findings: payload.findings.length,
    };
  }

  return payload.kind === 'sign_off'
    ? { cause: payload.cause, summary: payload.summary, findings: 0 }
    : null;
}

function overruled(payload: EscalationPayload | null): OverruledCheck[] {
  if (payload?.kind !== 'decision') {
    return [];
  }

  const counts: OverruledCheck['counts'] = {};
  for (const f of payload.findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }

  return [
    {
      stage_label: payload.stage_label,
      summary: payload.summary,
      counts,
      findings: payload.findings.slice(0, SHOWN_FINDINGS).map((f) => ({
        severity: f.severity,
        where:
          f.file === undefined
            ? null
            : f.line === undefined
              ? f.file
              : `${f.file}:${f.line}`,
        issue: f.issue,
      })),
    },
  ];
}

/** The consequences of `action` on the ticket, or null when there is no such ticket. */
export async function actionConsequences(
  tx: StorageTx,
  ticketId: Ticket['id'],
  action: ConsequenceAction,
): Promise<ActionConsequences | null> {
  const ticket = await tx.tickets.get(ticketId);
  if (!ticket) {
    return null;
  }

  if (action === 'cancel') {
    const run = ticket.assignee_run_id ? await tx.runs.get(ticket.assignee_run_id) : null;
    const dependents = await Promise.all(
      (await openDependents(tx, ticket.id)).map((id) => tx.tickets.get(id)),
    );

    return {
      action,
      ticket: ref(ticket),
      run_active: run !== null && ACTIVE_RUN.has(run.status),
      branch: ticket.branch ?? null,
      has_worktree: ticket.worktree !== undefined,
      pr_number: ticket.pr_number ?? null,
      dependents: dependents.filter((t): t is Ticket => t !== null).map(ref),
    };
  }

  const stop = await pendingStop(tx, ticket.id);
  if (action === 'merge_anyway') {
    return {
      action,
      ticket: ref(ticket),
      overruled: overruled(stop),
      branch: ticket.branch ?? null,
      pr_number: ticket.pr_number ?? null,
    };
  }

  const impact = await replanImpact(tx, ticket);

  return {
    action,
    ticket: ref(ticket),
    card_id: ticket.card_id ?? null,
    ticket_replaced: impact.originReplaced,
    held: impact.held.map(ref),
    kept: impact.kept.map((t) => ({ ...ref(t), status: t.status })),
    stop: stopSummary(stop),
    mechanical: stop === null ? null : mechanicalStop(stop),
  };
}
