/**
 * CardTile: one card on the Board's Cards view.
 *
 * Why: a person scanning the Board decides in a second which request to open. The tile shows
 *   what separates cards: the type (icon and label, so the icon is never the only signal), the
 *   title, how far its tickets have got ("2 of 3 tickets done", from the server's roll-up), and
 *   in amber, only for a card in Needs you, that it waits on the user. The whole tile is one
 *   link to the Card page (d-0116 style). It cannot be dragged: the column is computed from the
 *   card's tickets and questions, never set by hand (d-0107).
 *
 * Exports: CardTile.
 * Depends on: react, react-router, lucide-react, @forge/core (types), components/card/*,
 *   domain/card-paths, domain/relative-time.
 */

import type { CardSummary, CardType } from '@forge/core';
import { CircleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { CardTypeIcon, labelOfType } from '#/components/card/card-type-icon.js';
import { cardPath } from '#/domain/card-paths.js';
import { timeAgo } from '#/domain/relative-time.js';

function progress(card: CardSummary): string {
  if (card.ticket_count === 0) {
    return 'No tickets yet';
  }

  return `${card.tickets_done} of ${card.ticket_count} ticket${card.ticket_count === 1 ? '' : 's'} done`;
}

export function CardTile(props: {
  card: CardSummary;
  types: readonly CardType[] | undefined;
  now: number;
}) {
  const { card, types, now } = props;
  const needsYou = card.column === 'needs_you';
  const icon = types?.find((type) => type.name === card.type)?.icon;

  return (
    <article
      className={`relative grid gap-2 rounded-xl border bg-surface p-3 shadow-[0_1px_2px_oklch(25%_0.03_255/0.06)] transition-[background-color,border-color] duration-150 hover:bg-hover focus-within:bg-hover ${
        needsYou ? 'border-attn' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CardTypeIcon icon={icon} className="size-3.5" />
          {labelOfType(types, card.type)}
        </span>
        <span className="whitespace-nowrap font-data">{card.id}</span>
      </div>
      <h3 className="text-sm font-medium leading-snug">
        <Link
          to={cardPath(card.project, card.id)}
          className="text-fg no-underline after:absolute after:inset-0 after:rounded-xl hover:no-underline"
        >
          {card.title}
        </Link>
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {needsYou ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-attn-soft px-1.5 py-0.5 font-medium text-fg">
            <CircleAlert aria-hidden="true" className="size-3.5 text-attn" />
            Needs you
          </span>
        ) : null}
        <span>{progress(card)}</span>
        <span className="ml-auto">{timeAgo(card.updated_at, now)}</span>
      </div>
    </article>
  );
}
