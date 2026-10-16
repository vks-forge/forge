/**
 * PlanDiffView: what changed between a plan version and the one before it.
 *
 * Why: after "Request changes" the Director writes a new version, and the owner should review
 *   only what moved. Each row names the field and shows the old words struck through and the new
 *   words after them (the sign is a word and an icon as well as a colour: "Added", "Removed",
 *   "Changed"). When nothing differs it says so rather than showing an empty box.
 *
 * Exports: PlanDiffView.
 * Depends on: react, lucide-react, types/plan.types.
 */

import { Minus, Pencil, Plus } from 'lucide-react';
import type { DiffRow } from '#/types/plan.types.js';

function kindOf(row: DiffRow): { word: string; Icon: typeof Plus } {
  if (row.before === null) {
    return { word: 'Added', Icon: Plus };
  }

  if (row.after === null) {
    return { word: 'Removed', Icon: Minus };
  }

  return { word: 'Changed', Icon: Pencil };
}

export function PlanDiffView(props: { since: number; rows: readonly DiffRow[] }) {
  return (
    <section
      aria-label={`Changes since v${props.since}`}
      className="grid gap-2 rounded-xl border border-line bg-surface p-3"
    >
      {props.rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing differs from v{props.since}.</p>
      ) : (
        <ul className="grid gap-3">
          {props.rows.map((row) => {
            const { word, Icon } = kindOf(row);

            return (
              <li key={row.field} className="grid gap-0.5 text-sm">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Icon aria-hidden="true" className="size-3.5" />
                  <span>{row.field}</span>
                  <span className="text-faint">({word})</span>
                </p>
                {row.before !== null ? (
                  <p className="min-w-0 break-words text-muted line-through">
                    {row.before}
                  </p>
                ) : null}
                {row.after !== null ? (
                  <p className="min-w-0 break-words">{row.after}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
