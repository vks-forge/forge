/**
 * A stand-in for the server's paged, filtered, sorted ticket list.
 *
 * Why: the Tickets screen asks the server to filter, sort and page, so a test needs an
 *   endpoint that does so on a known set of tickets, to prove the screen asks for the right
 *   page and draws what comes back. The handler follows the contract the web adapter writes
 *   (`state`, `lane`, `q`, `sort=updated|created|cost`, `limit`, `offset`; answer `{items, total}`).
 *
 * Exports: ticketRows(), ticketsTableRoute(), world(), lastQuery(), rowsOf(), LIST, PAGE, PAGE_SLUG.
 * Depends on: helpers/work-fixtures, helpers/fetch-stub.
 */

import type { TicketSummary } from '@forge/core';
import { screen, within } from '@testing-library/react';
import { json } from '#tests/helpers/fetch-stub.js';
import type { FetchStub, RouteHandler } from '#tests/helpers/fetch-stub.js';
import { ticketSummary } from '#tests/helpers/work-fixtures.js';

export const PAGE_SLUG = 'sample-service';
export const LIST = `GET /projects/${PAGE_SLUG}/tickets`;
export const PAGE = `/p/${PAGE_SLUG}/tickets`;

type Row = TicketSummary;

const STATES: readonly TicketSummary['state'][] = [
  'in_progress',
  'done',
  'review',
  'planned',
];

const LANES: readonly TicketSummary['lane'][] = ['express', 'standard', 'full'];

/** `count` tickets SVC-1.., newest first by id, spread over states and lanes; even ids have a cost. */
export function ticketRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;

    return {
      ...ticketSummary({
        id: `SVC-${n}` as TicketSummary['id'],
        title: `Ticket number ${n}`,
        state: STATES[i % STATES.length] as TicketSummary['state'],
        lane: LANES[i % LANES.length] as TicketSummary['lane'],
        card_id: `SVC-C${(i % 3) + 1}` as NonNullable<TicketSummary['card_id']>,
        updated_at: new Date(Date.UTC(2026, 9, 16, 12, 0, 0) - n * 60_000).toISOString(),
      }),
      ...(n % 2 === 0 ? { cost_usd: n / 10 } : {}),
    };
  });
}

const FIELD = (row: Row, field: string): string | number => {
  const value = (row as unknown as Record<string, string | number | undefined>)[field];

  return value ?? -1;
};

export function ticketsTableRoute(all: readonly Row[]): RouteHandler {
  return ({ query }) => {
    const states = query.get('state')?.split(',');
    const lane = query.get('lane');
    const q = (query.get('q') ?? '').toLowerCase();
    const field =
      { updated: 'updated_at', created: 'created_at', cost: 'cost_usd' }[
        query.get('sort') ?? 'updated'
      ] ?? 'updated_at';

    const limit = Number(query.get('limit') ?? 25);
    const offset = Number(query.get('offset') ?? 0);

    const matching = all
      .filter((r) => !states || states.includes(r.state))
      .filter((r) => !lane || r.lane === lane)
      .filter((r) => q === '' || `${r.id} ${r.title}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = FIELD(a, field);
        const y = FIELD(b, field);
        const order = x < y ? -1 : x > y ? 1 : 0;

        // The server only orders newest or highest first.
        return -order;
      });

    return json({
      items: matching.slice(offset, offset + limit),
      total: matching.length,
    });
  };
}

/** The stubbed server with `count` tickets. */
export const world = (count = 60) => ({ [LIST]: ticketsTableRoute(ticketRows(count)) });

/** The query string of the most recent list request. */
export function lastQuery(stub: FetchStub): URLSearchParams {
  const calls = stub.callsTo(LIST);

  return new URL(`http://x${calls[calls.length - 1]?.path ?? ''}`).searchParams;
}

/** Header row plus body rows of the Tickets table. */
export const rowsOf = () =>
  within(screen.getByRole('table', { name: 'Tickets' })).getAllByRole('row');
