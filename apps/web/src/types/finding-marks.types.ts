/**
 * Where a list of findings is stored, so each can be marked.
 *
 * Why: the owner's "Real" / "False alarm" is saved against a stage row and a finding's position in
 *   that row's own list, not against what is on screen. A findings list that comes from a stored
 *   review is handed this, and one that does not (a Director check, a held-decision card) gets no
 *   toggles. Types only.
 *
 * Exports: FindingMarking.
 * Depends on: @forge/core (types).
 */

import type { StageView } from '@forge/core';

export interface FindingMarking {
  readonly ticketId: string;
  readonly rowId: number;
  readonly marks: StageView['marks'];
}
