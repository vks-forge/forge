/**
 * In-memory CardPlanningRepository.
 *
 * Why: engine tests of the planning flow run on this backend, so planning state must behave as
 *   in SQLite: a card that never planned reads as empty, a patch changes only the keys it
 *   names, a grill state or flow that fails its schema is refused before anything is stored,
 *   plan versions are append-only per card and listed oldest first, and every read returns a
 *   copy so a caller cannot edit stored state by accident. State lives in `MemoryState`, so a
 *   rolled-back transaction leaves no plan and no planning change, as in production.
 *
 * Exports: memoryCardPlanning().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { DirectorFlow, GrillState, InvalidInputError, PlanVersion } from '@forge/core';
import type { CardPlanningRepository, CardPlanningState } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

const emptyState = (): CardPlanningState => ({
  flow: null,
  flow_config_version: null,
  flow_cursor: null,
  grill: GrillState.parse({}),
});

export function memoryCardPlanning(state: MemoryState): CardPlanningRepository {
  const plansOf = (cardId: string): PlanVersion[] =>
    [...(state.cardPlans.get(cardId) ?? [])].sort((a, b) => a.version - b.version);

  return {
    async get(cardId) {
      return structuredClone(state.cardPlanning.get(cardId) ?? emptyState());
    },

    async update(cardId, patch) {
      // Validate before touching state so a refused patch changes nothing.
      const flow =
        patch.flow === undefined || patch.flow === null
          ? patch.flow
          : DirectorFlow.parse(patch.flow);

      const grill = patch.grill === undefined ? undefined : GrillState.parse(patch.grill);
      if (!state.cards.has(cardId)) {
        return false;
      }

      const current = state.cardPlanning.get(cardId) ?? emptyState();
      state.cardPlanning.set(
        cardId,
        structuredClone({
          flow: flow === undefined ? current.flow : flow,
          flow_config_version:
            patch.flow_config_version === undefined
              ? current.flow_config_version
              : patch.flow_config_version,
          flow_cursor:
            patch.flow_cursor === undefined ? current.flow_cursor : patch.flow_cursor,
          grill: grill ?? current.grill,
        }),
      );

      return true;
    },

    async appendPlan(plan) {
      const p = PlanVersion.parse(plan);
      if (!state.cards.has(p.card_id)) {
        throw new InvalidInputError(`card ${p.card_id} does not exist`);
      }

      const existing = state.cardPlans.get(p.card_id) ?? [];
      if (existing.some((e) => e.version === p.version)) {
        throw new InvalidInputError(
          `card ${p.card_id} already has a plan version ${p.version}`,
        );
      }

      state.cardPlans.set(p.card_id, [...existing, structuredClone(p)]);
    },

    async listPlans(cardId) {
      return structuredClone(plansOf(cardId));
    },

    async getPlan(cardId, version) {
      const found = plansOf(cardId).find((p) => p.version === version);

      return found ? structuredClone(found) : null;
    },

    async latestPlan(cardId) {
      const last = plansOf(cardId).at(-1);

      return last ? structuredClone(last) : null;
    },
  };
}
