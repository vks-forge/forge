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
 *   StartPlanningResult, RunAsExpressResult, PlanReadResult, PlanVersionResult, PlanCtx,
 *    StepOutcome, PlanEvent, FloorFacts, FlowEnd, ReadResult, ReadBudget, ModelCall, StepFinish,
 *   ReadOutput, ReadStepResult, PlanningDoors, OpenExtras.
 * Depends on: @forge/core (card, plan, ticket and config types), types/engine-state. Types only.
 */

import type {
  Card,
  CardPriority,
  CardType,
  DirectorConfig,
  FilesRead,
  FloorResult,
  GrillState,
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

/** One light edit of a planned ticket: rename, change priority, or remove. */
export interface TicketEdit {
  readonly key: string;
  readonly title?: string;
  readonly priority?: CardPriority;
  readonly removed?: boolean;
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
      readonly floor: FloorResult | null;
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
  /** Company version plus project version: rises on every save at either scope. */
  readonly configVersion: number;
  /** The project's folder for repository reads; null when it has no local clone. */
  readonly root: string | null;
  readonly tierCGlobs: readonly string[];
}

/** What a step runner tells the flow loop: go on, wait for the owner, stop (done or failed). */
export type StepOutcome = 'continue' | 'wait' | 'stop';

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

/** How a flow walk ended: waiting for the owner, finished, or a step failed (its turn stays queued for a retry). */
export type FlowEnd = 'waiting' | 'done' | 'failed';

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
  { ok: true; value: T; cost: number } | { ok: false; cost: number };

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
}

/** The engine doors of the planning flow: what the plan and grill routes call. */
export interface PlanningDoors {
  /**
   * `POST /cards/:id/grill/answer`: answers the open grill question with an option or free text
   * and queues the Director's next turn. `question_not_open` is the 409, `invalid_answer` a 400.
   */
  answerGrill(
    cardId: string,
    input: AnswerGrillInput,
    author: string,
  ): Promise<AnswerGrillResult>;
  /**
   * `POST /cards/:id/grill/shortcut`: `use_recommendations` takes the Director's recommended
   * option for the open question and everything left; `write_plan_now` leaves the open points as
   * plan assumptions. `phase_mismatch` is the 409.
   */
  grillShortcut(
    cardId: string,
    kind: GrillShortcutKind,
    author: string,
  ): Promise<GrillShortcutResult>;
  /**
   * `POST /cards/:id/plan/approve`: the owner approves `version` (it must be the latest, else
   * `stale_plan`, and the card must be waiting on its plan, else `phase_mismatch`; both 409).
   * Files the tickets, idempotent per (card, version).
   */
  approvePlan(
    cardId: string,
    version: number,
    author: string,
  ): Promise<ApprovePlanResult>;
  /** `POST /cards/:id/plan/request-changes`: re-grills on the comment (5 characters at least) and writes the next version. */
  requestPlanChanges(
    cardId: string,
    version: number,
    comment: string,
    author: string,
  ): Promise<RequestChangesResult>;
  /**
   * `PATCH /cards/:id/plan/:version/tickets`: rename, re-prioritise, reorder or remove tickets of
   * the latest version of a ready plan; writes a new owner-authored version with the diff.
   * `ticket_has_dependents` is the 409 for a removal others depend on.
   */
  editPlanTickets(
    cardId: string,
    version: number,
    input: EditPlanInput,
    author: string,
  ): Promise<EditPlanResult>;
  /** `POST /cards/:id/start-planning`: a card backfilled from before planning existed enters the grill. */
  startPlanning(cardId: string, author: string): Promise<StartPlanningResult>;
  /** `POST /tickets/:id/run-as-express`: releases a ticket held for a pipeline into the Express lane through `transition()`. `not_held` is the 409. */
  runAsExpress(ticketId: string, author: string): Promise<RunAsExpressResult>;
  /** `GET /cards/:id/plan`: the versions, the current plan and the approval floor as it stands now. */
  cardPlans(cardId: string): Promise<PlanReadResult>;
  /** `GET /cards/:id/plan/:version`. */
  cardPlan(cardId: string, version: number): Promise<PlanVersionResult>;
}

/** What writing a grill question adds to the stored state besides the question itself. */
export interface OpenExtras {
  readonly assumptions?: readonly string[];
  /** The question came off the front of the queued list. */
  readonly fromQueue?: boolean;
}
