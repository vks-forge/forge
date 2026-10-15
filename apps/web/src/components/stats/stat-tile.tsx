/**
 * StatTile: one headline figure with its label and a line of context.
 *
 * Why: lead time, rework rate and gate pass rate are all "a number, if there is one". The
 *   server returns null when nothing happened in the window (no ticket finished, no gate ran),
 *   and a tile that rendered that as 0 would read as a perfect or terrible score. A missing
 *   value shows "No data" in the muted colour, with the reason in the note, so the absence is
 *   visible and not mistaken for a result.
 *
 * Exports: StatTile.
 * Depends on: react.
 */

import type { ReactNode } from 'react';

export function StatTile(props: {
  label: string;
  /** `null` renders "No data". */
  value: string | null;
  /** Context: sample size, or why there is no data. */
  note: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1 rounded-xl border border-line bg-surface p-4">
      <dt className="text-xs font-medium text-muted">{props.label}</dt>
      <dd className="grid gap-1">
        <span
          className={`font-data text-2xl font-medium tabular-nums ${
            props.value === null ? 'text-faint' : ''
          }`}
        >
          {props.value ?? 'No data'}
        </span>
        <span className="text-xs text-muted">{props.note}</span>
      </dd>
    </div>
  );
}
