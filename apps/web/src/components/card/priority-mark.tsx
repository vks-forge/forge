/**
 * PriorityMark: a card's or planned ticket's priority as an icon with its word.
 *
 * Why: priority is how the owner scans for what matters, and colour alone fails for colour-blind
 *   users and in a screen reader, so the mark is always an icon plus the word. On a card face a
 *   Normal priority says nothing (it is the default and would be noise on every tile); in the
 *   plan every ticket states its priority, so `always` keeps Normal visible there.
 *
 * Exports: PriorityMark.
 * Depends on: lucide-react, domain/priority, schemas/cards (type).
 */

import { ChevronDown, ChevronUp, ChevronsUp, Minus } from 'lucide-react';
import { PRIORITY_LABEL } from '#/domain/priority.js';
import type { CardPriority } from '#/schemas/cards.js';

const ICON = {
  low: ChevronDown,
  normal: Minus,
  high: ChevronUp,
  urgent: ChevronsUp,
} as const;

const TONE: Readonly<Record<CardPriority, string>> = {
  low: 'text-muted',
  normal: 'text-muted',
  high: 'text-fg',
  urgent: 'text-danger',
};

export function PriorityMark(props: { priority: CardPriority; always?: boolean }) {
  if (props.priority === 'normal' && props.always !== true) {
    return null;
  }

  const Icon = ICON[props.priority];

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${TONE[props.priority]}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {PRIORITY_LABEL[props.priority]}
    </span>
  );
}
