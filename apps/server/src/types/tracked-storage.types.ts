/**
 * Shapes the tracked storage wrapper passes between recording a write and announcing it.
 *
 * Why: the wrapper notes what each write touched (a card, a ticket, a question, an inbox mark)
 *   and only at the end of the transaction resolves those to project slugs and query keys, so a
 *   rolled-back transaction announces nothing. Naming the pieces keeps the recording table
 *   readable and the resolution step honest about what it was given.
 *
 * Exports: Touch, Recorder, Resolved.
 * Depends on: @forge/core (QueryKey). Types only.
 */

import type { QueryKey } from '@forge/core';

/** What a write touched, before it is resolved to a project. */
export type Touch =
  | { readonly kind: 'card'; readonly id: string }
  | { readonly kind: 'ticket'; readonly id: string }
  | { readonly kind: 'interaction'; readonly id: string; readonly cardId?: string }
  | { readonly kind: 'inbox'; readonly project: string };

/** Turns the arguments of a successful write into what it touched. */
export type Recorder = (args: readonly unknown[]) => Touch | readonly Touch[];

/** Query keys to announce, per project slug, distinct by their JSON. */
export type Resolved = Map<string, Map<string, QueryKey>>;
