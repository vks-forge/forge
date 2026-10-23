/**
 * Shapes of the confirmation popups' consequence lists.
 *
 * Why: Re-plan, Cancel ticket and Merge anyway each read what they would change and draw it
 *   in the popup, while the popup's confirm button waits for that read. The list and the dialog
 *   are separate pieces, so they share the small read state and the cheaper-action offer
 *   without either importing the query library. Types only.
 *
 * Exports: ConsequenceRead, CheaperAction, ConsequenceWords, ConfirmationBase.
 * Depends on: schemas/escalation (types).
 */

import type { ActionConsequences } from '#/schemas/escalation.js';
import type { EscalationControls } from '#/types/escalation-ui.types.js';

/** The state of the live read: loading, failed (the popup then falls back to its generic words) or ready. */
export interface ConsequenceRead {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly data: ActionConsequences | undefined;
}

/** A cheaper way out of a mechanical stop, offered with its own button inside the Re-plan popup. */
export interface CheaperAction {
  readonly action: 'rework' | 'retry';
  readonly label: string;
  readonly onUse: () => void;
}

/** One line of a consequence list, with the tickets it names (drawn as links, each with an optional note). */
export interface ConsequenceWords {
  readonly text: string;
  readonly tickets?: readonly { id: string; title: string; note?: string }[];
}

/** What every confirmation popup is given: whether it is open, the one act call, and the ticket it names. */
export interface ConfirmationBase {
  open: boolean;
  controls: EscalationControls;
  ticketId: string;
}
