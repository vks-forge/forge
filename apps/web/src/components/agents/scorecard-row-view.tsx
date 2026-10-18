/**
 * ScorecardRowView: one slice of a scorecard as a card of plain figures, or the reason it has no verdict.
 *
 * Why: the same row is read for an agent (by slice) and for a pipeline shape, and both must say
 *   the same things the same way. Under five tickets no percentage is shown at all, only "Too few
 *   tickets to judge" with the count, because a rate over three tickets is noise that looks like a
 *   fact. Above it the headline figure leads (passed first time for a check, done without rework
 *   for a writer), then reworks, cost with how many runs were priced, how long it took, how often a
 *   fallback or a substitute ran, and the verdicts on its findings. A figure with no data reads
 *   "No data", never zero.
 *
 * Exports: ScorecardRowView.
 * Depends on: domain/scorecard-copy, schemas/pipeline-proposals (types).
 */

import {
  costText,
  coverageText,
  durationText,
  findingsText,
  headlineFigure,
  insufficientText,
  reworksText,
  rowLabel,
} from '#/domain/scorecard-copy.js';
import type { ScorecardRow } from '#/schemas/pipeline-proposals.js';

export function ScorecardRowView(props: {
  row: ScorecardRow;
  heading?: string;
  /** A short mark beside the heading, such as "Changed by the Director". */
  badge?: string | undefined;
}) {
  const { row } = props;
  const head = headlineFigure(row);
  const findings = findingsText(row);

  return (
    <li className="grid gap-2 rounded-xl border border-line p-3 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="font-medium">{props.heading ?? rowLabel(row)}</span>
        {props.badge === undefined ? null : (
          <span className="rounded border border-signal px-1 text-xs font-medium">
            {props.badge}
          </span>
        )}
        <span className="text-xs text-muted">{`${row.tickets} ticket${row.tickets === 1 ? '' : 's'}, ${row.runs} run${row.runs === 1 ? '' : 's'}`}</span>
      </p>
      {row.insufficient ? (
        <p className="text-muted">{insufficientText(row)}</p>
      ) : (
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-muted">{head.label}</dt>
          <dd className="font-medium">{head.value}</dd>
          <dt className="text-muted">Reworks</dt>
          <dd>{reworksText(row)}</dd>
          <dt className="text-muted">Held for you</dt>
          <dd>{`${row.holds} time${row.holds === 1 ? '' : 's'}, overruled ${row.overrides}`}</dd>
          <dt className="text-muted">Cost</dt>
          <dd>{`${costText(row)} · ${coverageText(row)}`}</dd>
          <dt className="text-muted">Run time</dt>
          <dd>{durationText(row)}</dd>
          {row.fallback_runs > 0 || row.substituted > 0 ? (
            <>
              <dt className="text-muted">Fallbacks</dt>
              <dd>{`${row.fallback_runs} run${row.fallback_runs === 1 ? '' : 's'} on a fallback, ${row.substituted} as a substitute`}</dd>
            </>
          ) : null}
          {findings === null ? null : (
            <>
              <dt className="text-muted">Findings</dt>
              <dd>{findings}</dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
}
