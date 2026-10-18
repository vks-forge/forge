/**
 * Memory search state and its URL form.
 *
 * Why: the owner searches memory to answer "did we already decide this?", and a link, Back or
 *   a reload must bring the same answer back, so the query and every chip live in the address
 *   (`?q=tdd&kind=decision&status=active&tag=testing&superseded=1`), not in component state.
 *   Reading is forgiving (an unknown kind or status in a hand-edited link is dropped, never
 *   sent to the server) and writing is tidy (an empty value leaves no key), so equal searches
 *   have equal URLs. A query under two characters is not searched: one letter matches almost
 *   everything and costs a request per keystroke.
 *
 * Exports: MIN_QUERY_LENGTH, SEARCH_KINDS, SEARCH_STATUSES, readSearchState(), writeSearchState(),
 *   isSearching(), hasChipFilters(), EMPTY_SEARCH.
 * Depends on: @forge/core (types), types/memory.types. No IO.
 */

import type { MemoryKind, MemoryStatus } from '@forge/core';
import type { MemorySearchState } from '#/types/memory.types.js';

export const MIN_QUERY_LENGTH = 2;

export const SEARCH_KINDS: readonly MemoryKind[] = [
  'decision',
  'rejected',
  'proposal',
  'outcome',
];

/** Superseded is the "Include superseded" switch, not a chip, so it is not listed here. */
export const SEARCH_STATUSES: readonly MemoryStatus[] = ['active', 'pending', 'rejected'];

/** A shared link may name `status=superseded`; the server accepts it, so it is kept. */
const READABLE_STATUSES: readonly MemoryStatus[] = [...SEARCH_STATUSES, 'superseded'];

export const EMPTY_SEARCH: MemorySearchState = {
  q: '',
  kinds: [],
  statuses: [],
  tags: [],
  superseded: false,
};

const KEYS = ['q', 'kind', 'status', 'tag', 'superseded'] as const;

function allowed<T extends string>(values: string[], list: readonly T[]): T[] {
  // Repeated and comma-separated forms both occur in links people share.
  const seen = values.flatMap((value) => value.split(',')).map((v) => v.trim());

  return list.filter((item) => seen.includes(item));
}

export function readSearchState(params: URLSearchParams): MemorySearchState {
  return {
    q: params.get('q') ?? '',
    kinds: allowed(params.getAll('kind'), SEARCH_KINDS),
    statuses: allowed(params.getAll('status'), READABLE_STATUSES),
    tags: [
      ...new Set(
        params
          .getAll('tag')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ],
    superseded: params.get('superseded') === '1',
  };
}

/** The params with the search keys replaced by `next`; other keys (none today) are kept. */
export function writeSearchState(
  base: URLSearchParams,
  next: MemorySearchState,
): URLSearchParams {
  const out = new URLSearchParams(base);
  for (const key of KEYS) {
    out.delete(key);
  }

  if (next.q !== '') {
    out.set('q', next.q);
  }

  for (const kind of next.kinds) {
    out.append('kind', kind);
  }

  for (const status of next.statuses) {
    out.append('status', status);
  }

  for (const tag of next.tags) {
    out.append('tag', tag);
  }

  if (next.superseded) {
    out.set('superseded', '1');
  }

  return out;
}

/** True when the query is long enough to send to the server. */
export function isSearching(state: Pick<MemorySearchState, 'q'>): boolean {
  return state.q.trim().length >= MIN_QUERY_LENGTH;
}

/** Whether any chip narrows the search, so "Clear filters" has something to clear. */
export function hasChipFilters(state: MemorySearchState): boolean {
  return (
    state.kinds.length > 0 ||
    state.statuses.length > 0 ||
    state.tags.length > 0 ||
    state.superseded
  );
}
