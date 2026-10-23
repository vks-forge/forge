/**
 * Plan reads: the versions of a card's plan, the current plan and the approval floor now.
 *
 * Why: the Plan tab shows the fixed structure of the newest version, a picker over every
 *   version with its diff, whether the Director would be allowed to approve (the floor), and what
 *   approving would cancel and which of those tickets the plan does not cover.
 *   The floor is computed when the page reads it, not stored, because it depends on facts that
 *   move (another card's plan, HEAD), and a stale "passes" next to an Approve button would mislead.
 *
 * Exports: cardPlans(), cardPlan().
 * Depends on: @forge/core (CardId), tick/plan-impact, tick/planning-floor, types/card-planning. Reads storage and git.
 */

import { CardId, PLANNING_PHASES } from '@forge/core';
import type { Card } from '@forge/core';
import { planImpact } from '#/tick/plan-impact.js';
import { computeFloor, floorFactsFor } from '#/tick/planning-floor.js';
import type { PlanReadResult, PlanVersionResult } from '#/types/card-planning.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** When the card's plan was approved, once the card is past approval (not back in planning); else null. */
async function floorFrozenAt(deps: EngineDeps, card: Card): Promise<string | null> {
  if (PLANNING_PHASES.includes(card.phase)) {
    return null;
  }

  return deps.storage.transaction(async (tx) => {
    let approved: string | null = null;
    let afterSeq: number | undefined;
    for (;;) {
      const page = await tx.cardEvents.list(card.id, {
        ...(afterSeq === undefined ? {} : { afterSeq }),
        limit: 200,
      });

      for (const e of page) {
        if (e.kind === 'plan_approved') {
          approved = e.at;
        }
      }

      const last = page[page.length - 1];
      if (page.length < 200 || !last) {
        return approved;
      }

      afterSeq = last.seq;
    }
  });
}

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
  // The floor guards approval; afterwards the card's own merges move the very files it checks (frozen, not re-asked).
  const frozenAt = current ? await floorFrozenAt(deps, card) : null;
  const facts = current && frozenAt === null ? await floorFactsFor(deps, card.id) : null;

  const impact = current
    ? await deps.storage.transaction((tx) => planImpact(tx, card.id, current))
    : null;

  return {
    status: 'ok',
    versions: plans.map((p) => ({ version: p.version, created_at: p.created_at })),
    current,
    floor: current && facts ? await computeFloor(facts, current) : null,
    floor_frozen_at: frozenAt,
    will_cancel: (impact?.willCancel ?? []).map((t) => ({ id: t.id, title: t.title })),
    not_covered: (impact?.notCovered ?? []).map((t) => ({ id: t.id, title: t.title })),
    already_exists: (impact?.alreadyExists ?? []).map((t) => ({
      id: t.id,
      title: t.title,
    })),
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
