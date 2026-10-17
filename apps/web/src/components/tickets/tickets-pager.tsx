/**
 * TicketsPager: "x–y of N", previous/next and the page-size picker under the Tickets table.
 *
 * Why: the list is paged on the server, so the owner needs to know where they are in it and
 *   how much is left. Previous and next are disabled at the ends (not hidden, so the layout
 *   holds still), and a different page size starts again from page one so the visible
 *   window never lands past the end.
 *
 * Exports: TicketsPager.
 * Depends on: components/ui/button, components/ui/picker, domain/tickets-table-params,
 *   schemas/tickets-table, types/tickets-table.types.
 */

import { Button } from '#/components/ui/button.js';
import { Picker } from '#/components/ui/picker.js';
import { pageWindow } from '#/domain/tickets-table-params.js';
import { TICKETS_PAGE_SIZES } from '#/schemas/tickets-table.js';
import type { TicketsPagerProps } from '#/types/tickets-table.types.js';

export function TicketsPager(props: TicketsPagerProps) {
  const { params, total, onChange } = props;
  const { from, to, pages } = pageWindow(params.page, params.size, total);

  return (
    <nav
      aria-label="Ticket pages"
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <div className="flex items-center gap-2 text-muted">
        <span id="tickets-size-label">Rows per page</span>
        <Picker
          aria-labelledby="tickets-size-label"
          size="sm"
          value={String(params.size)}
          items={TICKETS_PAGE_SIZES.map((size) => ({
            value: String(size),
            label: String(size),
          }))}
          onChange={(size) => onChange({ size: Number(size), page: 1 })}
          className="w-20"
        />
      </div>
      <div className="flex items-center gap-3">
        <p role="status" className="font-data text-xs text-muted">
          {from}–{to} of {total}
        </p>
        <Button
          aria-label="Previous page"
          disabled={params.page <= 1}
          onClick={() => onChange({ page: params.page - 1 })}
        >
          Previous
        </Button>
        <Button
          aria-label="Next page"
          disabled={params.page >= pages}
          onClick={() => onChange({ page: params.page + 1 })}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
