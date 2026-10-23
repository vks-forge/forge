/**
 * TicketPatch: the fields a compare-and-swap ticket update may change.
 *
 * Why: the Director tick and the API both move tickets through one compare-and-swap, and storage
 *   owns the columns a caller must never write: identity and creation time are immutable,
 *   `status_version` is the swap key, and `parent` / `blocked_by` are derived from
 *   `ticket_relations`, so a patch naming them would silently disagree with the edges. Naming the
 *   allowed shape once lets the type checker refuse such a patch in every caller and adapter.
 *
 * Exports: TicketPatch.
 * Depends on: schemas/ticket. Types only.
 */

import type { Ticket } from '#/schemas/ticket.js';

/**
 * Fields a CAS update may change; identity and creation time are immutable,
 * `status_version` belongs to storage, and `parent` / `blocked_by` are derived from
 * `ticket_relations` (change them through `TicketRelationRepository`).
 */
export type TicketPatch = Partial<
  Omit<
    Ticket,
    | 'id'
    | 'project'
    | 'card_id'
    | 'created_at'
    | 'status_version'
    | 'parent'
    | 'blocked_by'
  >
>;
