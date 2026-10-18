/**
 * Memory search types — the option bags of the pure search helpers.
 *
 * Why: the query builder, rank fusion, boosts and scope helpers each take a small bag of options. Naming
 *   them once, in the types folder, keeps the helpers pure functions with no declarations of their own
 *   and lets the adapters and the engine pass the same shapes without importing a helper to get a type.
 *
 * Exports: MatchInput, FusedId, BoostFacts, ScopedRecord, ScopeRequest.
 * Depends on: schemas/memory-record (types only). Types only.
 */

import type { MemoryKind, MemoryStatus } from '#/schemas/memory-record.js';

export interface MatchInput {
  readonly terms: readonly string[];
  /** Used only by `or`. */
  readonly synonyms?: readonly string[] | undefined;
  readonly mode: 'and' | 'or';
  /** Star the last of `terms` (when it has three letters or more) so a half-typed word still matches. */
  readonly prefix?: boolean | undefined;
}

export interface FusedId {
  readonly id: string;
  readonly score: number;
}

export interface BoostFacts {
  readonly pinned: boolean;
  readonly status: MemoryStatus;
  readonly kind: MemoryKind;
  readonly ageDays: number;
}

/** The facts of a record that a scope decides on. */
export interface ScopedRecord {
  readonly kind: MemoryKind;
  readonly status: MemoryStatus;
  readonly tags: readonly string[];
}

/** Filters a caller may add on top of a scope; they can only narrow it. */
export interface ScopeRequest {
  readonly kinds?: readonly MemoryKind[] | undefined;
  readonly status?: readonly MemoryStatus[] | undefined;
  readonly tags?: readonly string[] | undefined;
}
