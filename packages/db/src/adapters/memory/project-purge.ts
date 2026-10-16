/**
 * In-memory purge of everything a project owns.
 *
 * Why: engine and server tests run on this backend, so deleting a project must clear the
 *   same rows the SQLite purge clears (tickets, relations, intake, wakes, runs and their
 *   events, inbox, tokens, gates and interactions, cards and their history, inbox marks),
 *   or a test that re-adds a deleted project would pass here and fail in production. Tool
 *   receipts live in the receipt log, not in this state, so they are outside this purge.
 *
 * Exports: purgeProjectState().
 * Depends on: types/memory-state.types. No IO.
 */

import type { MemoryState } from '#/types/memory-state.types.js';

/** Remove the project's rows from every map; false when the project row did not exist. */
export function purgeProjectState(state: MemoryState, slug: string): boolean {
  const ticketIds = new Set<string>(
    [...state.tickets.values()].filter((t) => t.project === slug).map((t) => t.id),
  );

  const runIds = new Set(
    [...state.runs.values()]
      .filter((r) => r.project === slug || ticketIds.has(r.ticket_id))
      .map((r) => r.id),
  );

  const cardIds = new Set(
    [...state.cards.values()].filter((c) => c.project === slug).map((c) => c.id),
  );

  for (const id of runIds) {
    state.runs.delete(id);
    state.events.delete(id);
    state.inbox.delete(id);
    state.tokens.delete(id);
  }

  state.gates = state.gates.filter((g) => !runIds.has(g.run_id));

  for (const [id, i] of state.interactions) {
    if (ticketIds.has(i.ticket_id) || (i.run_id && runIds.has(i.run_id))) {
      state.interactions.delete(id);
    }
  }

  for (const [id, w] of state.wakes) {
    if (ticketIds.has(w.ticket_id)) {
      state.wakes.delete(id);
    }
  }

  state.relations = state.relations.filter(
    (r) => !ticketIds.has(r.from_id) && !ticketIds.has(r.to_id),
  );

  for (const [key, e] of state.intake) {
    if (e.project === slug) {
      state.intake.delete(key);
    }
  }

  for (const id of ticketIds) {
    state.tickets.delete(id);
  }

  for (const id of cardIds) {
    state.cards.delete(id);
    state.cardEvents.delete(id);
  }

  for (const [key, row] of state.inboxStates) {
    if (row.project === slug) {
      state.inboxStates.delete(key);
    }
  }

  const row = [...state.projects.values()].find((p) => p.slug === slug);

  return row ? state.projects.delete(row.id) : false;
}
