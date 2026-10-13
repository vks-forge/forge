/**
 * Derives `Ticket.parent` and `Ticket.blocked_by` from relation edges.
 *
 * Why: `ticket_relations` is the only place parent and blocker links are stored; the
 *   ticket fields are views over it. Both storage backends must produce the same view from
 *   the same edges, or the engine would see a ticket as blocked on one backend and free on
 *   the other. The rule lives here once: a ticket's parent is the first `spawned_from` edge
 *   out of it; its blockers are its `depends_on` targets plus the sources of `blocks` edges
 *   into it, in edge order, each once (director-core.md §3).
 *
 * Exports: deriveTicketRelations().
 * Depends on: @forge/core (types). No IO.
 */

import type { TicketId, TicketRelation } from '@forge/core';

/**
 * Parent and blockers of `id` from `edges` given in edge (insertion) order. `parent` is
 * `undefined` when the ticket has none, so callers can leave the key out.
 */
export function deriveTicketRelations(
  id: TicketId,
  edges: Iterable<Pick<TicketRelation, 'from_id' | 'to_id' | 'kind'>>,
): { parent: TicketId | undefined; blocked_by: TicketId[] } {
  let parent: TicketId | undefined;
  const blockers = new Set<TicketId>();
  for (const e of edges) {
    if (e.from_id === id && e.kind === 'spawned_from') {
      parent ??= e.to_id;
    } else if (e.from_id === id && e.kind === 'depends_on') {
      blockers.add(e.to_id);
    } else if (e.to_id === id && e.kind === 'blocks') {
      blockers.add(e.from_id);
    }
  }

  return { parent, blocked_by: [...blockers] };
}
