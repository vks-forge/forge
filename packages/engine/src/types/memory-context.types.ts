/**
 * Memory context types — what a Director step asks of project memory and what it gets back.
 *
 * Why: six Director steps read project memory, and they differ in only three things: the question their
 *   key words come from, whether a model may rewrite that question, and the agent's memory slice. Naming
 *   those inputs once keeps the six callers one-liners, and the result keeps today's prompt shape
 *   (`decisions`, `rejected`) plus an honest note when records were left out.
 *
 * Exports: MemoryContextOptions, MemoryContext, MemoryRewrite.
 * Depends on: @forge/core (types only). Types only.
 */

import type { CardId, MemoryFilter, MemoryRecordRef } from '@forge/core';

export interface MemoryContextOptions {
  /** The text key words come from: a ticket's title and body, or a card's title and summary. */
  readonly question: string;
  /** True only where the question is free text worth one cheap model call (card planning, card chat). */
  readonly rewrite: boolean;
  /** An agent's memory slice (d-0078): tags any-of, and whether rejected approaches are listed. */
  readonly filter?: MemoryFilter | undefined;
  /** The card the call counts toward, so the rewrite's cost lands in its Director spend. */
  readonly cardId?: CardId | undefined;
}

export interface MemoryContext {
  readonly decisions: readonly MemoryRecordRef[];
  readonly rejected: readonly MemoryRecordRef[];
  /** Present only when active decisions were left out: how many are shown and that rejected approaches are complete. */
  readonly note?: string;
}

/** The key words a search uses and where they came from. */
export interface MemoryRewrite {
  readonly terms: readonly string[];
  readonly synonyms: readonly string[];
  readonly tags: readonly string[];
  readonly source: 'model' | 'cache' | 'fallback';
}
