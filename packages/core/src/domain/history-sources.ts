/**
 * History entries from questions and Worker runs.
 *
 * Why: what a Worker asked, how long the owner took to answer and what each Worker run did is the
 *   heart of "what did this ticket go through". Each stored row becomes one plain entry with a link
 *   back to the row. Rows that card events describe better (an escalation with its title, a settled
 *   escalation with who settled it) are left to the events, so nothing shows twice.
 *
 * Exports: interactionItems(), runItems().
 * Depends on: domain/history-copy, domain/history-infer, domain/history-kit, types/history. No IO.
 */

import { formatDuration } from '#/domain/history-copy.js';
import { waitBeforeRun } from '#/domain/history-infer.js';
import { RANK, clip, linksOf, pushItem, textOf } from '#/domain/history-kit.js';
import type { HistoryCtx } from '#/types/history.types.js';

/** Questions asked, answered, timed out or withdrawn. */
export function interactionItems(ctx: HistoryCtx): void {
  const { facts } = ctx;
  const escalated = new Set<string>();
  const settled = new Set<string>();
  for (const e of facts.events) {
    if (e.kind === 'escalation') {
      escalated.add(e.payload.interaction_id);
    }

    if (e.kind === 'escalation_settled') {
      settled.add(e.payload.interaction_id);
    }
  }

  for (const row of facts.interactions) {
    if (row.ticket_id !== facts.ticketId) {
      continue;
    }

    const links = linksOf({ interaction_id: row.id, run_id: row.run_id });
    const asked = textOf(row.payload);
    const byWorker = row.kind === 'question' || row.kind === 'blocked';
    if (!escalated.has(row.id)) {
      pushItem(ctx, RANK.question, {
        at: row.asked_at,
        kind: 'question',
        actor: byWorker ? { type: 'worker' } : { type: 'engine' },
        title: byWorker
          ? `The Worker asked: ${clip(asked ?? 'a question')}`
          : `Needs you: ${clip(asked ?? `${row.kind.replace('_', ' ')} request`)}`,
        links,
      });
    }

    if (settled.has(row.id) || row.status === 'pending') {
      continue;
    }

    const end = row.answered_at ?? row.timeout_at;
    const waited = Math.max(0, Date.parse(end) - Date.parse(row.asked_at));
    if (row.status === 'answered') {
      const said = textOf(row.answer);
      pushItem(ctx, RANK.answer, {
        at: end,
        kind: 'answer',
        actor: { type: 'owner' },
        title: 'You answered',
        ...(said === undefined ? {} : { detail: said }),
        links,
        waited_ms: waited,
      });
    } else {
      pushItem(ctx, RANK.answer, {
        at: end,
        kind: 'answer',
        actor: { type: 'engine' },
        title:
          row.status === 'timed_out'
            ? `Question unanswered for ${formatDuration(waited)}, timed out`
            : 'Question withdrawn',
        links,
        waited_ms: waited,
      });
    }
  }
}

const RUN_TROUBLE: Readonly<Record<string, string>> = {
  refused: 'was refused',
  max_turns: 'ran out of turns',
  timeout: 'timed out',
  error: 'stopped with an error',
  cancelled: 'was cancelled',
  interrupted: 'was interrupted by a restart',
};

/** A Worker run starting (with how long it waited for a slot) and ending badly. */
export function runItems(ctx: HistoryCtx): void {
  const { facts } = ctx;
  for (const run of facts.runs) {
    const name = run.agent_id ?? run.harness;
    const wait = waitBeforeRun(facts, run);
    const model = run.model === undefined ? '' : ` on ${run.model}`;
    pushItem(ctx, RANK.start, {
      at: run.started_at,
      kind: 'run',
      actor: { type: 'worker', name },
      title: wait?.text ?? `${name} started working${model}`,
      ...(wait === undefined ? {} : { detail: `${name} started working${model}.` }),
      links: { run_id: run.id },
      ...(wait === undefined ? {} : { waited_ms: wait.waited_ms }),
    });

    const said = RUN_TROUBLE[run.status];
    if (run.ended_at !== undefined && said !== undefined) {
      const family =
        run.status === 'error' && run.error_family ? ` (${run.error_family})` : '';

      pushItem(ctx, RANK.end, {
        at: run.ended_at,
        kind: 'run',
        actor: { type: 'worker', name },
        title: `${name} ${said}${family}`,
        links: { run_id: run.id },
      });
    }
  }
}
