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
  | { readonly kind: 'inbox'; readonly project: string }
  /** A write to a ticket's pipeline snapshot, a stage row or an artifact: the ticket page's strip is stale. */
  | { readonly kind: 'pipeline'; readonly id: string }
  /** A stage row changed by its id; the ticket is resolved from the row before the commit. */
  | { readonly kind: 'stage_run'; readonly id: number }
  /** A new pipeline proposal of a project (its slug): the Inbox and the Pipelines banner are stale. */
  | { readonly kind: 'proposal'; readonly project: string }
  /** A card's research evidence or Director sources changed: its Evidence tab and card view are stale. */
  | { readonly kind: 'card_evidence'; readonly id: string }
  /** A Worker read a page: the run's sources (the slug of its project) are stale. */
  | { readonly kind: 'run_sources'; readonly id: string; readonly project: string }
  /** A card's budget warning was written or its cap changed: its project's Inbox is stale. */
  | { readonly kind: 'card_inbox'; readonly id: string }
  /** A proposal decided by its id; its project is read from the row before the commit, and the lane's own settings may have changed too. */
  | { readonly kind: 'proposal_decided'; readonly id: number };

/** Turns the arguments of a successful write into what it touched. */
export type Recorder = (args: readonly unknown[]) => Touch | readonly Touch[];

/** Query keys to announce, per project slug, distinct by their JSON. */
export type Resolved = Map<string, Map<string, QueryKey>>;
