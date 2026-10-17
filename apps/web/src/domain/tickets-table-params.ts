/**
 * Reads and writes the Tickets table state in the URL.
 *
 * Why: filters, sort and page must survive reload, a shared link and back/forward, so the
 *   URL is the state. A link can be old or hand-edited, so each part is read on its own and
 *   falls back to its default when invalid (one bad `page=abc` must not drop the filters
 *   next to it). Defaults are left out of the URL to keep links short.
 *
 * Exports: DEFAULT_PARAMS, parseTicketsParams(), toTicketsSearch(), pageWindow(),
 *   hasActiveFilters().
 * Depends on: schemas/tickets-table, @forge/core. No IO.
 */

import { Lane, TicketStatus } from '@forge/core';
import { TICKETS_DEFAULT_SIZE, TicketSortKey } from '#/schemas/tickets-table.js';
import type { TicketsTableParams } from '#/schemas/tickets-table.js';

export const DEFAULT_PARAMS: TicketsTableParams = {
  states: [],
  lane: null,
  q: '',
  sort: 'updated',
  page: 1,
  size: TICKETS_DEFAULT_SIZE,
};

export function parseTicketsParams(search: URLSearchParams): TicketsTableParams {
  const states = (search.get('state') ?? '')
    .split(',')
    .map((s) => TicketStatus.safeParse(s))
    .flatMap((r) => (r.success ? [r.data] : []));

  const lane = Lane.safeParse(search.get('lane'));
  const sort = TicketSortKey.safeParse(search.get('sort'));
  const page = Number(search.get('page'));
  const size = Number(search.get('size'));
  const base = sort.success ? sort.data : DEFAULT_PARAMS.sort;

  return {
    states: [...new Set(states)],
    lane: lane.success ? lane.data : null,
    // The server refuses a search longer than 100 characters.
    q: (search.get('q') ?? '').trim().slice(0, 100),
    sort: base,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: [10, 25, 50].includes(size) ? size : DEFAULT_PARAMS.size,
  };
}

/** The URL query for `params`, leaving defaults out. */
export function toTicketsSearch(params: TicketsTableParams): URLSearchParams {
  const search = new URLSearchParams();

  if (params.states.length > 0) {
    search.set('state', params.states.join(','));
  }

  if (params.lane) {
    search.set('lane', params.lane);
  }

  if (params.q !== '') {
    search.set('q', params.q);
  }

  if (params.sort !== DEFAULT_PARAMS.sort) {
    search.set('sort', params.sort);
  }

  if (params.page > 1) {
    search.set('page', String(params.page));
  }

  if (params.size !== DEFAULT_PARAMS.size) {
    search.set('size', String(params.size));
  }

  return search;
}

/** The "from–to of total" numbers, one-based; zeros when nothing matches. */
export function pageWindow(
  page: number,
  size: number,
  total: number,
): { from: number; to: number; pages: number } {
  if (total === 0) {
    return { from: 0, to: 0, pages: 1 };
  }

  return {
    from: (page - 1) * size + 1,
    to: Math.min(page * size, total),
    pages: Math.ceil(total / size),
  };
}

export const hasActiveFilters = (params: TicketsTableParams): boolean =>
  params.states.length > 0 || params.lane !== null || params.q !== '';
