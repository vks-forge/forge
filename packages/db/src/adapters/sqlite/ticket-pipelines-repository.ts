/**
 * SQLite TicketPipelineRepository for the `ticket_pipelines` table.
 *
 * Why: a ticket runs on the copy of its lane pipeline it took at its first dispatch, so a later
 *   settings edit can never change a started ticket (d-0151). The copy is one row per ticket: the
 *   stage list with the role of each agent at that moment, its hash, the settings version it came
 *   from and the stages routing rules added. The first snapshot stands (a second insert is
 *   refused, not overwritten); only routing, or a heavier lane re-snapshotting at a stage
 *   boundary, rewrites it. Every value is parsed with the core schema on the way in and out, so a
 *   copy this version cannot read fails closed instead of running a ticket on a half-typed list.
 *
 * Exports: createTicketPipelineRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { RoutedStage, TicketPipeline, UnknownForgeError } from '@forge/core';
import type { TicketPipelineRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toSnapshot = (row: SqlRow): TicketPipeline => {
  const stored = fromJson(row['pipeline_json']) as {
    definition?: unknown;
    roles?: unknown;
  } | null;

  return parseStored(
    TicketPipeline,
    {
      ticket_id: row['ticket_id'],
      lane: row['lane'],
      definition: stored?.definition,
      roles: stored?.roles,
      hash: row['pipeline_hash'],
      config_version: row['config_version'],
      routed: parseStored(
        RoutedStage.array(),
        fromJson(row['routed_json']),
        'routed stages',
      ),
      created_at: row['created_at'],
      updated_at: row['updated_at'],
    },
    'ticket pipeline',
  );
};

const encode = (s: TicketPipeline): string =>
  toJson({ definition: s.definition, roles: s.roles });

export function createTicketPipelineRepository(
  driver: SqlDriver,
): TicketPipelineRepository {
  const read = (ticketId: string): TicketPipeline | null => {
    const row = driver.get('SELECT * FROM ticket_pipelines WHERE ticket_id = ?', [
      ticketId,
    ]);

    return row ? toSnapshot(row) : null;
  };

  return {
    async get(ticketId) {
      return read(ticketId);
    },

    async insert(snapshot) {
      const s = TicketPipeline.parse(snapshot);
      const { changes } = driver.run(
        `INSERT OR IGNORE INTO ticket_pipelines
           (ticket_id, lane, pipeline_json, pipeline_hash, config_version, routed_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.ticket_id,
          s.lane,
          encode(s),
          s.hash,
          s.config_version,
          toJson(s.routed),
          s.created_at,
          s.updated_at,
        ],
      );

      return changes > 0;
    },

    async appendRouted(ticketId, update) {
      const current = read(ticketId);
      if (!current) {
        throw new UnknownForgeError(`ticket ${ticketId} has no pipeline snapshot`);
      }

      const next = TicketPipeline.parse({
        ...current,
        definition: update.definition,
        hash: update.hash,
        routed: update.routed,
        updated_at: update.at,
      });

      driver.run(
        `UPDATE ticket_pipelines
            SET pipeline_json = ?, pipeline_hash = ?, routed_json = ?, updated_at = ?
          WHERE ticket_id = ?`,
        [encode(next), next.hash, toJson(next.routed), next.updated_at, ticketId],
      );
    },

    async replace(snapshot) {
      const s = TicketPipeline.parse(snapshot);
      const { changes } = driver.run(
        `UPDATE ticket_pipelines
            SET lane = ?, pipeline_json = ?, pipeline_hash = ?, config_version = ?,
                routed_json = ?, updated_at = ?
          WHERE ticket_id = ?`,
        [
          s.lane,
          encode(s),
          s.hash,
          s.config_version,
          toJson(s.routed),
          s.updated_at,
          s.ticket_id,
        ],
      );

      if (changes === 0) {
        throw new UnknownForgeError(`ticket ${s.ticket_id} has no pipeline snapshot`);
      }
    },
  };
}
