/**
 * Ticket edit check results.
 *
 * Why: the PATCH route maps a refusal to a status and the card chat turns it into a plain
 *   note; both read the code, never the message text.
 *
 * Exports: TicketEditRefusalCode, TicketEditCheck, TicketEditFacts.
 * Depends on: schemas/ticket, schemas/ids, types/graph-cycle. Types only.
 */

import type { TicketId } from '#/schemas/ids.js';
import type { Ticket } from '#/schemas/ticket.js';
import type { GraphEdge } from '#/types/graph-cycle.types.js';

export type TicketEditRefusalCode =
  | 'ticket_closed'
  | 'description_locked'
  | 'dependency_on_started_ticket'
  | 'self_dependency'
  | 'dependency_not_found'
  | 'cross_project_dependency'
  | 'dependency_cancelled'
  | 'dependency_cycle';

/** Whether an edit may be applied; `ids` names the tickets involved (the loop for a cycle). */
export type TicketEditCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: TicketEditRefusalCode;
      readonly message: string;
      readonly ids: readonly string[];
    };

/** What the validator needs to know, read by the caller inside one transaction. */
export interface TicketEditFacts {
  readonly ticket: Ticket;
  /** The tickets named by the new `depends_on`, null or absent where the id is unknown. */
  readonly targets: ReadonlyMap<string, Ticket | null>;
  /** The ticket's current `depends_on` ids (edges that stay need no re-check). */
  readonly currentDependsOn: readonly string[];
  /** Waiting edges of the graph reachable from the targets, plus the ticket's other waits; its own `depends_on` edges are left out (they are being replaced). */
  readonly edges: readonly GraphEdge<TicketId>[];
}
