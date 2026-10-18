/**
 * Inputs and result of the proposal trigger.
 *
 * Why: whether the Director may propose a change to a project's lane depends on facts the engine collects
 *   (which ticket got which change on which base list, when, from which card, and which keys the owner
 *   already decided on). Naming them keeps the rule a pure function over typed history, so no model output
 *   can influence it.
 *
 * Exports: ProposalHistoryEntry, ProposalSettings, SuppressedKey, ProposalDecision.
 * Depends on: schemas/director-config, schemas/ticket. Types only.
 */

import type { DirectorPipelines } from '#/schemas/director-config.js';
import type { Lane } from '#/schemas/ticket.js';

/** One plan op that was applied to one ticket's pipeline copy. Fallback swaps are never in the history. */
export interface ProposalHistoryEntry {
  readonly ticket_id: string;
  readonly card_id?: string;
  readonly at: string;
  readonly key: string;
  readonly base_hash: string;
  readonly lane: Lane;
  /** The Director's own reason, quoted as evidence. */
  readonly reason: string;
}

export type ProposalSettings = Pick<
  DirectorPipelines,
  'propose_after' | 'propose_min_cards' | 'propose_window_days'
>;

/** A proposal that already exists for this base (pending, accepted, rejected or stale): never proposed again. */
export interface SuppressedKey {
  readonly lane: Lane;
  readonly key: string;
  readonly base_hash: string;
}

/** The trigger's answer: whether to propose, and the matching history it counted (one entry per ticket, newest first). */
export interface ProposalDecision {
  readonly propose: boolean;
  readonly count: number;
  readonly cards: number;
  readonly matching: readonly ProposalHistoryEntry[];
}
