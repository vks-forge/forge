/**
 * ReadoutLine: the one-line state of the project: Workers, tickets by state, spend.
 *
 * Why: the first question on opening a project is "is anything happening, and does anything
 *   need me?". The readout answers it in a glance before any chart: how many Workers are
 *   running now, how many tickets sit in each state (only states that have tickets, so the
 *   line stays short), and what was spent today and over the range. Spend is shown only if
 *   runs reported a cost; otherwise it says so rather than printing $0.00, which would read
 *   as "free".
 *
 * Exports: ReadoutLine.
 * Depends on: @forge/core (type), domain/stats-format, domain/board-columns not needed.
 */

import type { ProjectStats } from '@forge/core';
import { formatUsd, rangeLabel } from '#/domain/stats-format.js';

const STATE_WORD: Readonly<Record<string, string>> = {
  inbox: 'in inbox',
  planned: 'planned',
  in_progress: 'in progress',
  blocked: 'blocked',
  waiting_human: 'waiting on you',
  verifying: 'verifying',
  review: 'in review',
  needs_signoff: 'needing sign-off',
  done: 'done',
  cancelled: 'cancelled',
};

export function ReadoutLine(props: { stats: ProjectStats }) {
  const { stats } = props;
  const states = Object.entries(stats.tickets_by_state).filter(
    ([state, n]) => n > 0 && state !== 'cancelled',
  );

  const reported = stats.cost_coverage.runs_with_cost > 0;
  const today = stats.spend_per_day[stats.spend_per_day.length - 1]?.value ?? 0;
  const total = stats.spend_per_day.reduce((sum, p) => sum + p.value, 0);

  return (
    <dl
      aria-label="Project readout"
      className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
    >
      <div className="flex items-baseline gap-1.5">
        <dt className="text-muted">Workers running</dt>
        <dd className="font-data font-medium tabular-nums">{stats.active_workers}</dd>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <dt className="text-muted">Tickets</dt>
        <dd className="flex flex-wrap gap-x-3 gap-y-1">
          {states.length === 0 ? (
            <span className="text-muted">none yet</span>
          ) : (
            states.map(([state, n]) => (
              <span key={state}>
                <span className="font-data font-medium tabular-nums">{n}</span>{' '}
                <span className="text-muted">{STATE_WORD[state] ?? state}</span>
              </span>
            ))
          )}
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="text-muted">Spend today</dt>
        <dd className="font-data font-medium tabular-nums">
          {reported ? formatUsd(today) : 'no cost reported'}
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="text-muted">Spend, {rangeLabel(stats.range)}</dt>
        <dd className="font-data font-medium tabular-nums">
          {reported ? formatUsd(total) : 'no cost reported'}
        </dd>
      </div>
    </dl>
  );
}
