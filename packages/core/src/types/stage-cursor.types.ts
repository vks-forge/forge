/**
 * Shapes the stage cursor reads and returns.
 *
 * Why: the engine decides what to do next for a ticket from the stage rows alone (no stored
 *   cursor), so the decision is one pure function over rows. These are its inputs, the slice
 *   of a stage row it needs, and the closed set of answers the engine knows how to perform:
 *   run a writer, prove the tests red, start the gates, start checks, wait, merge, or stop.
 *
 * Exports: StageRecord, Cursor, CheckMember, CheckSlot, StageClass, SnapshotView, StageSeed, ResolvedPolicy.
 * Depends on: schemas/agent, schemas/pipeline, schemas/stage-run. Types only.
 */

import type { AgentId, AgentRole } from '#/schemas/agent.js';
import type {
  AgentStage,
  PipelineDefinition,
  ScriptGateStage,
  Severity,
  Stage,
} from '#/schemas/pipeline.js';
import type { StageRun } from '#/schemas/stage-run.js';

/** The part of a stage row the cursor reads. */
export type StageRecord = Pick<
  StageRun,
  'stage_id' | 'member_id' | 'cycle' | 'status' | 'kind' | 'outcome'
>;

/** The part of a ticket's pipeline snapshot the cursor reads. */
export interface SnapshotView {
  readonly definition: PipelineDefinition;
  readonly roles: Readonly<Record<AgentId, AgentRole>>;
}

/** One check the engine must start: a lone check stage (empty id) or a member of a group. */
export interface CheckMember {
  readonly id: string;
  readonly stage: AgentStage | ScriptGateStage;
}

/**
 * What a ticket's pipeline asks for next. `run_writer` and `run_proof` happen while the ticket
 * is in progress; `start_gates`, `run_checks`, `await` and `merge` while it is verifying.
 */
export type Cursor =
  | { readonly kind: 'run_writer'; readonly stage: AgentStage; readonly cycle: number }
  | { readonly kind: 'run_proof'; readonly stage: AgentStage; readonly cycle: number }
  | {
      readonly kind: 'start_gates';
      readonly stage: ScriptGateStage;
      readonly cycle: number;
    }
  | {
      readonly kind: 'run_checks';
      readonly stage: Stage;
      readonly members: readonly CheckMember[];
      readonly cycle: number;
    }
  | { readonly kind: 'await'; readonly stage: Stage; readonly cycle: number }
  | { readonly kind: 'merge'; readonly hold: boolean; readonly cycle: number }
  | { readonly kind: 'done' };

/** What a stage is, by its kind and, for an agent, its role. */
export type StageClass =
  'writer' | 'check_agent' | 'g1' | 'script' | 'group' | 'human' | 'merge' | 'unknown';

/** A stage row to insert for a ticket that was already past some stages when pipelines went live. */
export interface StageSeed {
  readonly stage_id: string;
  readonly member_id: string;
  readonly cycle: number;
  readonly kind: 'agent';
  readonly agent_id: string;
  readonly status: 'adopted';
}

/** A stage's blocking-findings policy with the defaults filled in. */
export interface ResolvedPolicy {
  readonly on_blocking: 'rework' | 'hold';
  readonly blocking: readonly Severity[];
}

/** One check member with the row (if any) that says how far it got. */
export interface CheckSlot {
  readonly member: CheckMember;
  readonly row: StageRecord | undefined;
}
