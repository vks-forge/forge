/**
 * `useTicketCancel()`: the ticket header's "Cancel ticket…" menu entry and the confirmation it opens.
 *
 * Why: a running ticket the owner no longer wants had no way to be stopped from its own page: the
 *   server only offers Cancel for tickets that wait on the owner, and the dock must not fill with a
 *   fake "needs you" item for every running ticket. So the header's `⋯` menu carries one danger entry,
 *   shown whenever the server says `can_cancel` (an unfinished ticket of an open card). It opens the
 *   same confirmation the escalation buttons use (what is stopped and deleted, the tickets that wait
 *   on it and are cancelled with it, an optional reason), so there is one cancel dialog and one door
 *   to the server (`POST /tickets/:id/act`). On success the toast says so and the ticket refreshes
 *   as Cancelled.
 *
 * Exports: useTicketCancel().
 * Depends on: react, api/use-escalations, components/escalation/escalation-confirmations,
 *   state/notify/notify-context, schemas/tickets (type), types/*.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useActOnTicketWait } from '#/api/use-escalations.js';
import { CancelConfirm } from '#/components/escalation/escalation-confirmations.js';
import type { TicketDetail } from '#/schemas/tickets.js';
import { useNotify } from '#/state/notify/notify-context.js';
import type { EscalationControls } from '#/types/escalation-ui.types.js';
import type { HeaderMenuEntry } from '#/types/work-header.types.js';

export function useTicketCancel(detail: TicketDetail): {
  entries: readonly HeaderMenuEntry[];
  dialog: ReactNode;
} {
  const { ticket } = detail;
  const [open, setOpen] = useState(false);
  const notify = useNotify();
  const mutation = useActOnTicketWait(ticket.id, ticket.card_id);

  if (!detail.can_cancel) {
    return { entries: [], dialog: null };
  }

  const controls: EscalationControls = {
    act: (body, onSuccess, onFailure) => {
      if (mutation.isPending) {
        return;
      }

      mutation.mutate(body, {
        onSuccess: () => {
          notify.success(`${ticket.id} cancelled`);
          onSuccess?.();
        },
        ...(onFailure === undefined ? {} : { onError: onFailure }),
      });
    },
    pending: mutation.isPending ? mutation.variables.action : null,
    error: mutation.error,
    reset: mutation.reset,
  };

  const entries: readonly HeaderMenuEntry[] = [
    {
      kind: 'item',
      key: 'cancel-ticket',
      label: 'Cancel ticket…',
      tone: 'danger',
      onSelect: () => {
        mutation.reset();
        setOpen(true);
      },
    },
  ];

  return {
    entries,
    dialog: (
      <CancelConfirm
        open={open}
        onOpenChange={setOpen}
        controls={controls}
        ticketId={ticket.id}
        dependents={detail.dependents}
      />
    ),
  };
}
