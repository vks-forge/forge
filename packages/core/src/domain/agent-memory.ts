/**
 * Agent memory filter — which project memory records an agent sees.
 *
 * Why: a docs writer has no use for the database decisions, and a reviewer should not be
 *   steered by approaches the owner rejected for another job. An agent names the tags it cares
 *   about and whether it sees the rejected list; an empty tag list means the whole slice, which
 *   is what every Worker saw before agents existed. A record with no tags is shown only when
 *   the list is empty, so a filter can only ever show less, never more.
 *
 * Exports: filterMemorySlice().
 * Depends on: types/ports/memory-source. No IO.
 */

import type {
  MemoryFilter,
  MemoryRecordRef,
  MemorySlice,
} from '#/types/ports/memory-source.types.js';

const keep = (r: MemoryRecordRef, tags: readonly string[]): boolean =>
  tags.length === 0 || (r.tags ?? []).some((t) => tags.includes(t));

/** `slice` narrowed to records carrying one of the filter's tags; rejected approaches only when asked for. */
export function filterMemorySlice(slice: MemorySlice, filter: MemoryFilter): MemorySlice {
  return {
    decisions: slice.decisions.filter((r) => keep(r, filter.tags)),
    rejected: filter.include_rejected
      ? slice.rejected.filter((r) => keep(r, filter.tags))
      : [],
  };
}
