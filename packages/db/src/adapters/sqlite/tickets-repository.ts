/**
 * SQLite TicketRepository with single-statement compare-and-swap.
 *
 * Why: ticket status is the one thing two actors can race on (a Director tick and an API
 *   call, or a gate result and a cancel). `updateTicketCas` is a single `UPDATE ...
 *   WHERE id=? AND status_version=?` and success is `changes === 1`, so the stale writer
 *   loses atomically; a read-then-write would let both succeed and the ticket could be
 *   double-dispatched or moved twice. `parent` and `blocked_by` are not columns: they are
 *   derived on every read from `ticket_relations`, the single source of truth, so a
 *   blocker edge added by one writer is seen by the next read of the ticket. Rows are
 *   re-parsed with the core `Ticket` schema on read (director-core.md §3).
 *
 * Exports: createTicketRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, shared/patches, shared/relations,
 *   types/storage-driver.types.
 */

import { Ticket, TicketRelation } from '@forge/core';
import type {
  CardId,
  TicketId,
  TicketListFilter,
  TicketMatch,
  TicketPatch,
  TicketRepository,
  TicketStatus,
} from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import { buildSetClause, parseTicketPatch } from '#/shared/patches.js';
import { deriveTicketRelations } from '#/shared/relations.js';
import type { ColumnCodec, SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const COLUMNS: Readonly<Record<string, ColumnCodec>> = {
  title: { column: 'title' },
  body: { column: 'body' },
  type: { column: 'type' },
  lane: { column: 'lane' },
  tier_predicted: { column: 'tier_predicted' },
  tier_actual: { column: 'tier_actual', clearable: true },
  status: { column: 'status' },
  status_version: { column: 'status_version' },
  rework_count: { column: 'rework_count' },
  priority: { column: 'priority' },
  blocked_reason: { column: 'blocked_reason', clearable: true },
  parked_from: { column: 'parked_from', clearable: true },
  assignee_run_id: { column: 'assignee_run_id', clearable: true },
  branch: { column: 'branch', clearable: true },
  worktree: { column: 'worktree', clearable: true },
  checkout_run_id: { column: 'checkout_run_id', clearable: true },
  epic_id: { column: 'epic_id', clearable: true },
  created_by_intake: { column: 'created_by_intake', clearable: true },
  pr_number: { column: 'pr_number', clearable: true },
  pr_url: { column: 'pr_url', clearable: true },
  updated_at: { column: 'updated_at' },
};

// The edges that feed Ticket.parent / blocked_by, in edge order (see shared/relations.ts).
const EDGES_SQL = `SELECT from_id, to_id, kind FROM ticket_relations
  WHERE (from_id = ? AND kind IN ('spawned_from', 'depends_on')) OR (to_id = ? AND kind = 'blocks')
  ORDER BY rowid`;

const ORDER_BY = {
  updated: 't.updated_at DESC, t.id DESC',
  created: 't.created_at DESC, t.id DESC',
  cost: 'COALESCE(r.spent, 0) DESC, t.id DESC',
} as const;

/** `%`, `_` and the escape character itself are literal in a user's search text. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The WHERE terms shared by the list and the count; columns are qualified with the `t` alias. */
function matchClause(
  project: string,
  match: TicketMatch,
): { where: string[]; params: (string | number)[] } {
  const where = ['t.project = ?'];
  const params: (string | number)[] = [project];
  const statuses = match.statuses ?? [];
  if (statuses.length > 0) {
    where.push(`t.status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }

  if (match.lane !== undefined) {
    where.push('t.lane = ?');
    params.push(match.lane);
  }

  if (match.card_id !== undefined) {
    where.push('t.card_id = ?');
    params.push(match.card_id);
  }

  if (match.search !== undefined) {
    where.push("(t.id LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\')");
    params.push(likePattern(match.search), likePattern(match.search));
  }

  return { where, params };
}

export function createTicketRepository(driver: SqlDriver): TicketRepository {
  function toTicket(row: SqlRow): Ticket {
    const id = String(row['id']) as TicketId;
    const edges = driver.all<{
      from_id: TicketId;
      to_id: TicketId;
      kind: TicketRelation['kind'];
    }>(EDGES_SQL, [id, id]);

    const { parent, blocked_by } = deriveTicketRelations(id, edges);

    return parseStored(
      Ticket,
      { ...dropNulls(row), ...(parent === undefined ? {} : { parent }), blocked_by },
      'ticket',
    );
  }

  return {
    async get(id: TicketId) {
      const row = driver.get('SELECT * FROM tickets WHERE id = ?', [id]);

      return row ? toTicket(row) : null;
    },

    async listByStatus(status: TicketStatus) {
      return driver
        .all('SELECT * FROM tickets WHERE status = ? ORDER BY rowid', [status])
        .map(toTicket);
    },

    async listByCard(cardId: CardId) {
      return driver
        .all('SELECT * FROM tickets WHERE card_id = ? ORDER BY rowid', [cardId])
        .map(toTicket);
    },

    async listByProject(project: string, filter: TicketListFilter) {
      const { where, params } = matchClause(project, filter);
      if (filter.after) {
        where.push('(t.updated_at < ? OR (t.updated_at = ? AND t.id < ?))');
        params.push(filter.after.updated_at, filter.after.updated_at, filter.after.id);
      }

      const sort = filter.sort ?? 'updated';
      // Cost sorts over one grouped sum of the runs; the other orders need no join.
      const join =
        sort === 'cost'
          ? `LEFT JOIN (SELECT ticket_id, SUM(cost_usd) AS spent FROM runs GROUP BY ticket_id) r
               ON r.ticket_id = t.id`
          : '';

      return driver
        .all(
          `SELECT t.* FROM tickets t ${join} WHERE ${where.join(' AND ')}
           ORDER BY ${ORDER_BY[sort]} LIMIT ? OFFSET ?`,
          [...params, filter.limit, filter.offset ?? 0],
        )
        .map(toTicket);
    },

    async countByProject(project: string, match: TicketMatch) {
      const { where, params } = matchClause(project, match);
      const row = driver.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM tickets t WHERE ${where.join(' AND ')}`,
        params,
      );

      return row?.n ?? 0;
    },

    async insert(ticket: Ticket) {
      const t = Ticket.parse(ticket);
      // Validate the seeded relations before writing anything, so a bad edge leaves no row.
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

      driver.run(
        `INSERT INTO tickets (id, project, epic_id, card_id, title, body, type, lane, tier_predicted,
           tier_actual, status, status_version, rework_count, priority, blocked_reason, assignee_run_id,
           branch, worktree, checkout_run_id, created_by_intake, pr_number, pr_url, parked_from,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          t.project,
          t.epic_id ?? null,
          t.card_id ?? null,
          t.title,
          t.body,
          t.type,
          t.lane,
          t.tier_predicted,
          t.tier_actual ?? null,
          t.status,
          t.status_version,
          t.rework_count,
          t.priority,
          t.blocked_reason ?? null,
          t.assignee_run_id ?? null,
          t.branch ?? null,
          t.worktree ?? null,
          t.checkout_run_id ?? null,
          t.created_by_intake ?? null,
          t.pr_number ?? null,
          t.pr_url ?? null,
          t.parked_from ?? null,
          t.created_at,
          t.updated_at,
        ],
      );

      for (const e of edges) {
        driver.run(
          `INSERT OR IGNORE INTO ticket_relations (from_id, to_id, kind, created_at)
           VALUES (?, ?, ?, ?)`,
          [e.from_id, e.to_id, e.kind, e.created_at ?? null],
        );
      }
    },

    async updateTicketCas(id: TicketId, expectedVersion: number, patch: TicketPatch) {
      const { sql, params } = buildSetClause(
        COLUMNS,
        parseTicketPatch(expectedVersion, patch),
      );

      const res = driver.run(
        `UPDATE tickets SET ${sql} WHERE id = ? AND status_version = ?`,
        [...params, id, expectedVersion],
      );

      return res.changes === 1;
    },
  };
}
