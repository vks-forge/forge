/**
 * Ticket phase copy: the plain words for where a ticket really is, and how a wait line names
 * the tickets and card it mentions.
 *
 * Why: a ticket's status ("In progress") does not say whether a Worker is running or the ticket
 *   is queued behind another one; the server derives a phase for that (core `derivePhase`) and
 *   the owner reads these words on the Board, the card's Tickets tab and the Ticket page. Keeping
 *   the label, the tone and the "who to link" split in one pure file means the three surfaces say
 *   the same thing and a new phase cannot reach the screen unlabelled (the table is typed over
 *   core's `TicketPhase`, so a phase added there fails the build here).
 *
 * Exports: PHASE_COPY, phaseLabel(), showsWaitLine(), splitWaitText().
 * Depends on: @forge/core (TicketPhase, TicketWait types), types/ticket-phase.types. No IO.
 */

import type { TicketPhase, TicketWait } from '@forge/core';
import type { PhaseTone, WaitPart } from '#/types/ticket-phase.types.js';

export const PHASE_COPY: Readonly<
  Record<TicketPhase, { label: string; tone: PhaseTone }>
> = {
  queued: { label: 'Queued', tone: 'quiet' },
  setting_up: { label: 'Setting up', tone: 'quiet' },
  waiting_slot: { label: 'Waiting for a slot', tone: 'quiet' },
  waiting_deps: { label: 'Waiting on other tickets', tone: 'quiet' },
  held_by_plan: { label: 'Held by re-plan', tone: 'quiet' },
  paused_quota: { label: 'Paused (quota)', tone: 'quiet' },
  backing_off: { label: 'Retrying soon', tone: 'quiet' },
  working: { label: 'Working', tone: 'live' },
  checking: { label: 'Checking', tone: 'live' },
  waiting_you: { label: 'Waiting for you', tone: 'attn' },
  stuck: { label: 'Needs a look (stuck)', tone: 'bad' },
  done: { label: 'Done', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'quiet' },
};

export function phaseLabel(phase: TicketPhase): string {
  return PHASE_COPY[phase].label;
}

/** Phases whose line adds something; "Working", "Done" and the like say it all in the chip. */
const SELF_EXPLAINING: ReadonlySet<TicketPhase> = new Set([
  'working',
  'done',
  'cancelled',
  'waiting_you',
]);

export function showsWaitLine(phase: TicketPhase): boolean {
  return !SELF_EXPLAINING.has(phase);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cuts the line at every mentioned ticket id and the card id so each can be a link. An id the
 * text does not mention is added at the end in brackets, so every holder and blocker stays
 * reachable whatever words the server used.
 */
export function splitWaitText(wait: TicketWait): readonly WaitPart[] {
  const tickets = [...new Set([...(wait.holders ?? []), ...(wait.blockers ?? [])])];
  const ids: readonly string[] = [
    ...tickets,
    ...(wait.card_id === undefined ? [] : [wait.card_id]),
  ];

  const unmentioned = ids.filter(
    (id) => !new RegExp(`(?<![\\w-])${escapeRegExp(id)}(?![\\w-])`).test(wait.text),
  );

  const mentioned = ids.filter((id) => !unmentioned.includes(id));
  const parts: WaitPart[] = [];

  if (mentioned.length === 0) {
    parts.push({ kind: 'text', text: wait.text });
  } else {
    const pattern = new RegExp(
      `(?<![\\w-])(${mentioned.map(escapeRegExp).join('|')})(?![\\w-])`,
    );

    for (const piece of wait.text.split(pattern)) {
      if (piece === '') {
        continue;
      }

      parts.push(
        mentioned.includes(piece)
          ? { kind: piece === wait.card_id ? 'card' : 'ticket', id: piece }
          : { kind: 'text', text: piece },
      );
    }
  }

  unmentioned.forEach((id, index) => {
    parts.push({ kind: 'text', text: index === 0 ? ' (' : ', ' });
    parts.push({ kind: id === wait.card_id ? 'card' : 'ticket', id });
  });

  if (unmentioned.length > 0) {
    parts.push({ kind: 'text', text: ')' });
  }

  return parts;
}
