/**
 * SQLite StageArtifactRepository for the `stage_artifacts` table.
 *
 * Why: the owner must be able to see exactly what a reviewer was shown (the diff, the claims, the
 *   plan) and what a stage produced, long after the run. Each artifact is stored whole (capped by
 *   the caller, with `truncated` saying so) with its SHA-256, tied to the stage attempt that used
 *   it. Lists return metadata only, so the ticket page's strip stays small and a diff of
 *   hundreds of kilobytes is fetched only when someone opens it, one artifact by id and always
 *   scoped to its ticket, so one ticket's id can never read another's.
 *
 * Exports: createStageArtifactRepository().
 * Depends on: @forge/core, shared/db-errors, types/storage-driver.types.
 */

import { StageArtifact, UnknownForgeError } from '@forge/core';
import type { StageArtifactRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toArtifact = (row: SqlRow): StageArtifact =>
  parseStored(
    StageArtifact,
    { ...row, truncated: row['truncated'] === 1 },
    'stage artifact',
  );

const META_COLUMNS = 'id, ticket_id, stage_run_id, kind, truncated, sha256, created_at';

export function createStageArtifactRepository(
  driver: SqlDriver,
): StageArtifactRepository {
  return {
    async add(artifact) {
      const a = StageArtifact.omit({ id: true }).parse(artifact);
      driver.run(
        `INSERT INTO stage_artifacts (ticket_id, stage_run_id, kind, content, truncated, sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          a.ticket_id,
          a.stage_run_id,
          a.kind,
          a.content,
          a.truncated ? 1 : 0,
          a.sha256,
          a.created_at,
        ],
      );

      const row = driver.get(
        'SELECT * FROM stage_artifacts WHERE id = last_insert_rowid()',
      );

      if (!row) {
        throw new UnknownForgeError('stage artifact vanished after insert');
      }

      return toArtifact(row);
    },

    async listByTicket(ticketId) {
      return driver
        .all(
          `SELECT ${META_COLUMNS} FROM stage_artifacts WHERE ticket_id = ? ORDER BY id`,
          [ticketId],
        )
        .map((row) =>
          parseStored(
            StageArtifact.omit({ content: true }),
            { ...row, truncated: row['truncated'] === 1 },
            'stage artifact',
          ),
        );
    },

    async get(ticketId, id) {
      const row = driver.get(
        'SELECT * FROM stage_artifacts WHERE ticket_id = ? AND id = ?',
        [ticketId, id],
      );

      return row ? toArtifact(row) : null;
    },
  };
}
