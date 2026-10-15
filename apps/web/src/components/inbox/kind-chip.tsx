/**
 * KindChip: the small label that says what an inbox item is (Question, Review, Gate failed).
 *
 * Why: the title alone does not say whether an item waits on a decision or just informs, and
 *   the user scans a list for the first kind. Items that need an action get the amber
 *   attention fill (amber means "needs you", nothing else uses it); informing items stay
 *   neutral. The word is always shown, so the difference is not colour alone.
 *
 * Exports: KindChip.
 * Depends on: @forge/core (type), domain/inbox-links.
 */

import type { InboxItem } from '@forge/core';
import { INBOX_KIND_LABEL } from '#/domain/inbox-links.js';

export function KindChip(props: { item: Pick<InboxItem, 'kind' | 'needs_action'> }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${
        props.item.needs_action ? 'bg-attn-soft text-fg' : 'bg-hover text-muted'
      }`}
    >
      {INBOX_KIND_LABEL[props.item.kind]}
    </span>
  );
}
