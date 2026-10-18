/**
 * SQL memory index types — the working shapes of the search and related pipelines.
 *
 * Why: search and related each build several ranked lists, fetch the rows behind the ids, and then decide
 *   what to show. These shapes name what the steps hand each other (the rows of the candidates with their
 *   tags, the match each hit came from) so the pipeline files stay small functions over plain data and the
 *   scope rule is applied once, at one point, to every candidate whatever list it came from.
 *
 * Exports: Candidate, Candidates, WidenedScope, SearchFilters.
 * Depends on: @forge/core (types only). Types only.
 */

import type { MemoryKind, MemoryRow, MemoryScope, MemoryStatus } from '@forge/core';

/** A record found by some list, with its tags. */
export interface Candidate {
  readonly row: MemoryRow;
  readonly tags: readonly string[];
}

/** Candidates by id. */
export type Candidates = ReadonlyMap<string, Candidate>;

/** The scope the caller sees, and the wider one the lexical lists run in so an old decision can lead to its successor. */
export interface WidenedScope {
  readonly scope: MemoryScope;
  readonly lexical: MemoryScope;
}

/** Filters a search may add on top of the caller's scope. */
export interface SearchFilters {
  readonly kinds?: readonly MemoryKind[] | undefined;
  readonly status?: readonly MemoryStatus[] | undefined;
  readonly tags?: readonly string[] | undefined;
}
