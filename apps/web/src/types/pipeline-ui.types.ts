/**
 * Types of the pipeline editor and the ticket strip.
 *
 * Why: the editor's rules (what may move, what a new stage looks like, which problem sits under
 *   which row) are pure functions shared by the rows, the add menu and the tests; they speak
 *   these small shapes instead of loose objects, so a control, its tooltip reason and its test
 *   all read the same fields.
 *
 * Exports: StageTone, AddKind, StageMove, StageGate, CheckStage, Member, ProblemIndex, WriterOption,
 *   CheckPolicyView, ProblemCode, StageStatus, CustomScript.
 * Depends on: @forge/core (types only).
 */

import type {
  AgentStage,
  PipelineProblem,
  ScriptGateStage,
  Stage,
  StageView,
} from '@forge/core';

/** The code of a problem core can find in a pipeline or a routing list. */
export type ProblemCode = PipelineProblem['code'];

/** A stage's status as the strip shows it: a recorded status or not yet started. */
export type StageStatus = StageView['status'];

/** The tone of a status chip on the ticket strip. */
export type StageTone = 'good' | 'danger' | 'attn' | 'signal' | 'quiet';

/** The run of a script gate the owner wrote (the other kind is the built-in G1). */
export type CustomScript = Extract<ScriptGateStage['run'], { command: string }>;

/**
 * What the Add stage menu offers; merge is always there and cannot be added. `writer` is only an
 * insertion zone (an agent stage whose agent writes), never a menu entry.
 */
export type AddKind =
  | 'agent'
  | 'script_gate'
  | 'group'
  | 'writer_group'
  | 'director_check'
  | 'sign_off'
  | 'writer';

/** Whether a stage may move or go, and if not, why in words. */
export type StageGate =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

export type StageMove = -1 | 1;

/** A stage that carries a check policy. */
export type CheckStage = Extract<Stage, { kind: 'agent' | 'script_gate' | 'group' }>;

/** A member of a run-together group. */
export type Member = AgentStage | ScriptGateStage;

/** Problems split into the ones for the whole list and the ones for one row. */
export interface ProblemIndex {
  readonly general: readonly PipelineProblem[];
  readonly byStage: ReadonlyMap<string, readonly PipelineProblem[]>;
}

/** An earlier writer a check can send work back to. */
export interface WriterOption {
  readonly id: string;
  readonly label: string;
}

/** A check policy with the defaults filled in. */
export interface CheckPolicyView {
  readonly on_blocking: 'rework' | 'hold';
  readonly blocking: readonly ('critical' | 'high' | 'medium' | 'low')[];
  /** Empty means the default: the last writer before the stage. */
  readonly rework_to: string;
}
