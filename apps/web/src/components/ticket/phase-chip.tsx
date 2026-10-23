/**
 * PhaseChip and WaitLine: where a ticket really is, in words, and the one line that says why.
 *
 * Why: "In progress" does not tell the owner whether a Worker is running or the ticket is
 *   queued behind another one. The server derives a phase and a plain line for every ticket
 *   (`wait`); this draws them the same way on the Board, the card's Tickets tab and the Ticket
 *   page. The chip is a word plus an icon (never colour alone), amber only for "Waiting for you".
 *   The line names the tickets and the card involved as links, so "waiting for a Worker slot
 *   (CHE-3 is working)" is one click from CHE-3. On a Board tile the whole tile is a link, so
 *   links inside it are raised above the overlay (`raised`). Both refresh with the queries the
 *   project stream already invalidates; nothing here polls.
 *
 * Exports: PhaseChip, WaitLine.
 * Depends on: react-router, lucide-react, @forge/core (type), components/ticket/ticket-link,
 *   domain/card-paths, domain/ticket-phase-copy, types/ticket-phase.types.
 */

import type { TicketPhase, TicketWait } from '@forge/core';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  Clock,
  Hourglass,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { cardPath } from '#/domain/card-paths.js';
import { PHASE_COPY, splitWaitText } from '#/domain/ticket-phase-copy.js';
import type { PhaseTone } from '#/types/ticket-phase.types.js';

const TONE_CLASS: Readonly<Record<PhaseTone, string>> = {
  quiet: 'bg-hover text-muted',
  live: 'bg-hover text-signal',
  attn: 'bg-attn-soft text-fg',
  bad: 'bg-danger-soft text-fg',
  good: 'bg-hover text-good',
};

const PHASE_ICON: Readonly<Record<TicketPhase, LucideIcon>> = {
  queued: Clock,
  setting_up: CircleDashed,
  waiting_slot: Hourglass,
  waiting_deps: Hourglass,
  held_by_plan: Hourglass,
  paused_quota: Clock,
  backing_off: Clock,
  working: CircleDot,
  checking: CircleDot,
  waiting_you: CircleAlert,
  stuck: CircleAlert,
  done: CircleCheck,
  cancelled: CircleX,
};

export function PhaseChip(props: { phase: TicketPhase; className?: string }) {
  const { label, tone } = PHASE_COPY[props.phase];
  const Icon = PHASE_ICON[props.phase];

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]} ${props.className ?? ''}`}
    >
      <Icon
        aria-hidden="true"
        className={`size-3.5 ${tone === 'attn' ? 'text-attn' : ''}`}
      />
      {label}
    </span>
  );
}

export function WaitLine(props: {
  wait: TicketWait;
  slug: string;
  /** True inside a tile that is itself a link: lifts the inner links above its overlay. */
  raised?: boolean;
  className?: string;
}) {
  const lift = props.raised === true ? 'relative z-10' : '';

  return (
    <p className={`min-w-0 break-words text-xs text-muted ${props.className ?? ''}`}>
      {splitWaitText(props.wait).map((part, index) => {
        if (part.kind === 'text') {
          return <span key={index}>{part.text}</span>;
        }

        if (part.kind === 'card') {
          return (
            <Link
              key={index}
              to={cardPath(props.slug, part.id)}
              className={`${lift} rounded-sm font-data font-medium text-signal underline-offset-2 hover:underline`}
            >
              {part.id}
            </Link>
          );
        }

        return <TicketLink key={index} id={part.id} slug={props.slug} className={lift} />;
      })}
    </p>
  );
}
