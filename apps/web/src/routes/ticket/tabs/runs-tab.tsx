/**
 * RunsTab: every attempt a Worker made on this ticket, with its status, length and cost.
 *
 * Why: after "what is it doing?" comes "how many tries has it taken and what did they cost?".
 *   The list shows each run newest first with its status (a word and an icon), harness, when it
 *   started, how long it ran (or "running"), whether it retried another, the model it used and whether it
 *   ran on a fallback or as a substitute (who wrote the code), and its cost: the
 *   recorded dollars, or "not recorded" when the harness reported none, never `$0.00`. Picking a
 *   run opens it in the Conversation tab (`?run=`), so the thread of that attempt is one click
 *   away and the link can be shared. Under each run, "Pages this run read" lists the web pages its
 *   Worker fetched (loaded when opened).
 *
 * Exports: RunsTab.
 * Depends on: react, react-router, lucide-react, components/cost/cost-chip, components/ticket/*,
 *   components/ui/empty-state, domain/director-change-copy, domain/relative-time, domain/run-status, domain/stats-format,
 *   domain/ticket-paths, state/use-now, schemas/tickets (type).
 */

import { Activity, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { CostChip } from '#/components/cost/cost-chip.js';
import { RunSources } from '#/components/research/run-sources.js';
import { RunChip } from '#/components/ticket/status-chips.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { slotWords } from '#/domain/director-change-copy.js';
import { timeAgo } from '#/domain/relative-time.js';
import { isRunLive } from '#/domain/run-status.js';
import { formatDuration } from '#/domain/stats-format.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import type { TicketDetail } from '#/schemas/tickets.js';
import { useNow } from '#/state/use-now.js';

/** "Pages read" under a run: loads the run's sources only when opened, since most runs read none. */
function RunSourcesToggle(props: { runId: string }) {
  const [open, setOpen] = useState(false);
  const panel = `run-sources-${props.runId}`;

  return (
    <div className="grid gap-1 px-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-9 w-fit items-center gap-0.5 rounded-md px-1 text-xs font-medium text-signal hover:bg-hover"
      >
        <ChevronRight
          aria-hidden="true"
          className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
        Pages this run read
      </button>
      {open ? (
        <div id={panel} className="rounded-lg border border-line bg-surface px-3 py-1">
          <RunSources runId={props.runId} />
        </div>
      ) : null}
    </div>
  );
}

export function RunsTab(props: {
  slug: string;
  detail: TicketDetail;
  /** The run the Conversation tab is showing. */
  selectedId: string | undefined;
}) {
  const now = useNow();
  const { detail } = props;
  const runs = [...detail.runs].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const costs = new Map((detail.cost?.by_run ?? []).map((run) => [run.run_id, run]));

  if (runs.length === 0) {
    return (
      <EmptyState icon={Activity} title="No Worker has run on this ticket yet">
        Runs appear here as soon as a Worker starts.
      </EmptyState>
    );
  }

  return (
    <section aria-label="Runs" className="mx-auto grid max-w-3xl gap-2">
      <h2 className="sr-only">Runs</h2>
      <ul className="grid gap-2">
        {runs.map((run) => {
          const cost = costs.get(run.id);
          const selected = run.id === props.selectedId;
          const ended = run.ended_at === undefined ? undefined : Date.parse(run.ended_at);
          const took = isRunLive(run.status)
            ? 'running'
            : ended === undefined
              ? '—'
              : formatDuration(ended - Date.parse(run.started_at));

          return (
            <li key={run.id}>
              <Link
                to={ticketPath(props.slug, detail.ticket.id, 'conversation', run.id)}
                aria-current={selected ? 'true' : undefined}
                className={`grid gap-1 rounded-xl border p-3 text-sm no-underline transition-colors duration-150 hover:bg-hover ${
                  selected ? 'border-faint bg-hover' : 'border-line bg-surface'
                }`}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-data text-xs">{run.id}</span>
                  <RunChip status={run.status} />
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>
                    {run.model === undefined
                      ? run.harness
                      : `${run.harness} · ${run.model}`}
                  </span>
                  {slotWords(run.fallback_slot) === undefined ? null : (
                    <span className="font-medium text-fg">
                      {slotWords(run.fallback_slot)}
                    </span>
                  )}
                  <span>started {timeAgo(run.started_at, now)}</span>
                  <span>
                    <span className="sr-only">Duration </span>
                    {took}
                  </span>
                  {run.retry_of ? <span>retry of {run.retry_of}</span> : null}
                  <CostChip
                    usd={cost?.usd ?? run.cost_usd}
                    recorded={cost?.recorded ?? run.cost_usd !== undefined}
                    label={`Cost of ${run.id}`}
                    className="ml-auto"
                  />
                </span>
              </Link>
              <RunSourcesToggle runId={run.id} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
