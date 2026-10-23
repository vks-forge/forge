/**
 * Types of the card planning flow: owner action inputs and results, and the context a step runs in.
 *
 * Why: the planning flow is driven from two sides. The tick runs the Director's steps, and the
 *   owner's actions (answer a question, take the recommendations, approve, ask for changes,
 *   edit tickets, start planning, run a held ticket as Express) arrive through engine doors the
 *   HTTP routes call. Each door answers with a closed set of outcomes, never a thrown string,
 *   so a route maps every outcome to one status (the 409s of the API contract) and a wrong-phase
 *   or stale request is a normal answer, not a crash. The step context bundles what every step
 *   needs (the card, its project, the effective Director settings and the repository root) so
 *   the step runners take one argument instead of six.
 *
 * Exports: AnswerGrillInput, AnswerGrillResult, GrillShortcutKind, GrillShortcutResult,
 *   ApprovePlanResult, RequestChangesResult, TicketEdit, EditPlanInput, EditPlanResult,
 *   StartPlanningResult, RetryPlanningResult, RunAsExpressResult, PlanReadResult, PlanVersionResult, PlanCtx, ReadCtx,
 *    StepOutcome, PlanEvent, OwnerAsk, FloorFacts, FlowEnd, ReadResult, ReadBudget, ModelCall, StepFinish,
 *   ReadOutput, ReadStepResult, RepoFilesList, OpenExtras (the planning doors are in types/planning-doors).
 * Depends on: @forge/core (card, plan, ticket and config types), types/engine-state. Types only.
 */

import type {
  Card,
  CardPriority,
  CardType,
  DirectorConfig,
  EffectiveResearch,
  FilesRead,
  FloorResult,
  GrillState,
  Lane,
  NewCardEvent,
  PlanVersion,
  PlanVersionRef,
  Project,
  ReadRequest,
  StorageTx,
  Ticket,
} from '@forge/core';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** `POST /cards/:id/grill/answer`: exactly one of `option_id` and `text`. */
export interface AnswerGrillInput {
  readonly question_id: string;
  readonly option_id?: string;
  readonly text?: string;
}

/** `question_not_open` is the 409; `invalid_answer` a 400 (both or neither of option and text, or an option the question lacks). */
export type AnswerGrillResult =
  | { readonly status: 'answered'; readonly card: Card }
  | { readonly status: 'not_found' }
  | { readonly status: 'question_not_open' }
  | { readonly status: 'invalid_answer'; readonly reason: string };

export type GrillShortcutKind = 'use_recommendations' | 'write_plan_now';

/** `phase_mismatch` is the 409: the card is not being shaped. */
export type GrillShortcutResult =
  | { readonly status: 'applied'; readonly card: Card }
  | { readonly status: 'not_found' }
  | { readonly status: 'phase_mismatch' };

/** `stale_plan` and `phase_mismatch` are the 409s; `plan_not_found` a 404. */
export type ApprovePlanResult =
  | {
      readonly status: 'approved';
      readonly card: Card;
      readonly ticket_ids: readonly string[];
      /** Tickets of an earlier plan this approval cancelled; the caller removes their worktrees after commit. */
      readonly cancelled?: readonly Ticket[];
    }
  | { readonly status: 'not_found' }
  | { readonly status: 'plan_not_found' }
  | { readonly status: 'stale_plan' }
  | { readonly status: 'phase_mismatch' };

export type RequestChangesResult =
  | { readonly status: 'requested'; readonly card: Card }
  | { readonly status: 'not_found' }
  | { readonly status: 'stale_plan' }
  | { readonly status: 'phase_mismatch' }
  | { readonly status: 'invalid_comment' };

/**
 * One light edit of a planned ticket: rename, change priority, set its lane, or remove. `drop_pipeline_ops` lists the positions of
 * the Director's pipeline ops to take off the ticket (the owner may remove a change, never add one).
 */
