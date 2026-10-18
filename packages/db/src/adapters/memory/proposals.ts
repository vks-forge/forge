/**
 * In-memory pipeline proposal and finding mark repositories.
 *
 * Why: the engine's proposal scenarios run on this backend, so the guarantees of SQLite must hold here: a
 *   proposal key (project, lane, key, base list) is unique across every status so a decided change is never
 *   proposed again, a decision is a compare-and-swap on `pending`, a second mark on a finding replaces the
 *   first, and every value is parsed with the core schemas and read back as a copy. State lives in
 *   `MemoryState`, so a rolled-back transaction leaves no proposal behind.
 *
 * Exports: memoryPipelineProposals(), memoryFindingMarks().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { FindingMark, PipelineProposal } from '@forge/core';
import type { FindingMarkRepository, PipelineProposalRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryPipelineProposals(state: MemoryState): PipelineProposalRepository {
  return {
    async insert(proposal) {
      const taken = state.pipelineProposals.some(
        (p) =>
          p.project === proposal.project &&
          p.lane === proposal.lane &&
          p.key === proposal.key &&
          p.base_hash === proposal.base_hash,
      );

      if (taken) {
        return 'exists';
      }

      const stored = PipelineProposal.parse({
        ...proposal,
        status: 'pending',
        id: state.proposalSeq + 1,
      });

      state.proposalSeq = stored.id;
      state.pipelineProposals.push(structuredClone(stored));

      return stored.id;
    },

    async get(id) {
      const found = state.pipelineProposals.find((p) => p.id === id);

      return found ? structuredClone(found) : null;
    },

    async list(project, status) {
      return structuredClone(
        state.pipelineProposals
          .filter(
            (p) => p.project === project && (status === undefined || p.status === status),
          )
          .sort((a, b) => b.id - a.id),
      );
    },

    async decide(id, patch) {
      const at = state.pipelineProposals.findIndex((p) => p.id === id);
      const current = state.pipelineProposals[at];
      if (!current || current.status !== 'pending') {
        return false;
      }

      state.pipelineProposals[at] = PipelineProposal.parse({
        ...current,
        status: patch.status,
        decided_at: patch.at,
        ...(patch.reason === undefined ? {} : { decided_reason: patch.reason }),
        ...(patch.config_version === undefined
          ? {}
          : { config_version: patch.config_version }),
      });

      return true;
    },
  };
}

export function memoryFindingMarks(state: MemoryState): FindingMarkRepository {
  const strip = (m: FindingMark): FindingMark => ({
    stage_run_id: m.stage_run_id,
    finding_index: m.finding_index,
    verdict: m.verdict,
    marked_at: m.marked_at,
  });

  return {
    async set(mark) {
      const parsed = FindingMark.parse(mark);
      const rest = state.findingMarks.filter(
        (m) =>
          !(
            m.stage_run_id === parsed.stage_run_id &&
            m.finding_index === parsed.finding_index
          ),
      );

      state.findingMarks = [...rest, { ...parsed, ticket_id: mark.ticket_id }];
    },

    async clear(stageRunId, findingIndex) {
      const before = state.findingMarks.length;
      state.findingMarks = state.findingMarks.filter(
        (m) => !(m.stage_run_id === stageRunId && m.finding_index === findingIndex),
      );

      return state.findingMarks.length < before;
    },

    async listByStageRuns(stageRunIds) {
      const wanted = new Set<number>(stageRunIds);

      return state.findingMarks
        .filter((m) => wanted.has(m.stage_run_id))
        .sort(
          (a, b) => a.stage_run_id - b.stage_run_id || a.finding_index - b.finding_index,
        )
        .map(strip);
    },

    async listByTickets(ticketIds) {
      const wanted = new Set<string>(ticketIds);

      return state.findingMarks
        .filter((m) => wanted.has(m.ticket_id))
        .sort(
          (a, b) => a.stage_run_id - b.stage_run_id || a.finding_index - b.finding_index,
        )
        .map(strip);
    },
  };
}
