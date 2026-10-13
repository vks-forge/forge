/**
 * toTicketPatch — turns a transitioned ticket into the CAS patch that stores it.
 *
 * Why: `transition()` returns the whole next ticket, and the engine must persist exactly
 *   that with `updateTicketCas`. Two things go wrong if each caller hand-builds the
 *   patch: it forgets that a cleared optional field (`blocked_reason` after unblock,
 *   `tier_actual` after a failed gate) must reach the database as an explicit clear,
 *   so a stale column survives and a ticket later merges on an old gate pass; or it
 *   copies `status_version`, which storage owns. This function keeps the clears
 *   (present-but-undefined keys) and drops the immutable and storage-owned fields.
 *
 * Exports: toTicketPatch().
 * Depends on: schemas/ticket, types/ports/storage.types. No IO.
 */

import type { Ticket } from '#/schemas/ticket.js';
import type { TicketPatch } from '#/types/ports/storage.types.js';

/** The patch that stores `next`; optional fields `next` lacks are explicit clears, `status_version` is left to storage. */
export function toTicketPatch(next: Ticket): TicketPatch {
  const {
    id: _id,
    project: _project,
    created_at: _created,
    status_version: _v,
    ...rest
  } = next;
  void [_id, _project, _created, _v];
  return {
    ...rest,
    blocked_reason: rest.blocked_reason,
    tier_actual: rest.tier_actual,
    parent: rest.parent,
  };
}
