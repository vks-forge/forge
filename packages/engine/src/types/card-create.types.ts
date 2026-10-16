/**
 * Inputs and results of creating a card and editing its dependencies.
 *
 * Why: a card is created from two doors, the create-card form (`POST /projects/:slug/cards`)
 *   and chat intake (`POST /intake`), and its dependencies are edited from the card page
 *   (`PUT /cards/:id/relations`). They must agree on what is refused and why, so the route
 *   can answer a missing card, a card from another project and a dependency loop each with
 *   its own status instead of a generic failure. Naming the shapes once lets the engine
 *   return them and the server map them without sharing logic.
 *
 * Exports: CreateCardInput, CreateCardResult, SetCardRelationsInput, SetCardRelationsResult,
 *   RelationRefusal, NewCard.
 * Depends on: @forge/core (card schemas). Types only.
 */

import type { Card, CardActor, CardId, CardPriority, CardSource } from '@forge/core';

/** A refused dependency: the id that is not a card, belongs to another project, or closes a loop. */
export type RelationRefusal =
  | { readonly status: 'card_not_found'; readonly id: string }
  | { readonly status: 'cross_project_dependency'; readonly id: string }
  | { readonly status: 'dependency_cycle'; readonly cycle: CardId[] };

/** What the create-card form sends, with the actor and the project slug added by the caller. */
export interface CreateCardInput {
  readonly project: string;
  readonly title: string;
  readonly description: string;
  readonly type: string;
  readonly priority: CardPriority;
  readonly depends_on: readonly string[];
  readonly blocks: readonly string[];
  readonly links: readonly string[];
  /** Repeating a key returns the card the first call made. */
  readonly dedupe_key: string;
  readonly actor: CardActor;
}

export type CreateCardResult =
  | { readonly status: 'created'; readonly card: Card }
  | { readonly status: 'duplicate'; readonly card: Card }
  | { readonly status: 'project_not_found' }
  | { readonly status: 'project_archived' }
  | { readonly status: 'invalid_type'; readonly reason: string }
  | RelationRefusal;

export interface SetCardRelationsInput {
  readonly depends_on: readonly string[];
  readonly blocks: readonly string[];
  readonly actor: CardActor;
}

export type SetCardRelationsResult =
  { readonly status: 'updated'; readonly card: Card } | RelationRefusal;

/** What `createCardTx` stores; the caller has already checked the type and the source. */
export interface NewCard {
  readonly type: string;
  readonly title: string;
  readonly summary: string;
  /** The text of the first `user_message` event. */
  readonly message: string;
  readonly source: CardSource;
  readonly creator: CardActor;
  readonly priority?: CardPriority;
  readonly links?: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly blocks?: readonly string[];
  /** `queued` for the PR fast path (a ticket follows at once), else `grilling`. */
  readonly phase: 'grilling' | 'queued';
  /** Queue the Director's reply (a `card_created` turn). */
  readonly wake: boolean;
  readonly at: string;
}
