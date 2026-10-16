/**
 * Shapes of the New card popup: the form as typed, and what is wrong with it.
 *
 * Why: the popup keeps raw text while the user types (a title that is still too short is
 *   normal mid-way), so its state is looser than the request it becomes. Naming the form and
 *   its per-field problems lets the pure functions that validate and convert it
 *   (domain/new-card-form) stay apart from the components that draw it.
 *
 * Exports: NewCardForm, NewCardField, NewCardProblems, CardRefusal.
 * Depends on: schemas/cards (types), schemas/new-card (types). Types only.
 */

import type { CardPriority } from '#/schemas/cards.js';
import type { NewCardType } from '#/schemas/new-card.js';

export interface NewCardForm {
  readonly title: string;
  readonly description: string;
  readonly type: NewCardType;
  readonly priority: CardPriority;
  readonly dependsOn: readonly string[];
  readonly blocks: readonly string[];
  readonly links: readonly string[];
}

export type NewCardField = 'title' | 'description' | 'dependsOn' | 'blocks' | 'links';

/** One plain-words problem per field that has one. */
export type NewCardProblems = Partial<Record<NewCardField, string>>;

/** A refused create, said in words, with the field it belongs to when there is one. */
export interface CardRefusal {
  readonly message: string;
  readonly field?: NewCardField;
}
