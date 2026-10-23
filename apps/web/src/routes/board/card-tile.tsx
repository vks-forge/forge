/**
 * CardTile: one card on the Board's Cards view.
 *
 * Why: a person scanning the Board decides in a second which request to open. The tile shows
 *   what separates cards: the type (icon and label, so the icon is never the only signal), the
 *   title, how far its tickets have got ("2 of 3 tickets done", from the server's roll-up) with
 *   a thin bar of the same counts (nothing estimated; cancelled tickets are out of the count and named
 *   in the label, so a finished card's bar is full), and in amber with a left edge, only for
 *   a card in Needs you, that it waits on the user. The whole tile is one link to the Card page
 *   (d-0116 style); hover and keyboard focus (the ring follows the link inside) show that. The
 *   phase line sits under the title in words ("Grilling · 3 open points", "Plan v2 ready", "4/7
 *   tickets"; the column says where the card is, the phase says what is happening), a priority
 *   mark appears for anything but Normal, and dependencies show as chips by id: "Blocked by"
 *   what it waits for and "Blocks" what waits for it, so the order of work is readable from the
 *   Board. Hovering or focusing a tile reports it to the Board, which dims every card outside
 *   its dependency chain (the tile only draws `dimmed`). A card that has spent money shows the
 *   total as a small muted figure (its tooltip says only recorded cost is counted). The tile is memoised: with 60 cards a
 *   hover re-renders only the tiles whose dimming changed. It cannot be dragged: the column is
 *   computed from the card's tickets and questions, never set by hand (d-0107).
 *
 *   The roll-up line under the bar says how its tickets stand ("4 of 11 done · 2 running · 1 waiting for you", plus cancelled), from the server's counts.
 *
 * Exports: CardTile.
 * Depends on: react, react-router, lucide-react, motion/react, @forge/core (types), components/card/*,
 *   domain/card-paths, domain/card-phase, domain/relative-time, domain/tile-progress, schemas/cards (types).
 */

import type { CardType } from '@forge/core';
import { CircleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';
import { Link } from 'react-router';
import { CostChip } from '#/components/cost/cost-chip.js';
import { CardTypeIcon, labelOfType } from '#/components/card/card-type-icon.js';
import { PriorityMark } from '#/components/card/priority-mark.js';
import { cardPath } from '#/domain/card-paths.js';
import {
  dependencyChips,
  phaseLabel,
  phaseLine,
  progressLabel,
} from '#/domain/card-phase.js';
import { timeAgo } from '#/domain/relative-time.js';
import { cardRollup } from '#/domain/tile-progress.js';
import type { CardSummary } from '#/schemas/cards.js';

export const CardTile = memo(function CardTile(props: {
  card: CardSummary;
  types: readonly CardType[] | undefined;
  now: number;
  /** Outside the dependency chain of the hovered or focused card. */
  dimmed: boolean;
  /** Called with this card's id on hover or focus, and with null when it ends. */
  onHighlight: (id: string | null) => void;
}) {
  const { card, types, now, onHighlight } = props;
  const needsYou = card.column === 'needs_you';
  const rollup = cardRollup(card);
  // The roll-up line already says "4 of 11 done", so an in-progress card's phase line drops its own count.
  const phase =
    rollup !== null && card.phase === 'in_progress' ? phaseLabel(card) : phaseLine(card);

  const chips = dependencyChips(card);
  const icon = types?.find((type) => type.name === card.type)?.icon;
  const percent =
    card.ticket_count === 0
      ? 0
      : Math.round((card.tickets_done / card.ticket_count) * 100);

  return (
    <article
      data-card={card.id}
      data-dimmed={props.dimmed}
      onMouseEnter={() => onHighlight(card.id)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(card.id)}
      onBlur={() => onHighlight(null)}
      className={`relative grid gap-2.5 rounded-xl border bg-surface p-3 transition-[background-color,border-color,opacity] duration-150 hover:bg-hover has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-signal motion-reduce:transition-none ${
        props.dimmed ? 'opacity-40' : ''
      } ${
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
      {phase !== null || card.priority !== 'normal' ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {phase !== null ? (
            <motion.span
              key={phase}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="font-medium"
            >
              {phase}
            </motion.span>
          ) : null}
          <PriorityMark priority={card.priority} />
        </p>
      ) : null}
      {chips.length > 0 ? (
        <ul aria-label="Dependencies" className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-md bg-hover px-1.5 py-0.5 text-xs text-muted"
            >
              {chip.id === null ? (
                `+${chip.more} more ${chip.direction === 'blocks' ? 'blocked' : 'blockers'}`
              ) : (
                <>
                  {chip.direction === 'blocks' ? 'Blocks' : 'Blocked by'}
                  <span className="font-data text-fg">{chip.id}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {card.ticket_count > 0 ? (
        <div
          role="progressbar"
          aria-label={progressLabel(card)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1 overflow-hidden rounded-full bg-hover"
        >
          <div
            className={`h-full rounded-full ${percent === 100 ? 'bg-good' : 'bg-signal'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
      {rollup !== null ? (
        <p className="min-w-0 truncate text-xs text-muted" title={rollup}>
          {rollup}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {needsYou ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-attn-soft px-1.5 py-0.5 font-medium text-fg">
            <CircleAlert aria-hidden="true" className="size-3.5 text-attn" />
            Needs you
          </span>
        ) : null}
        {card.ticket_count === 0 ? <span>No tickets yet</span> : null}
        <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
          {card.cost_usd !== undefined && card.cost_usd > 0 ? (
            <CostChip
              usd={card.cost_usd}
              label={`Cost of ${card.id}`}
              className="relative z-10"
            />
          ) : null}
          {timeAgo(card.updated_at, now)}
        </span>
      </div>
    </article>
  );
});
