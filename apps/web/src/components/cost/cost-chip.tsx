/**
 * CostChip: a small muted dollar figure with its explanation on hover and focus.
 *
 * Why: cost belongs on every card and ticket the owner looks at, but quietly: a number that
 *   shouts competes with the thing that needs a decision. The figure is small and muted; the
 *   words that make it honest (the Director / tickets split, "not recorded", "only recorded
 *   cost is counted") live in the app's tooltip, reachable by keyboard, and are also in the
 *   accessible name so a screen reader hears them without hovering. A missing figure is a
 *   dash, never `$0.00`.
 *
 * Exports: CostChip.
 * Depends on: react, components/ui/tooltip, domain/cost-display.
 */

import type { ReactNode } from 'react';
import { Tooltip } from '#/components/ui/tooltip.js';
import { COST_FLOOR_NOTE, COST_NOT_RECORDED, costText } from '#/domain/cost-display.js';

export function CostChip(props: {
  usd: number | null | undefined;
  /** False when the harness reported nothing for this item. */
  recorded?: boolean;
  /** Labelled amounts shown under the total, such as the Director / tickets split. */
  split?: readonly { label: string; text: string }[];
  /** Names what the figure covers ("Cost of this card"); read by assistive tech. */
  label: string;
  className?: string;
}) {
  const { usd, recorded = true } = props;
  const missing = !recorded || usd === null || usd === undefined;
  const text = costText(usd, recorded);

  // The split is part of the answer to "what does this cover?"; the floor note is repeated per
  // cell in a table, so it is left to the tooltip and the table's own caption line.
  const words = missing
    ? COST_NOT_RECORDED
    : props.split
      ? `${props.split.map((line) => `${line.label} ${line.text}`).join(', ')}. ${COST_FLOOR_NOTE}`
      : '';

  const tip: ReactNode = (
    <span className="grid gap-0.5">
      {missing || props.split === undefined
        ? null
        : props.split.map((line) => (
            <span key={line.label} className="flex justify-between gap-4">
              <span>{line.label}</span>
              <span className="font-data">{line.text}</span>
            </span>
          ))}
      <span>{missing ? COST_NOT_RECORDED : COST_FLOOR_NOTE}</span>
    </span>
  );

  return (
    <Tooltip content={tip}>
      <span
        tabIndex={0}
        className={`rounded-sm font-data text-xs tabular-nums text-muted ${props.className ?? ''}`}
      >
        <span aria-hidden="true">{text}</span>
        <span className="sr-only">
          {props.label}: {missing ? 'not recorded' : text}. {words}
        </span>
      </span>
    </Tooltip>
  );
}
