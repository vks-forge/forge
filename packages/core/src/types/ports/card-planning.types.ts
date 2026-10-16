/**
 * Card planning port — the flow snapshot, grill state and plan versions of a card.
 *
 * Why: the Director plans a card over several ticks and may be restarted at any point, so
 *   what it has settled is stored, never held in memory: the flow the card started with (a
 *   snapshot, so editing the flow later never changes a card already planning, d-0146), the
 *   cursor into that flow, the structured grill state (open question, answers, assumptions,
 *   findings) and every plan version with its diff. It commits in the same transaction as
 *   the card events and phase moves that describe it, so a history line never claims a plan
 *   that was rolled back. Plan versions are append-only: a revision is a new version, and a
 *   second writer of the same version number loses (d-0132).
 *
 * Exports: CardPlanningState, CardPlanningPatch, CardPlanningRepository.
 * Depends on: schemas/director-flow, schemas/grill, schemas/ids, schemas/plan. Types only.
 */

import type { DirectorFlow } from '#/schemas/director-flow.js';
import type { GrillState } from '#/schemas/grill.js';
import type { CardId } from '#/schemas/ids.js';
import type { PlanVersion } from '#/schemas/plan.js';

/** What a card remembers about planning; a card that never planned has no flow and an empty grill state. */
export interface CardPlanningState {
  readonly flow: DirectorFlow | null;
  /** The effective config revision the flow snapshot was taken at. */
  readonly flow_config_version: number | null;
  /** Index into `flow` of the step to run next; null before planning starts and once the flow is done. */
  readonly flow_cursor: number | null;
  readonly grill: GrillState;
}

/** Fields to change; a key left out is kept, `null` clears the flow fields. */
export interface CardPlanningPatch {
  readonly flow?: DirectorFlow | null;
  readonly flow_config_version?: number | null;
  readonly flow_cursor?: number | null;
  readonly grill?: GrillState;
}

export interface CardPlanningRepository {
  // The card's planning state; defaults when none was ever stored (an unknown card reads as default too).
  get(cardId: CardId): Promise<CardPlanningState>;
  // Applies the patch; false when the card does not exist.
  update(cardId: CardId, patch: CardPlanningPatch): Promise<boolean>;
  // Stores a plan version; throws InvalidInputError when (card, version) already exists or the card is unknown.
  appendPlan(plan: PlanVersion): Promise<void>;
  // Every version of the card, oldest first.
  listPlans(cardId: CardId): Promise<PlanVersion[]>;
  getPlan(cardId: CardId, version: number): Promise<PlanVersion | null>;
  // The highest version, or null.
  latestPlan(cardId: CardId): Promise<PlanVersion | null>;
}
