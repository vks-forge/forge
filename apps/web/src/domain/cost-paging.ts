/**
 * Paging arithmetic of the Cost tables: which rows are shown and where Prev/Next lead.
 *
 * Why: Top tickets and Top runs are paged by the server, so the screen only knows an offset,
 *   a page size and a total. The words "11-20 of 134", the disabled edges and the offset a size
 *   change must land on all come from these few rules; keeping them pure means an off-by-one
 *   cannot hide in markup and a total the server did not send (an older server) still pages.
 *
 * Exports: PAGE_SIZES, DEFAULT_PAGE_SIZE, pageLabel(), prevOffset(), nextOffset(), resizeOffset().
 * Depends on: nothing. No IO.
 */

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

/** `11–20 of 134`, or `0 of 0` when there is nothing. */
export function pageLabel(offset: number, shown: number, total: number): string {
  if (total === 0 || shown === 0) {
    return '0 of 0';
  }

  return `${offset + 1}–${offset + shown} of ${total}`;
}

export function prevOffset(offset: number, limit: number): number | null {
  return offset <= 0 ? null : Math.max(0, offset - limit);
}

export function nextOffset(offset: number, limit: number, total: number): number | null {
  return offset + limit >= total ? null : offset + limit;
}

/** A new page size keeps the first visible row on screen by snapping to a page boundary. */
export function resizeOffset(offset: number, newLimit: number): number {
  return Math.floor(offset / newLimit) * newLimit;
}
