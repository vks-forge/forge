/**
 * HistoryTab (ticket): what this ticket went through and why, oldest first.
 *
 * Why: a ticket moves between Planned, In progress, Needs you, Review and Done, and the owner
 *   must be able to answer "why is it back in Review?" without reading every Worker thread.
 *   The server writes the story in plain language (state changes with their reason, questions
 *   and answers, runs, checks, the merge); this tab loads it and each entry links back to the
 *   run, question or review it came from.
 *
 * Exports: HistoryTab.
 * Depends on: api/use-history, components/history/history-view.
 */

import { useTicketHistory } from '#/api/use-history.js';
import { HistoryView } from '#/components/history/history-view.js';

export function HistoryTab(props: { slug: string; ticketId: string }) {
  const query = useTicketHistory(props.ticketId);

  return (
    <HistoryView
      query={query}
      scope={{ kind: 'ticket', id: props.ticketId, slug: props.slug }}
      emptyHint="Entries appear here as the ticket is planned, worked on, checked and merged."
    />
  );
}
