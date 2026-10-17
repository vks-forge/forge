/**
 * TicketsTable: the project's tickets as a sortable table, or skeleton rows while loading.
 *
 * Why: the owner scans for one ticket among many and needs id, title, parent card, lane, state,
 *   cost and recency side by side. The id and title are real links (keyboard, middle-click,
 *   "open in new tab"); clicking anywhere else on the row opens the ticket too. Column
 *   headers of the two orders the server offers (Updated, Cost) are buttons that set
 *   `aria-sort`, so sorting is reachable without a mouse and announced. A ticket with no reported cost shows a dash, never $0.00. While the next page
 *   loads the rows stay (dimmed) so the table does not jump.
 *
 * Exports: TicketsTable.
 * Depends on: react-router, lucide-react, components/ticket/status-chips, components/ui/scroll-area,
 *   domain/*-paths, domain/relative-time, domain/stats-format, types/tickets-table.types.
 */

import { ArrowDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { LaneChip, StateChip } from '#/components/ticket/status-chips.js';
import { ScrollArea } from '#/components/ui/scroll-area.js';
import { cardPath } from '#/domain/card-paths.js';
import { timeAgo } from '#/domain/relative-time.js';
import { formatUsd } from '#/domain/stats-format.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import { useNow } from '#/state/use-now.js';
import type { TicketSortKey } from '#/schemas/tickets-table.js';
import type { TicketsTableViewProps } from '#/types/tickets-table.types.js';

/** Only the orders the server offers (Updated, Cost) are buttons; the rest are plain headings. */
const COLUMNS: readonly { key: TicketSortKey | null; label: string; right?: boolean }[] =
  [
    { key: null, label: 'Id' },
    { key: null, label: 'Title' },
    { key: null, label: 'Card' },
    { key: null, label: 'Lane' },
    { key: null, label: 'State' },
    { key: 'cost', label: 'Cost', right: true },
    { key: 'updated', label: 'Updated', right: true },
  ];

const CELL = 'px-3 py-2.5 align-middle';
const SKELETON_ROWS = 8;

export function TicketsTable(props: TicketsTableViewProps) {
  const { slug, rows, params, stale, onSort } = props;
  const navigate = useNavigate();
  const now = useNow();

  return (
    <ScrollArea
      orientation="horizontal"
      className="rounded-xl border border-line bg-surface"
    >
      <table
        aria-label="Tickets"
        aria-busy={rows === null || stale}
        className={`w-full min-w-[46rem] border-collapse text-sm ${stale ? 'opacity-60' : ''}`}
      >
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            {COLUMNS.map((col) => {
              const sorted = col.key !== null && params.sort === col.key;

              return (
                <th
                  key={col.label}
                  scope="col"
                  aria-sort={sorted ? 'descending' : undefined}
                  className={`px-3 py-2 font-medium ${col.right ? 'text-right' : ''}`}
                >
                  {col.key === null ? (
                    col.label
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSort(col.key as TicketSortKey)}
                      className="inline-flex items-center gap-1 rounded-md py-1 hover:text-fg"
                    >
                      {col.label}
                      {sorted ? (
                        <ArrowDown aria-hidden="true" className="size-3.5" />
                      ) : null}
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows === null
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  {COLUMNS.map((col) => (
                    <td key={col.label} className={CELL}>
                      <div className="h-4 w-full max-w-24 animate-pulse rounded bg-hover" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('a,button')) {
                      void navigate(ticketPath(slug, row.id));
                    }
                  }}
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-hover"
                >
                  <td className={`${CELL} whitespace-nowrap font-data text-xs`}>
                    <Link to={ticketPath(slug, row.id)} className="hover:underline">
                      {row.id}
                    </Link>
                  </td>
                  <td className={`${CELL} max-w-[26rem]`}>
                    <Link
                      to={ticketPath(slug, row.id)}
                      className="line-clamp-2 font-medium hover:underline"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className={`${CELL} whitespace-nowrap font-data text-xs`}>
                    {row.card_id ? (
                      <Link
                        to={cardPath(slug, row.card_id)}
                        title={row.card_title}
                        className="text-muted hover:text-fg hover:underline"
                      >
                        {row.card_id}
                      </Link>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className={CELL}>
                    <LaneChip lane={row.lane} />
                  </td>
                  <td className={CELL}>
                    <StateChip state={row.state} />
                  </td>
                  <td className={`${CELL} text-right font-data text-xs tabular-nums`}>
                    {formatUsd(row.cost_usd)}
                  </td>
                  <td
                    className={`${CELL} whitespace-nowrap text-right text-xs text-muted`}
                  >
                    <time dateTime={row.updated_at}>{timeAgo(row.updated_at, now)}</time>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}
