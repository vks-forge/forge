/**
 * Types for drawing a ticket's phase: the chip's tone and the pieces of a wait line.
 *
 * Why: the phase copy (domain) decides tone and cuts a line into text and links; the chip and
 *   line components (components/ticket) draw them. The shared shapes sit here so neither side
 *   imports the other.
 *
 * Exports: PhaseTone, WaitPart.
 * Depends on: nothing. Types only.
 */

/** How a phase is drawn: amber is only ever "waits on you"; red is "look at this". */
export type PhaseTone = 'quiet' | 'live' | 'attn' | 'bad' | 'good';

/** One piece of a wait line: plain text, a ticket to link, or the card to link. */
export type WaitPart =
  | { kind: 'text'; text: string }
  | { kind: 'ticket'; id: string }
  | { kind: 'card'; id: string };
