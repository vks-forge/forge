/**
 * In-memory card relation and card reply queue repositories.
 *
 * Why: engine and route tests run on this backend, so the card-flow tables must behave as in
 *   SQLite: an edge needs both cards to exist and never points at its own card, a relation
 *   edit replaces a card's edges in one step (a refused edge leaves the old set intact), a
 *   reply claim hands each unfinished row to one caller and takes it back only once the claim
 *   is stale, and ids come from a counter that a rolled-back transaction does not consume.
 *   A divergence would let a cycle or restart test pass against behaviour production lacks.
 *
 * Exports: memoryCardRelations(), memoryCardReplyQueue().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import {
  CardRelation,
  CardReplyQueueItem,
  InvalidInputError,
  NewCardReply,
} from '@forge/core';
import type { CardRelationRepository, CardReplyQueueRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryCardRelations(state: MemoryState): CardRelationRepository {
  const check = (edge: CardRelation): CardRelation => {
    const r = CardRelation.parse(edge);
    if (r.from === r.to) {
      throw new InvalidInputError(`card ${r.from} cannot depend on itself`);
    }

    for (const id of [r.from, r.to]) {
      if (!state.cards.has(id)) {
        throw new InvalidInputError(`card ${id} does not exist`);
      }
    }

    return r;
  };

  const has = (edge: CardRelation): boolean =>
    state.cardRelations.some((r) => r.from === edge.from && r.to === edge.to);

  return {
    async listByProject(project) {
      const ids = new Set(
        [...state.cards.values()].filter((c) => c.project === project).map((c) => c.id),
      );

      return state.cardRelations
        .filter((r) => ids.has(r.from))
        .map((r) => structuredClone(r));
    },

    async listFor(cardId) {
      return state.cardRelations
        .filter((r) => r.from === cardId || r.to === cardId)
        .map((r) => structuredClone(r));
    },

    async replaceFor(cardId, dependsOn, blocks) {
      const edges = [
        ...dependsOn.map((to) => check({ from: cardId, to, kind: 'depends_on' })),
        ...blocks.map((from) => check({ from, to: cardId, kind: 'depends_on' })),
      ];

      const kept = state.cardRelations.filter(
        (r) => r.from !== cardId && r.to !== cardId,
      );

      state.cardRelations = kept;
      for (const edge of edges) {
        if (!has(edge)) {
          state.cardRelations.push(edge);
        }
      }
    },

    async add(relation) {
      const edge = check(relation);
      if (has(edge)) {
        return false;
      }

      state.cardRelations.push(edge);

      return true;
    },
  };
}

export function memoryCardReplyQueue(state: MemoryState): CardReplyQueueRepository {
  return {
    async enqueue(item) {
      const i = NewCardReply.parse(item);
      if (!state.cards.has(i.card_id)) {
        throw new InvalidInputError(`card ${i.card_id} does not exist`);
      }

      state.cardReplySeq += 1;
      const stored = CardReplyQueueItem.parse({ ...i, id: state.cardReplySeq });
      state.cardReplies.push(stored);

      return structuredClone(stored);
    },

    async claim(at, staleBefore) {
      const claimed: CardReplyQueueItem[] = [];
      state.cardReplies = state.cardReplies.map((row) => {
        const free =
          row.done_at === undefined &&
          (row.claimed_at === undefined || row.claimed_at < staleBefore);

        if (!free) {
          return row;
        }

        const next = { ...row, claimed_at: at };
        claimed.push(structuredClone(next));

        return next;
      });

      return claimed;
    },

    async complete(id, at) {
      const row = state.cardReplies.find((r) => r.id === id);
      if (!row || row.done_at !== undefined) {
        return false;
      }

      state.cardReplies = state.cardReplies.map((r) =>
        r.id === id ? { ...r, done_at: at } : r,
      );

      return true;
    },

    async listOpen(cardId) {
      return state.cardReplies
        .filter((r) => r.card_id === cardId && r.done_at === undefined)
        .map((r) => structuredClone(r));
    },
  };
}
