/**
 * useCostPaging: the page of the Top tickets and Top runs tables, one state for both.
 *
 * Why: the two tables page independently (a long run list should not drag the ticket list
 *   along), but switching the date range must send both back to their first page, since the
 *   rows of another range are different rows. Page sizes survive a range change: the owner
 *   chose them. The state is kept in the component, not the URL: a page of a ranking is a
 *   glance, not a place worth bookmarking.
 *
 * Exports: useCostPaging().
 * Depends on: react, domain/cost-paging, types/work-api.types, types/chart.types.
 */

import { useCallback, useState } from 'react';
import { DEFAULT_PAGE_SIZE, resizeOffset } from '#/domain/cost-paging.js';
import type { CostTable, CostPagingState } from '#/types/chart.types.js';
import type { CostPaging } from '#/types/work-api.types.js';

function fresh(range: string, previous?: CostPagingState): CostPagingState {
  return {
    range,
    ticket: { limit: previous?.ticket.limit ?? DEFAULT_PAGE_SIZE, offset: 0 },
    run: { limit: previous?.run.limit ?? DEFAULT_PAGE_SIZE, offset: 0 },
  };
}

export function useCostPaging(range: string) {
  const [state, setState] = useState<CostPagingState>(() => fresh(range));
  const current = state.range === range ? state : fresh(range, state);

  const setOffset = useCallback(
    (table: CostTable, offset: number) =>
      setState({ ...current, [table]: { ...current[table], offset } }),
    [current],
  );

  const setLimit = useCallback(
    (table: CostTable, limit: number) =>
      setState({
        ...current,
        [table]: { limit, offset: resizeOffset(current[table].offset, limit) },
      }),
    [current],
  );

  const paging: CostPaging = { ticket: current.ticket, run: current.run };

  return { paging, setOffset, setLimit };
}
