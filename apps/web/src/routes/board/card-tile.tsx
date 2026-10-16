/**
 * CardTile: one card on the Board's Cards view.
 *
 * Why: a person scanning the Board decides in a second which request to open. The tile shows
 *   what separates cards: the type (icon and label, so the icon is never the only signal), the
 *   title, how far its tickets have got ("2 of 3 tickets done", from the server's roll-up) with
 *   a thin bar of the same counts (nothing estimated), and in amber with a left edge, only for
 *   a card in Needs you, that it waits on the user. The whole tile is one link to the Card page
 *   (d-0116 style); hover and keyboard focus (the ring follows the link inside) show that. It
 *   cannot be dragged: the column is computed from the card's tickets and questions, never set
 *   by hand (d-0107).
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
  const percent =
    card.ticket_count === 0
      ? 0
      : Math.round((card.tickets_done / card.ticket_count) * 100);

  return (
    <article
      className={`relative grid gap-2.5 rounded-xl border bg-surface p-3 transition-[background-color,border-color] duration-150 hover:bg-hover has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-signal motion-reduce:transition-none ${
        needsYou
          ? 'border-attn shadow-[inset_3px_0_0_var(--attn),0_1px_2px_oklch(25%_0.03_255/0.06)]'
          : 'border-line shadow-[0_1px_2px_oklch(25%_0.03_255/0.06)] hover:border-faint'
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
      {card.ticket_count > 0 ? (
        <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-hover">
          <div
            className={`h-full rounded-full ${percent === 100 ? 'bg-good' : 'bg-signal'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {needsYou ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-attn-soft px-1.5 py-0.5 font-medium text-fg">
            <CircleAlert aria-hidden="true" className="size-3.5 text-attn" />
            Needs you
          </span>
        ) : null}
        <span>{progress(card)}</span>
        <span className="ml-auto whitespace-nowrap">{timeAgo(card.updated_at, now)}</span>
      </div>
    </article>
  );
}
