/**
 * SQLite repositories for pipeline proposals and the owner's finding marks.
 *
 * Why: a proposal to change a project's lane is a row of its own, and its unique key
 *   (project, lane, key, base list) covers every status, so a change the owner accepted or rejected is never
 *   proposed again for the same base list; `insert` reports `'exists'` instead of a second row, which is also
 *   what makes a repeated snapshot or a restart propose nothing twice. A decision is a compare-and-swap on
 *   `pending`, so an accept and a reject racing cannot both win. The owner's mark on a finding is one row per
 *   (stage row, finding index); a second mark replaces the first. Every value is parsed with the core schema
 *   both ways, so a row this version cannot read fails closed.
 *
 * Exports: createPipelineProposalRepository(), createFindingMarkRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import {
  ProposalEvidenceList,
  FindingMark,
  PipelineAdjustOp,
  PipelineDefinition,
  PipelineProposal,
  UnknownForgeError,
} from '@forge/core';
import type { FindingMarkRepository, PipelineProposalRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const MAX_BATCH = 500;

const toProposal = (row: SqlRow): PipelineProposal => {
  const { op_json: op, proposed_json: proposed, evidence_json: evidence, ...rest } = row;

  return parseStored(
    PipelineProposal,
    {
      ...dropNulls(rest),
      op: parseStored(PipelineAdjustOp, fromJson(op), 'proposal op'),
      proposed: parseStored(PipelineDefinition, fromJson(proposed), 'proposed pipeline'),
      evidence: parseStored(
        ProposalEvidenceList,
        fromJson(evidence),
        'proposal evidence',
      ),
    },
    'pipeline proposal',
  );
};

const toMark = (row: SqlRow): FindingMark =>
  parseStored(
    FindingMark,
    {
      stage_run_id: row['stage_run_id'],
      finding_index: row['finding_index'],
      verdict: row['verdict'],
      marked_at: row['marked_at'],
    },
    'finding mark',
  );

export function createPipelineProposalRepository(
  driver: SqlDriver,
): PipelineProposalRepository {
  return {
    async insert(proposal) {
      // INSERT OR IGNORE would also swallow a CHECK failure and read as `exists`, so the row is validated first.
      const p = PipelineProposal.omit({
        id: true,
        status: true,
        decided_at: true,
        decided_reason: true,
        config_version: true,
      }).parse(proposal);

      const { changes } = driver.run(
        `INSERT OR IGNORE INTO pipeline_proposals
           (project, lane, key, base_hash, op_json, proposed_json, evidence_json, count, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          p.project,
          p.lane,
          p.key,
          p.base_hash,
          toJson(p.op),
          toJson(p.proposed),
          toJson(p.evidence),
          p.count,
          p.created_at,
        ],
      );

      if (changes === 0) {
        return 'exists';
      }

      const id = driver.get<{ id: number }>('SELECT last_insert_rowid() AS id')?.id;
      if (id === undefined) {
        throw new UnknownForgeError('pipeline proposal vanished after insert');
      }

      return id;
    },

    async get(id) {
      const row = driver.get('SELECT * FROM pipeline_proposals WHERE id = ?', [id]);

      return row ? toProposal(row) : null;
    },

    async list(project, status) {
      return driver
        .all(
          `SELECT * FROM pipeline_proposals WHERE project = ?${status === undefined ? '' : ' AND status = ?'}
            ORDER BY id DESC`,
          status === undefined ? [project] : [project, status],
        )
        .map(toProposal);
    },

    async decide(id, patch) {
      const { changes } = driver.run(
        `UPDATE pipeline_proposals
            SET status = ?, decided_at = ?, decided_reason = ?, config_version = ?
          WHERE id = ? AND status = 'pending'`,
        [patch.status, patch.at, patch.reason ?? null, patch.config_version ?? null, id],
      );

      return changes > 0;
    },
  };
}

export function createFindingMarkRepository(driver: SqlDriver): FindingMarkRepository {
  return {
    async set(mark) {
      const m = FindingMark.parse(mark);
      driver.run(
        `INSERT INTO finding_marks (stage_run_id, finding_index, ticket_id, verdict, marked_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (stage_run_id, finding_index)
         DO UPDATE SET verdict = excluded.verdict, marked_at = excluded.marked_at`,
        [m.stage_run_id, m.finding_index, mark.ticket_id, m.verdict, m.marked_at],
      );
    },

    async clear(stageRunId, findingIndex) {
      return (
        driver.run(
          'DELETE FROM finding_marks WHERE stage_run_id = ? AND finding_index = ?',
          [stageRunId, findingIndex],
        ).changes > 0
      );
    },

    async listByStageRuns(stageRunIds) {
      if (stageRunIds.length === 0) {
        return [];
      }

      if (stageRunIds.length > MAX_BATCH) {
        throw new UnknownForgeError(`at most ${MAX_BATCH} stage rows per read`);
      }

      return driver
        .all(
          `SELECT * FROM finding_marks WHERE stage_run_id IN (${stageRunIds.map(() => '?').join(', ')})
            ORDER BY stage_run_id, finding_index`,
          [...stageRunIds],
        )
        .map(toMark);
    },

    async listByTickets(ticketIds) {
      if (ticketIds.length === 0) {
        return [];
      }

      if (ticketIds.length > MAX_BATCH) {
        throw new UnknownForgeError(`at most ${MAX_BATCH} tickets per read`);
      }

      return driver
        .all(
          `SELECT * FROM finding_marks WHERE ticket_id IN (${ticketIds.map(() => '?').join(', ')})
            ORDER BY stage_run_id, finding_index`,
          [...ticketIds],
        )
        .map(toMark);
    },
  };
}
