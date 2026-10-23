/**
 * HistoryTab (card): what this card went through, with one line per event of its tickets.
 *
 * Why: a card is a request that grows tickets; the owner asks "where did this get to and what
 *   held it up?" at card level first. The card's own phases (grilling, plan, approval, close)
 *   come with one roll-up line per ticket event, and each roll-up links to that ticket's own
 *   History so the detail is one click away without crowding the card's story.
 *
 * Exports: HistoryTab.
 * Depends on: api/use-history, components/history/history-view.
 */

import { useCardHistory } from '#/api/use-history.js';
import { HistoryView } from '#/components/history/history-view.js';

export function HistoryTab(props: { slug: string; cardId: string }) {
  const query = useCardHistory(props.cardId);

  return (
    <HistoryView
      query={query}
      scope={{ kind: 'card', id: props.cardId, slug: props.slug }}
      emptyHint="Entries appear here as the Director talks it through, plans it and turns it into tickets."
    />
  );
}
