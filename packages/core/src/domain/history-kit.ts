/**
 * Small shared helpers of the history builders: tie-break ranks, clipping, text extraction.
 *
 * Why: the ticket builder, the stage builder and the card builder all write entries the same way
 *   (a clipped sentence, a rank for same-instant order, links without empty keys). Keeping that
 *   in one named module stops each builder growing its own slightly different copy.
 *
 * Exports: RANK, clip(), textOf(), pushItem(), linksOf(), actorOfCard().
 * Depends on: schemas/card, schemas/history, types/history. No IO.
 */

import type { CardActor } from '#/schemas/card.js';
import type { HistoryActor, HistoryEntry } from '#/schemas/history.js';
import type { HistoryCtx } from '#/types/history.types.js';

/** Tie-break order at one instant: answers and run ends first, the state change after them, starts last. */
export const RANK = {
  answer: 0,
  end: 1,
  check: 2,
  state: 3,
  merge: 4,
  start: 5,
  question: 6,
} as const;

const TEXT_KEYS = ['text', 'question', 'prompt', 'title', 'message'] as const;

/** The readable text inside an interaction payload or answer, if it holds one. */
export function textOf(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }

  if (typeof value === 'object' && value !== null) {
    for (const key of TEXT_KEYS) {
      const v = (value as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim() !== '') {
        return v.trim();
      }
    }
  }

  return undefined;
}

/** `text` cut to `max` characters with an ellipsis. */
export function clip(text: string, max = 200): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Adds an entry to the build with its tie-break rank. */
export function pushItem(ctx: HistoryCtx, rank: number, entry: HistoryEntry): void {
  ctx.out.push({ entry, rank });
}

/** The links object without the keys that have no value. */
export function linksOf(
  links: Record<string, string | undefined>,
): HistoryEntry['links'] {
  return Object.fromEntries(
    Object.entries(links).filter(([, v]) => v !== undefined),
  ) as HistoryEntry['links'];
}

/** Who a card event's actor is in the owner's words: the engine writes as `director/engine`. */
export function actorOfCard(actor: CardActor): HistoryActor {
  if (actor.type === 'user') {
    return { type: 'owner' };
  }

  if (actor.type === 'director') {
    return actor.id === 'engine' ? { type: 'engine' } : { type: 'director' };
  }

  return { type: 'engine' };
}
