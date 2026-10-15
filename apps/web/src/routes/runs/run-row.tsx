/**
 * RunRow: one Worker run in the Runs list: what it works on, how it is doing, what it cost.
 *
 * Why: the owner scans runs for the stuck, the failed and the expensive. The first line names
 *   the ticket and carries the status word; the second line holds the facts that tell runs
 *   apart (harness, start, duration, cost, tokens) and is truncated, never wrapped, so every
 *   row has the same height and the list can be windowed. A run that reported no cost says
 *   "no cost reported" instead of showing $0.00. Opening a row opens its detail drawer.
 *
 * Exports: RunRow, RUN_ROW_HEIGHT.
 * Depends on: @forge/core (type), components/status/run-status-pill, domain/*.
 */

import type { RunSummary } from '@forge/core';
import { RunStatusPill } from '#/components/status/run-status-pill.js';
import { formatWhen } from '#/domain/format-time.js';
import { formatDuration, formatTokens, formatUsd } from '#/domain/stats-format.js';

export const RUN_ROW_HEIGHT = 72;

export function RunRow(props: { run: RunSummary; onOpen: (id: string) => void }) {
  const { run } = props;
  const tokens = run.tokens ? run.tokens.in + run.tokens.out : null;
  const facts = [
    run.harness,
    formatWhen(run.started_at),
    formatDuration(run.duration_ms),
    run.cost_usd === undefined ? 'no cost reported' : formatUsd(run.cost_usd),
    tokens === null ? null : `${formatTokens(tokens)} tokens`,
  ].filter((fact): fact is string => fact !== null);

  return (
    <button
      type="button"
      onClick={() => props.onOpen(run.id)}
      aria-label={`Open run ${run.id} for ${run.ticket_id}`}
      className="grid h-full w-full content-center gap-1 border-b border-line px-1 text-left hover:bg-hover/50"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-data text-xs text-muted">{run.ticket_id}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {run.ticket_title ?? 'Untitled ticket'}
        </span>
        <RunStatusPill run={run} />
      </span>
      <span className="truncate font-data text-xs text-muted">{facts.join(' · ')}</span>
    </button>
  );
}
