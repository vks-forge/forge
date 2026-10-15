/**
 * In-memory card, card event and card type repositories.
 *
 * Why: engine and route tests run on this backend, so cards must behave as in SQLite:
 *   numbers continue from the highest stored one, history `seq` is allocated by storage and
 *   is gap-free per card, patches can clear only the optional columns, rows are parsed with
 *   the core schemas on the way in and returned as copies, and the type registry starts with
 *   the built-in rows that migration 0019 seeds. A divergence would let a rollup or intake
 *   test pass against behaviour production does not have.
 *
 * Exports: memoryCards(), memoryCardEvents(), memoryCardTypes().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { Card, CardEvent, CardType, InvalidInputError, NewCardEvent } from '@forge/core';
import type {
  CardEventRepository,
  CardRepository,
  CardTypeRepository,
} from '@forge/core';
import { insertUnique } from '#/adapters/memory/rows.js';
import type { MemoryState } from '#/types/memory-state.types.js';

const CLEARABLE = ['closed_reason', 'budget_cap_usd'] as const;
const SETTABLE = ['type', 'title', 'summary', ...CLEARABLE] as const;

export function memoryCards(state: MemoryState): CardRepository {
  return {
    async get(id) {
      const c = state.cards.get(id);

      return c ? structuredClone(c) : null;
    },
    async insert(card) {
      const c = Card.parse(card);
      insertUnique(state.cards, c.id, c, 'card');
    },
    async nextNumber(prefix) {
      const head = `${prefix}-C`;
      const numbers = [...state.cards.keys()]
        .filter((id) => id.startsWith(head))
        .map((id) => Number(id.slice(head.length)));

      return Math.max(0, ...numbers) + 1;
    },
    async listByProject(project, filter) {
      const { after } = filter;

      return [...state.cards.values()]
        .filter((c) => c.project === project)
        .filter((c) => filter.type === undefined || c.type === filter.type)
        .filter(
          (c) =>
            !after ||
            c.updated_at < after.updated_at ||
            (c.updated_at === after.updated_at && c.id < after.id),
        )
        .sort((a, b) =>
          a.updated_at === b.updated_at
            ? Number(b.id > a.id) - Number(b.id < a.id)
            : Number(b.updated_at > a.updated_at) - Number(b.updated_at < a.updated_at),
        )
        .slice(0, filter.limit)
        .map((c) => structuredClone(c));
    },
    async update(id, patch) {
      const current = state.cards.get(id);
      if (!current) {
        return false;
      }

      const next: Record<string, unknown> = { ...current, updated_at: patch.updated_at };
      for (const key of SETTABLE) {
        if (!(key in patch)) {
          continue;
        }

        const value = patch[key];
        if (value !== undefined) {
          next[key] = value;
        } else if ((CLEARABLE as readonly string[]).includes(key)) {
          delete next[key];
        } else {
          throw new InvalidInputError(`card ${key} cannot be cleared`);
        }
      }

      state.cards.set(id, Card.parse(next));

      return true;
    },
  };
}

export function memoryCardEvents(state: MemoryState): CardEventRepository {
  return {
    async append(cardId, event) {
      const e = NewCardEvent.parse(event);
      const list = state.cardEvents.get(cardId) ?? [];
      const stored = CardEvent.parse({ ...e, card_id: cardId, seq: list.length });
      state.cardEvents.set(cardId, [...list, stored]);

      return structuredClone(stored);
    },
    async list(cardId, filter) {
      const inRange = (state.cardEvents.get(cardId) ?? []).filter(
        (e) =>
          e.seq > (filter.afterSeq ?? -1) &&
          e.seq < (filter.beforeSeq ?? Number.POSITIVE_INFINITY),
      );

      return (filter.order === 'desc' ? [...inRange].reverse() : inRange)
        .slice(0, filter.limit)
        .map((e) => structuredClone(e));
    },
  };
}

export function memoryCardTypes(state: MemoryState): CardTypeRepository {
  return {
    async get(name) {
      const t = state.cardTypes.get(name);

      return t ? structuredClone(t) : null;
    },
    async list() {
      return [...state.cardTypes.values()].map((t) => structuredClone(t));
    },
    async upsert(type) {
      const t = CardType.parse(type);
      state.cardTypes.set(t.name, t);
    },
  };
}
