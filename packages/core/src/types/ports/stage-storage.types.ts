/**
 * Stage storage ports — a ticket's pipeline snapshot, its stage rows and their artifacts.
 *
 * Why: the stage runner keeps no cursor of its own, so everything it decides on is a row:
 *   the ticket's own copy of its pipeline, one row per stage attempt (unique per ticket, stage,
 *   member and rework cycle, so a restart or a double tick can never start a stage twice) and
 *   the artifacts a stage was shown or produced. These repositories join the same transaction
 *   as tickets and runs, so a stage row and the run it describes are written together.
 *
 * Exports: TicketPipelineRepository, StageRunRepository, StageArtifactRepository, NewStageRun,
 *   StageRunPatch, NewStageArtifact, StageArtifactMeta.
 * Depends on: schemas/pipeline, schemas/stage-run. Types only.
 */

import type { PipelineDefinition } from '#/schemas/pipeline.js';
import type {
  RoutedStage,
  StageArtifact,
  StageOutcome,
  StageRun,
  TicketPipeline,
} from '#/schemas/stage-run.js';

/** A ticket's pipeline snapshot, taken once at its first dispatch. */
export interface TicketPipelineRepository {
  get(ticketId: string): Promise<TicketPipeline | null>;
  /** false when the ticket already has a snapshot (the first one stands). */
  insert(snapshot: TicketPipeline): Promise<boolean>;
  /** Stores the routed stages a rule added: the new definition and hash, the full routed list. */
  appendRouted(
    ticketId: string,
    update: {
      definition: PipelineDefinition;
      hash: string;
      routed: readonly RoutedStage[];
      at: string;
    },
  ): Promise<void>;
  /** Replaces lane, definition, roles, hash, config version and routed (a heavier lane re-snapshots). */
  replace(snapshot: TicketPipeline): Promise<void>;
}

/** What a new stage attempt carries; storage assigns the id and an empty outcome. */
export type NewStageRun = Omit<StageRun, 'id' | 'outcome' | 'ended_at'> & {
  readonly outcome?: StageOutcome;
};

/** What `finish` may change on an attempt. */
export interface StageRunPatch {
  readonly status?: StageRun['status'];
  readonly outcome?: StageOutcome;
  readonly run_id?: string;
  readonly agent_id?: string;
  readonly agent_hash?: string;
  readonly started_at?: string;
  readonly ended_at?: string | null;
}

export interface StageRunRepository {
  /** The new row's id, or `'exists'` when (ticket, stage, member, cycle) already has one. */
  start(row: NewStageRun): Promise<number | 'exists'>;
  find(
    ticketId: string,
    stageId: string,
    memberId: string,
    cycle: number,
  ): Promise<StageRun | null>;
  /** Every attempt of the ticket, oldest first. */
  listByTicket(ticketId: string): Promise<StageRun[]>;
  /** One attempt by its row id, or null (the live strip resolves a finished row's ticket through this). */
  get(id: number): Promise<StageRun | null>;
  /** The attempt a run belongs to, or null (a writer run of a ticket with no pipeline, a legacy run). */
  getByRun(runId: string): Promise<StageRun | null>;
  /** Applies `patch` to the attempt; a missing id throws. */
  finish(id: number, patch: StageRunPatch): Promise<void>;
}

/** An artifact without its content: what lists and the pipeline strip need. */
export type StageArtifactMeta = Omit<StageArtifact, 'content'>;

export type NewStageArtifact = Omit<StageArtifact, 'id'>;

export interface StageArtifactRepository {
  add(artifact: NewStageArtifact): Promise<StageArtifact>;
  /** The ticket's artifacts without their content, oldest first. */
  listByTicket(ticketId: string): Promise<StageArtifactMeta[]>;
  /** One artifact of the ticket with its content, or null. */
  get(ticketId: string, id: number): Promise<StageArtifact | null>;
}