export interface TicketEdit {
  readonly key: string;
  readonly title?: string;
  readonly priority?: CardPriority;
  /** The owner picks this ticket's lane; approval then skips the automatic size raise (Tier C still forces Full, d-0177). */
  readonly lane?: Lane;
  readonly removed?: boolean;
  readonly drop_pipeline_ops?: readonly number[];
}

/** `PATCH /cards/:id/plan/:version/tickets`; `order` lists the surviving keys in the wanted order. */
export interface EditPlanInput {
  readonly tickets: readonly TicketEdit[];
  readonly order?: readonly string[];
}

/** `ticket_has_dependents` is the 409 (names the ticket and who depends on it); `stale_plan` and `phase_mismatch` too. */
export type EditPlanResult =
  | { readonly status: 'edited'; readonly plan: PlanVersion }
  | { readonly status: 'not_found' }
  | { readonly status: 'stale_plan' }
  | { readonly status: 'phase_mismatch' }
  | { readonly status: 'unknown_ticket'; readonly key: string }
  | {
      readonly status: 'ticket_has_dependents';
      readonly key: string;
      readonly dependents: readonly string[];
    }
  | { readonly status: 'invalid_order' }
  | { readonly status: 'empty_plan' };

/** `phase_mismatch` is the 409 (not a backfilled card waiting to start); `not_plannable` for a Discussion or a fast-path type. */
export type StartPlanningResult =
  | { readonly status: 'started'; readonly card: Card }
  | { readonly status: 'not_found' }
  | { readonly status: 'phase_mismatch' }
  | { readonly status: 'not_plannable' };

/** `phase_mismatch` is the 409: the card is not stopped on a failed planning step. */
export type RetryPlanningResult =
  | { readonly status: 'retried'; readonly card: Card }
  | { readonly status: 'not_found' }
  | { readonly status: 'phase_mismatch' };

/** `not_held` is the 409: the ticket is not waiting for a pipeline. */
export type RunAsExpressResult =
  | { readonly status: 'released'; readonly ticket: Ticket }
  | { readonly status: 'not_found' }
  | { readonly status: 'not_held' };

/** `GET /cards/:id/plan`. */
export type PlanReadResult =
  | {
      readonly status: 'ok';
      readonly versions: readonly PlanVersionRef[];
      readonly current: PlanVersion | null;
      /** The floor as it stands now; null once the plan is approved (see `floor_frozen_at`) or when there is no plan. */
      readonly floor: FloorResult | null;
      /** When the plan was approved and the floor stopped being asked; null while approval is still ahead. */
      readonly floor_frozen_at: string | null;
      /** Tickets approving the current plan would cancel (never started). */
      readonly will_cancel: readonly { readonly id: string; readonly title: string }[];
      /** The part of `will_cancel` the plan neither plans nor names as dropped. */
      readonly not_covered: readonly { readonly id: string; readonly title: string }[];
      /** Kept tickets whose plan key the plan reuses for a new ticket. */
      readonly already_exists: readonly { readonly id: string; readonly title: string }[];
    }
  | { readonly status: 'not_found' };

/** `GET /cards/:id/plan/:version`. */
export type PlanVersionResult =
  | { readonly status: 'ok'; readonly plan: PlanVersion }
  | { readonly status: 'not_found' }
  | { readonly status: 'plan_not_found' };

/** Everything a planning step reads about the card it runs for; effective for one tick. */
export interface PlanCtx {
  readonly ctx: EngineCtx;
  readonly card: Card;
  readonly project: Project;
  readonly type: CardType;
  /** The project's effective Director settings (company over built-ins, project over those). */
  readonly director: DirectorConfig;
  /** What research may use for this project: the company's settings narrowed by the project's (d-0144). */
  readonly research: EffectiveResearch;
  /** Company version plus project version: rises on every save at either scope. */
  readonly configVersion: number;
  /** The project's folder for repository reads; null when it has no local clone. */
  readonly root: string | null;
  readonly tierCGlobs: readonly string[];
}

