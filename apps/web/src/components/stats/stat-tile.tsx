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
  /** Marks work that waits on the person (amber, as everywhere else in the app). */
  attention?: boolean;
  /** A "what's this" button for the label, placed once per screen. */
  help?: ReactNode;
}) {
  return (
    <div
      className={`grid content-start gap-1 rounded-xl border p-4 ${
        props.attention ? 'border-attn bg-attn-soft' : 'border-line bg-surface'
      }`}
    >
      <dt className="flex items-center gap-1 text-xs font-medium text-muted">
        {props.label}
        {props.help}
      </dt>
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
