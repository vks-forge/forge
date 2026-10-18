/**
 * In-memory ticket pipeline, stage run and stage artifact repositories.
 *
 * Why: the engine's pipeline scenarios run on this backend, so the stage runner's guarantees must
 *   hold here as in SQLite: the first pipeline snapshot of a ticket stands, a stage attempt is
 *   unique per (ticket, stage, member, cycle) so a second start reports `'exists'`, attempts are
 *   found by the run that carries them and listed oldest first, artifacts list without content and
 *   are read one at a time scoped to their ticket, every value is parsed with the core schemas
 *   and every read is a copy. State lives in `MemoryState`, so a rolled-back transaction leaves no
 *   stage row behind.
 *
 * Exports: memoryTicketPipelines(), memoryStageRuns(), memoryStageArtifacts().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import {
  StageArtifact,
  StageOutcome,
  StageRun,
  TicketPipeline,
  UnknownForgeError,
} from '@forge/core';

/** The artifact without its content; zod drops the key, which is what lists return. */
const StageArtifactMetaSchema = StageArtifact.omit({ content: true });
import type {
  StageArtifactRepository,
  StageRunRepository,
  TicketPipelineRepository,
} from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryTicketPipelines(state: MemoryState): TicketPipelineRepository {
  const need = (ticketId: string): TicketPipeline => {
    const found = state.ticketPipelines.get(ticketId);
    if (!found) {
      throw new UnknownForgeError(`ticket ${ticketId} has no pipeline snapshot`);
    }

    return found;
  };

  return {
    async get(ticketId) {
      const found = state.ticketPipelines.get(ticketId);

      return found ? structuredClone(found) : null;
    },

    async insert(snapshot) {
      const s = TicketPipeline.parse(snapshot);
      if (state.ticketPipelines.has(s.ticket_id)) {
        return false;
      }

      state.ticketPipelines.set(s.ticket_id, structuredClone(s));

      return true;
    },

    async appendRouted(ticketId, update) {
      const next = TicketPipeline.parse({
        ...need(ticketId),
        definition: update.definition,
        hash: update.hash,
        routed: update.routed,
        updated_at: update.at,
      });

      state.ticketPipelines.set(ticketId, structuredClone(next));
    },

    async replace(snapshot) {
      const s = TicketPipeline.parse(snapshot);
      need(s.ticket_id);
      state.ticketPipelines.set(s.ticket_id, structuredClone(s));
    },

    async adjust(ticketId, update) {
      const next = TicketPipeline.parse({
        ...need(ticketId),
        definition: update.definition,
        hash: update.hash,
        ...(update.roles === undefined ? {} : { roles: update.roles }),
        adjustments: update.adjustments,
        updated_at: update.at,
      });

      state.ticketPipelines.set(ticketId, structuredClone(next));
    },

    async listByTickets(ticketIds) {
      const wanted = new Set<string>(ticketIds);

      return [...state.ticketPipelines.values()]
        .filter((p) => wanted.has(p.ticket_id))
        .map((p) => structuredClone(p));
    },
  };
}

export function memoryStageRuns(state: MemoryState): StageRunRepository {
  return {
    async start(row) {
      const taken = state.stageRuns.some(
        (r) =>
          r.ticket_id === row.ticket_id &&
          r.stage_id === row.stage_id &&
          r.member_id === row.member_id &&
          r.cycle === row.cycle,
      );

      if (taken) {
        return 'exists';
      }

      const stored = StageRun.parse({
        ...row,
        outcome: StageOutcome.parse(row.outcome ?? {}),
        id: state.stageRunSeq + 1,
      });

      state.stageRunSeq = stored.id;
      state.stageRuns.push(structuredClone(stored));

      return stored.id;
    },

    async find(ticketId, stageId, memberId, cycle) {
      const found = state.stageRuns.find(
        (r) =>
          r.ticket_id === ticketId &&
          r.stage_id === stageId &&
          r.member_id === memberId &&
          r.cycle === cycle,
      );

      return found ? structuredClone(found) : null;
    },

    async get(id) {
      const found = state.stageRuns.find((r) => r.id === id);

      return found ? structuredClone(found) : null;
    },

    async listByTicket(ticketId) {
      return structuredClone(state.stageRuns.filter((r) => r.ticket_id === ticketId));
    },

    async listByTickets(ticketIds) {
      const wanted = new Set<string>(ticketIds);

      return structuredClone(state.stageRuns.filter((r) => wanted.has(r.ticket_id)));
    },

    async getByRun(runId) {
      const found = [...state.stageRuns].reverse().find((r) => r.run_id === runId);

      return found ? structuredClone(found) : null;
    },

    async finish(id, patch) {
      const at = state.stageRuns.findIndex((r) => r.id === id);
      const current = state.stageRuns[at];
      if (!current) {
        throw new UnknownForgeError(`stage run ${id} does not exist`);
      }

      const { ended_at: endedAt, ...rest } = patch;
      const merged: Record<string, unknown> = {
        ...current,
        ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
      };

      // `null` clears the end time (an attempt taken over by a new run); absent leaves it.
      if (endedAt === null) {
        delete merged['ended_at'];
      } else if (endedAt !== undefined) {
        merged['ended_at'] = endedAt;
      }

      const next = StageRun.parse(merged);

      state.stageRuns[at] = structuredClone(next);
    },
  };
}

export function memoryStageArtifacts(state: MemoryState): StageArtifactRepository {
  return {
    async add(artifact) {
      const stored = StageArtifact.parse({
        ...StageArtifact.omit({ id: true }).parse(artifact),
        id: state.stageArtifactSeq + 1,
      });

      state.stageArtifactSeq = stored.id;
      state.stageArtifacts.push(structuredClone(stored));

      return structuredClone(stored);
    },

    async listByTicket(ticketId) {
      return state.stageArtifacts
        .filter((a) => a.ticket_id === ticketId)
        .map((a) => structuredClone(StageArtifactMetaSchema.parse(a)));
    },

    async get(ticketId, id) {
      const found = state.stageArtifacts.find(
        (a) => a.ticket_id === ticketId && a.id === id,
      );

      return found ? structuredClone(found) : null;
    },
  };
}
