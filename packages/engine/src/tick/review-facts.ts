/**
 * Review facts: the diff stat and gated commit behind a ticket waiting for the owner's merge.
 *
 * Why: Approve and merge is irreversible, so the ticket page shows what is about to land: how many
 *   files, how many lines, and which commit the gates judged. They are read from the ticket's own
 *   worktree against its base (the diff the merge uses for the tier), never from the Worker's
 *   claims. A read that cannot be made (worktree gone, no host) is `null`, so the page shows the
 *   rest and the owner is not blocked by a missing number.
 *
 * Exports: reviewOf(), countPatchLines().
 * Depends on: @forge/core (TicketReview), domain/gate-rows, tick/{verify, tick-config, tick-report}. Read-only.
 */

import type { Ticket, TicketId, TicketReview } from '@forge/core';
import { gatedHeadOf, latestPerGate } from '#/domain/gate-rows.js';
import { iso } from '#/shared/time.js';
import { loadTickConfig } from '#/tick/tick-config.js';
import { emptyReport } from '#/tick/tick-report.js';
import { resolveTarget } from '#/tick/verify.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** Added and removed lines of a unified patch (file headers excluded). */
export function countPatchLines(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1;
    }
  }

  return { additions, deletions };
}

/** The review facts of `ticketId`, or null for a ticket that is not in review/sign-off or cannot be read. */
export async function reviewOf(
  deps: EngineDeps,
  state: EngineState,
  ticketId: string,
): Promise<TicketReview | null> {
  const ticket: Ticket | null = await deps.storage.transaction((tx) =>
    tx.tickets.get(ticketId as TicketId),
  );

  if (!ticket || (ticket.status !== 'review' && ticket.status !== 'needs_signoff')) {
    return null;
  }

  try {
    const now = deps.clock.now();
    const target = await resolveTarget(
      {
        deps,
        state,
        report: emptyReport(iso(now), false),
        config: await loadTickConfig(deps),
        now,
        nowIso: iso(now),
      },
      ticket,
    );

    if (!target) {
      return null;
    }

    const diff = await target.runtime.worktrees.diff(target.worktree, target.baseSha);
    const rows = await deps.storage.transaction((tx) =>
      tx.gateResults.listByTicket(ticket.id),
    );

    const head = gatedHeadOf(
      latestPerGate(rows.filter((r) => r.run_id === target.run.id)),
    );

    return {
      files: diff.files.map((f) => ({ status: f.status, path: f.path })),
      ...countPatchLines(diff.patch),
      ...(head === undefined ? {} : { head_sha: head }),
    };
  } catch (e) {
    deps.log?.('warn', `could not read the review facts of ${ticketId}`, {
      error: String(e),
    });

    return null;
  }
}
