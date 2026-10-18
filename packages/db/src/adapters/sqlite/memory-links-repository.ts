/**
 * SQLite reads of memory links: what a record points at, what points at it and what shares its card or ticket.
 *
 * Why: related records are found by following edges the writer recorded (amends, reopens, cites, the card
 *   or ticket a decision came from), in both directions, so the memory screen and the Worker tool can
 *   show "amended by d-0012" as well as "amends d-0004". Records that share a card or a ticket are
 *   neighbours even without a direct edge. Nothing here writes; links are stored with their record.
 *
 * Exports: createMemoryLinksRepository().
 * Depends on: @forge/core, shared/db-errors, types/storage-driver.types.
 */

import { MemoryLinkRow } from '@forge/core';
import type { MemoryRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

const COLUMNS = 'from_id, rel, target_kind, target';

export function createMemoryLinksRepository(
  driver: SqlDriver,
): Pick<MemoryRepository, 'linksOf'> {
  const rows = (sql: string, params: string[]) =>
    driver.all(sql, params).map((r) => parseStored(MemoryLinkRow, r, 'memory link'));

  return {
    async linksOf(project, id) {
      const out = rows(
        `SELECT ${COLUMNS} FROM memory_links WHERE project = ? AND from_id = ?
          ORDER BY rel, target`,
        [project, id],
      );

      const incoming = rows(
        `SELECT ${COLUMNS} FROM memory_links
          WHERE project = ? AND target_kind = 'record' AND target = ? ORDER BY rel, from_id`,
        [project, id],
      );

      const shared = driver
        .all<{ from_id: string; rel: 'card' | 'ticket'; target: string }>(
          `SELECT DISTINCT l2.from_id AS from_id, l2.rel AS rel, l2.target AS target
             FROM memory_links l1
             JOIN memory_links l2
               ON l2.project = l1.project AND l2.rel = l1.rel AND l2.target = l1.target
              AND l2.from_id <> l1.from_id
            WHERE l1.project = ? AND l1.from_id = ? AND l1.rel IN ('card', 'ticket')
            ORDER BY l2.from_id`,
          [project, id],
        )
        .map((r) => ({ id: r.from_id, rel: r.rel, target: r.target }));

      return { out, in: incoming, shared };
    },
  };
}
