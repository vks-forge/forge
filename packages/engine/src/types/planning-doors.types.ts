/**
 * The engine doors of the planning flow.
 *
 * Why: the owner acts on a card that is being planned through a closed set of doors (answer a grill question,
 *   approve a plan, ask for changes, edit tickets, start planning, retry a step, run a held ticket as Express),
 *   each answering with a closed set of outcomes the HTTP routes map to one status. They are described apart from
 *   the step types so the routes and the engine agree on one surface.
 *
 * Exports: PlanningDoors.
 * Depends on: types/card-planning. Types only.
 */

import type {
  AnswerGrillInput,
  AnswerGrillResult,
  ApprovePlanResult,
  EditPlanInput,
  EditPlanResult,
  GrillShortcutKind,
  GrillShortcutResult,
  PlanReadResult,
  PlanVersionResult,
  RequestChangesResult,
  RetryPlanningResult,
  RunAsExpressResult,
  StartPlanningResult,
} from '#/types/card-planning.types.js';

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
  /** `POST /cards/:id/planning/retry`: re-queues the step that stopped on its budget. `phase_mismatch` is the 409. */
  retryPlanningStep(cardId: string, author: string): Promise<RetryPlanningResult>;
  /** `POST /tickets/:id/run-as-express`: releases a ticket held for a pipeline into the Express lane through `transition()`. `not_held` is the 409. */
  runAsExpress(ticketId: string, author: string): Promise<RunAsExpressResult>;
  /** `GET /cards/:id/plan`: the versions, the current plan and the approval floor as it stands now. */
  cardPlans(cardId: string): Promise<PlanReadResult>;
  /** `GET /cards/:id/plan/:version`. */
  cardPlan(cardId: string, version: number): Promise<PlanVersionResult>;
}