/** What a read needs of its caller: the tick (for the repo reader) and the project folder; a planning step and a Worker's question both qualify. */
export type ReadCtx = Pick<PlanCtx, 'ctx' | 'root'>;

/** What a step runner tells the flow loop: go on, wait for the owner, stop (failed, retried later) or blocked (Needs you raised). */
export type StepOutcome = 'continue' | 'wait' | 'stop' | 'blocked';

/** A card event without its time and actor, which the planning flow fills in. */
export type PlanEvent = NewCardEvent extends infer E
  ? E extends { at: string; actor: unknown }
    ? Omit<E, 'at' | 'actor'>
    : never
  : never;

/** What the approval floor needs to gather its facts: storage and git, the project, its folder and its Tier C globs. */
export interface FloorFacts {
  readonly deps: EngineDeps;
  readonly projectId: string;
  readonly root: string | null;
  readonly tierCGlobs: readonly string[];
}

/** How a flow walk ended: waiting, finished, a step failed (turn stays queued for a retry) or blocked on the owner. */
export type FlowEnd = 'waiting' | 'done' | 'failed' | 'blocked';

/** What one engine-side read request produced, as the step sees it. */
export interface ReadResult {
  readonly request: ReadRequest;
  readonly ok: boolean;
  readonly text?: string;
  readonly truncated?: boolean;
  readonly error?: string;
}

/** What is left of a step's read caps; shared across its read rounds. */
export interface ReadBudget {
  filesLeft: number;
  bytesLeft: number;
  readonly filesRead: FilesRead;
}

/** A model call that succeeded with its cost, or failed (already reported and noted on the card). */
export type ModelCall<T> =
  | { ok: true; value: T; cost: number }
  | { ok: false; cost: number; outcome: 'stop' | 'blocked' };

/** What a finished step records; `patch` edits the grill state, `after` makes the step's own writes. */
export interface StepFinish {
  readonly index: number;
  readonly files: FilesRead;
  readonly summary: string;
  readonly cost: number;
  readonly patch?: (grill: GrillState) => GrillState;
  readonly after?: (tx: StorageTx, grill: GrillState) => Promise<unknown>;
}

/** The answer shape survey and verify share: more reads wanted, or findings. */
export interface ReadOutput<F> {
  readonly read_requests?: ReadRequest[] | undefined;
  readonly findings?: F | undefined;
  readonly step_decisions?: Record<string, boolean> | undefined;
}

/** The outcome of a read-round step. */
export interface ReadStepResult<F> {
  readonly findings: F;
  readonly files: FilesRead;
  readonly cost: number;
  readonly decisions: Record<string, boolean>;
  /** True when a survey answered without reading a file of a repository that has some (the grill is told). */
  readonly readNothing?: boolean;
}

/** The repository's tracked paths at HEAD as a survey is shown them. */
export interface RepoFilesList {
  readonly paths: readonly string[];
  readonly truncated: boolean;
}

/** What writing a grill question adds to the stored state besides the question itself. */
export interface OpenExtras {
  readonly assumptions?: readonly string[];
  /** Later steps the Director switched on or off with this question (`step_decisions`). */
  readonly decisions?: Record<string, boolean> | undefined;
  /** The question came off the front of the queued list. */
  readonly fromQueue?: boolean;
}

/**
 * What the Director raises on a card when it needs the owner: the one-line `reason` older
 * readers show, the `kind` and `title` the dock names it by, the separate `items` (floor
 * reasons or questions) and the actions the owner may take.
 */
export interface OwnerAsk {
  readonly reason: string;
  readonly kind: 'plan_approval' | 'director_questions';
  readonly title: string;
  readonly items: readonly string[];
  readonly actions: readonly ('answer' | 'approve_plan' | 'request_changes')[];
}
