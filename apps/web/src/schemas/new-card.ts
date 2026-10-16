/**
 * The New card request, as the web sends and validates it.
 *
 * Why: the Director starts planning the moment a card exists, so a card with a thin title or
 *   a one-word description wastes its first round of questions. The same rules the server
 *   enforces (a 4 to 120 character title, a description of at least 20 characters, http or
 *   https links) are checked here as the user types, so Create stays disabled until the server
 *   would accept the card and a refusal is the exception, not the way to learn the rules.
 *   `dedupe_key` is one uuid per opened popup, so a double click or a retry after a dropped
 *   connection returns the first card instead of filing a second.
 *
 * Exports: NewCardInput, NewCardType, NEW_CARD_TYPE_NAMES, WebLink, isWebUrl, TITLE_MIN,
 *   TITLE_MAX, DESCRIPTION_MIN (schemas and inferred types).
 * Depends on: schemas/cards (CardPriority), zod.
 */

import { z } from 'zod';
import { CardPriority } from '#/schemas/cards.js';

export const TITLE_MIN = 4;
export const TITLE_MAX = 120;
export const DESCRIPTION_MIN = 20;

export const NEW_CARD_TYPE_NAMES = ['plan', 'discussion', 'issue'] as const;
export const NewCardType = z.enum(NEW_CARD_TYPE_NAMES);
export type NewCardType = z.infer<typeof NewCardType>;

/** True for an http or https URL with a host; anything else (javascript:, file:) is not readable context. */
export function isWebUrl(text: string): boolean {
  try {
    const url = new URL(text);

    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

export const WebLink = z
  .string()
  .refine(isWebUrl, { message: 'not an http or https link' });

export const NewCardInput = z.strictObject({
  title: z.string().trim().min(TITLE_MIN).max(TITLE_MAX),
  description: z.string().trim().min(DESCRIPTION_MIN),
  type: NewCardType,
  priority: CardPriority,
  depends_on: z.array(z.string().min(1)),
  blocks: z.array(z.string().min(1)),
  links: z.array(WebLink),
  dedupe_key: z.uuid(),
});
export type NewCardInput = z.infer<typeof NewCardInput>;
