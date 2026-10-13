/**
 * toTicketPatch — turns a transitioned ticket into the CAS patch that stores it.
 *
 * Why: `transition()` returns the whole next ticket, and the engine must persist exactly
 *   that with `updateTicketCas`. Three things go wrong if each caller hand-builds the
 *   patch: it forgets that a cleared optional field (`blocked_reason` after unblock,
 *   `tier_actual` after a failed gate, an `assignee_run_id` after the run ends) must
 *   reach the database as an explicit clear, so a stale column survives and a ticket later
 *   merges on an old gate pass; it copies `status_version`, which storage owns; or it
 *   copies `parent` / `blocked_by`, which are derived from `ticket_relations` and must
 *   only change through the relation repository. This function keeps the clears
 *   (present-but-undefined keys) and drops the immutable, storage-owned and derived fields.
 *
 * Exports: toTicketPatch().
 * Depends on: schemas/ticket, types/ports/storage.types. No IO.
 */

import type { Ticket } from '#/schemas/ticket.js';
import type { TicketPatch } from '#/types/ports/storage.types.js';

/** The patch that stores `next`; optional fields `next` lacks are explicit clears; `status_version` is left to storage and `parent` / `blocked_by` to the relation repository. */
export function toTicketPatch(next: Ticket): TicketPatch {
  const {
    id: _id,
    project: _project,
    created_at: _created,
    status_version: _v,
    parent: _parent,
    blocked_by: _blockedBy,
    ...rest
  } = next;

  void [_id, _project, _created, _v, _parent, _blockedBy];

  return {
    ...rest,
    blocked_reason: rest.blocked_reason,
    parked_from: rest.parked_from,
    tier_actual: rest.tier_actual,
    assignee_run_id: rest.assignee_run_id,
    branch: rest.branch,
    worktree: rest.worktree,
    checkout_run_id: rest.checkout_run_id,
    epic_id: rest.epic_id,
    created_by_intake: rest.created_by_intake,
    pr_number: rest.pr_number,
    pr_url: rest.pr_url,
  };
}
