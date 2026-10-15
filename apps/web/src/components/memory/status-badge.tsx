/**
 * StatusBadge: the state of a memory record in a word and an icon.
 *
 * Why: the owner scans for two things, what still binds the Director (active) and what waits
 *   on them (pending). Amber is reserved for "needs you", so only a pending proposal wears it;
 *   a superseded decision is greyed and says so in words, because colour alone would fail for
 *   some users. Every state has an icon and a text label.
 *
 * Exports: StatusBadge.
 * Depends on: lucide-react, @forge/core (MemoryStatus type).
 */

import { Ban, Check, History, Hourglass } from 'lucide-react';
import type { MemoryStatus } from '@forge/core';

const LOOK = {
  active: { label: 'Active', Icon: Check, tone: 'bg-signal-soft text-signal' },
  superseded: { label: 'Superseded', Icon: History, tone: 'bg-hover text-muted' },
  pending: { label: 'Needs your answer', Icon: Hourglass, tone: 'bg-attn-soft text-fg' },
  rejected: { label: 'Rejected', Icon: Ban, tone: 'bg-danger-soft text-danger' },
} as const;

export function StatusBadge(props: { status: MemoryStatus }) {
  const { label, Icon, tone } = LOOK[props.status];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${tone}`}
    >
      <Icon aria-hidden="true" className="size-3" />
      {label}
    </span>
  );
}
