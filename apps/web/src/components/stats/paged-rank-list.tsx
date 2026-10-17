/**
 * PagedRankList: a ranked list with a size picker, Prev/Next and an "x–y of N" line.
 *
 * Why: a project that has run for months has hundreds of runs; the owner wants to walk the
 *   ranking (which ticket ate the budget, which run failed expensively) without a 500-row
 *   page and without the server sending it all. The server pages; this shows where you are,
 *   keeps the list on screen while the next page loads (no flash to a skeleton), and puts
 *   the controls in the same place for both tables. An older server that sends no total
 *   still pages: the total is then what is known so far.
 *
 * Exports: PagedRankList.
 * Depends on: react, components/stats/rank-list, components/ui/button, components/ui/empty-state,
 *   components/ui/toggle-group, domain/cost-paging, types/chart.types.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RankList } from '#/components/stats/rank-list.js';
import { Button } from '#/components/ui/button.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import { PAGE_SIZES, nextOffset, pageLabel, prevOffset } from '#/domain/cost-paging.js';
import type { RankEntry } from '#/types/chart.types.js';

export function PagedRankList(props: {
  label: string;
  entries: readonly RankEntry[];
  offset: number;
  limit: number;
  total: number;
  /** True while a page is loading; the old rows stay and the buttons wait. */
  busy: boolean;
  onOffset: (offset: number) => void;
  onLimit: (limit: number) => void;
}) {
  const { offset, limit, total } = props;
  const prev = prevOffset(offset, limit);
  const next = nextOffset(offset, limit, total);

  return (
    <div className="grid gap-2" aria-busy={props.busy || undefined}>
      <RankList label={props.label} entries={props.entries} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-2">
        <ToggleGroup
          label={`${props.label}: rows per page`}
          value={String(limit)}
          options={PAGE_SIZES.map((size) => ({
            value: String(size),
            label: String(size),
          }))}
          onChange={(value) => props.onLimit(Number(value))}
        />
        <div className="flex items-center gap-2">
          <p role="status" className="font-data text-xs tabular-nums text-muted">
            {pageLabel(offset, props.entries.length, total)}
          </p>
          <Button
            aria-label={`${props.label}: previous page`}
            disabled={prev === null || props.busy}
            onClick={() => prev !== null && props.onOffset(prev)}
            className="min-w-9 px-2"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button
            aria-label={`${props.label}: next page`}
            disabled={next === null || props.busy}
            onClick={() => next !== null && props.onOffset(next)}
            className="min-w-9 px-2"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
