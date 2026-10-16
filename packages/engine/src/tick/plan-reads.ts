/**
 * Plan reads: the versions of a card's plan, the current plan and the approval floor now.
 *
 * Why: the Plan tab shows the fixed structure of the newest version, a picker over every
 *   version with its diff, and whether the Director would be allowed to approve (the floor).
 *   The floor is computed when the page reads it, not stored, because it depends on facts that
 *   move (another card's plan, HEAD), and a stale "passes" next to an Approve button would mislead.
 *
 * Exports: cardPlans(), cardPlan().
 * Depends on: @forge/core (CardId), tick/planning-floor, types/card-planning. Reads storage and git.
 */

import { CardId } from '@forge/core';
import type { Card } from '@forge/core';
import { computeFloor, floorFactsFor } from '#/tick/planning-floor.js';
import type { PlanReadResult, PlanVersionResult } from '#/types/card-planning.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** `GET /cards/:id/plan`: every version, the current plan and the floor as it stands now. */
export async function cardPlans(
  deps: EngineDeps,
  cardId: string,
): Promise<PlanReadResult> {
  const id = CardId.safeParse(cardId);
  const card: Card | null = id.success
    ? await deps.storage.transaction((tx) => tx.cards.get(id.data))
    : null;

  if (!card) {
    return { status: 'not_found' };
  }

  const plans = await deps.storage.transaction((tx) =>
    tx.cardPlanning.listPlans(card.id),
  );

  const current = plans[plans.length - 1] ?? null;
  const facts = current ? await floorFactsFor(deps, card.id) : null;

  return {
    status: 'ok',
    versions: plans.map((p) => ({ version: p.version, created_at: p.created_at })),
    current,
    floor: current && facts ? await computeFloor(facts, current) : null,
  };
}

/** `GET /cards/:id/plan/:version`. */
export async function cardPlan(
  deps: EngineDeps,
  cardId: string,
  version: number,
): Promise<PlanVersionResult> {
  const id = CardId.safeParse(cardId);
  const found = id.success
    ? await deps.storage.transaction(async (tx) =>
        (await tx.cards.get(id.data))
          ? await tx.cardPlanning.getPlan(id.data, version)
          : undefined,
      )
    : undefined;

  if (found === undefined) {
    return { status: 'not_found' };
  }

  return found ? { status: 'ok', plan: found } : { status: 'plan_not_found' };
}
