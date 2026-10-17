/**
 * In-memory ticket and ticket-relation repositories.
 *
 * Why: the engine's tests run on this backend, so a ticket's parent and blockers must come
 *   from the relation list here exactly as they come from `ticket_relations` in SQLite:
 *   derived on every read, never stored on the ticket, never patchable. A blocker edge
 *   added in one call must be visible on the next read of the ticket, and `insert`
 *   must record a seeded `parent` / `blocked_by` as edges, or tests that seed tickets this
 *   way would pass here and fail in production (director-core.md §3).
 *
 * Exports: memoryTickets(), memoryTicketRelations().
 * Depends on: @forge/core, adapters/memory/rows, shared/patches, shared/relations,
 *   types/memory-state.types. No IO.
 */

import { Ticket, TicketRelation } from '@forge/core';
import type {
  TicketMatch,
  TicketRelationRepository,
  TicketRepository,
} from '@forge/core';
import { insertUnique, withoutUndefined } from '#/adapters/memory/rows.js';
import { parseTicketPatch } from '#/shared/patches.js';
import { deriveTicketRelations } from '#/shared/relations.js';
import type { MemoryState } from '#/types/memory-state.types.js';

const sameEdge = (a: TicketRelation, b: TicketRelation): boolean =>
  a.from_id === b.from_id && a.to_id === b.to_id && a.kind === b.kind;

/** The same narrowing the SQLite `WHERE` does: project, statuses, lane, card and a literal substring of id or title. */
function matches(t: Ticket, project: string, m: TicketMatch): boolean {
  const statuses = m.statuses ?? [];
  const needle = m.search?.toLowerCase();

  return (
    t.project === project &&
    (statuses.length === 0 || statuses.includes(t.status)) &&
    (m.lane === undefined || t.lane === m.lane) &&
    (m.card_id === undefined || t.card_id === m.card_id) &&
    (needle === undefined ||
      t.id.toLowerCase().includes(needle) ||
      t.title.toLowerCase().includes(needle))
  );
}

export function memoryTickets(state: MemoryState): TicketRepository {
  const view = (t: Ticket): Ticket => {
    const { parent, blocked_by } = deriveTicketRelations(t.id, state.relations);

    return structuredClone({
      ...t,
      ...(parent === undefined ? {} : { parent }),
      blocked_by,
    });
  };

  return {
    async get(id) {
      const t = state.tickets.get(id);

      return t ? view(t) : null;
    },
    async listByStatus(status) {
      return [...state.tickets.values()].filter((t) => t.status === status).map(view);
    },
    async listByCard(cardId) {
      return [...state.tickets.values()].filter((t) => t.card_id === cardId).map(view);
    },
    async listByProject(project, filter) {
      const { after } = filter;
      const sort = filter.sort ?? 'updated';
      const spent = new Map<string, number>();
      if (sort === 'cost') {
        for (const r of state.runs.values()) {
          spent.set(r.ticket_id, (spent.get(r.ticket_id) ?? 0) + (r.cost_usd ?? 0));
        }
      }

      const key = (t: Ticket): string =>
        sort === 'created' ? t.created_at : t.updated_at;

      const byIdDesc = (a: Ticket, b: Ticket): number =>
        Number(b.id > a.id) - Number(b.id < a.id);

      return [...state.tickets.values()]
        .filter((t) => matches(t, project, filter))
        .filter(
          (t) =>
            !after ||
            t.updated_at < after.updated_at ||
            (t.updated_at === after.updated_at && t.id < after.id),
        )
        .sort((a, b) => {
          if (sort === 'cost') {
            return (spent.get(b.id) ?? 0) - (spent.get(a.id) ?? 0) || byIdDesc(a, b);
          }

          return key(a) === key(b)
            ? byIdDesc(a, b)
            : Number(key(b) > key(a)) - Number(key(b) < key(a));
        })
        .slice(filter.offset ?? 0, (filter.offset ?? 0) + filter.limit)
        .map(view);
    },
    async countByProject(project, match) {
      return [...state.tickets.values()].filter((t) => matches(t, project, match)).length;
    },
    async insert(ticket) {
      const t = Ticket.parse(ticket);
      const edges = [
        ...(t.parent === undefined
          ? []
          : [{ from_id: t.id, to_id: t.parent, kind: 'spawned_from' as const }]),
        ...t.blocked_by.map((b) => ({
          from_id: t.id,
          to_id: b,
          kind: 'depends_on' as const,
        })),
      ].map((e) => TicketRelation.parse({ ...e, created_at: t.created_at }));

      const { parent: _parent, ...stored } = t;
      void _parent;
      insertUnique(state.tickets, t.id, { ...stored, blocked_by: [] }, 'ticket');
      for (const e of edges) {
        if (!state.relations.some((r) => sameEdge(r, e))) {
          state.relations.push(e);
        }
      }
    },
    async updateTicketCas(id, expectedVersion, patch) {
      const current = state.tickets.get(id);
      if (!current || current.status_version !== expectedVersion) {
        return false;
      }

      const next = withoutUndefined(
        Ticket.parse({ ...current, ...parseTicketPatch(expectedVersion, patch) }),
      );

      state.tickets.set(id, next);

      return true;
    },
  };
}

export function memoryTicketRelations(state: MemoryState): TicketRelationRepository {
  return {
    async add(relation) {
      const r = TicketRelation.parse(relation);
      if (state.relations.some((e) => sameEdge(e, r))) {
        return false;
      }

      state.relations.push(r);

      return true;
    },
    async remove(fromId, toId, kind) {
      const i = state.relations.findIndex((e) =>
        sameEdge(e, { from_id: fromId, to_id: toId, kind }),
      );

      if (i < 0) {
        return false;
      }

      state.relations.splice(i, 1);

      return true;
    },
    async listFor(ticketId) {
      return state.relations
        .filter((e) => e.from_id === ticketId || e.to_id === ticketId)
        .map((e) => structuredClone(e));
    },
  };
}
