/**
 * GateStrip and RunsList: the ticket's checks and its attempts.
 *
 * Why: two questions follow "what is this ticket doing?": did it pass its checks, and how many
 *   times has a Worker tried? The strip shows the latest result of each gate that has run
 *   (G1 first), each with an icon and a word, never colour alone; gates that have not run
 *   are simply absent, and an empty strip says so. The runs list shows every attempt newest
 *   first, marks retries, and selecting one switches the thread to that run's history.
 *
 * Exports: GateStrip, RunsList, latestGates().
 * Depends on: react, lucide-react, @forge/core (types), components/ticket/status-chips,
 *   domain/relative-time.
 */

import type { GateResult, Run } from '@forge/core';
import {
  Activity,
  CircleCheck,
  CircleDashed,
  CircleX,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { RunChip } from '#/components/ticket/status-chips.js';
import { timeAgo } from '#/domain/relative-time.js';
import { EmptyState } from '#/components/ui/empty-state.js';

/** The newest result of each gate, in gate order (G1 first). */
export function latestGates(results: readonly GateResult[]): readonly GateResult[] {
  const newest = new Map<string, GateResult>();
  for (const result of results) {
    const seen = newest.get(result.gate);
    if (!seen || result.started_at >= seen.started_at) {
      newest.set(result.gate, result);
    }
  }

  return [...newest.values()].sort((a, b) => a.gate.localeCompare(b.gate));
}

const GATE_VIEW = {
  passed: { icon: CircleCheck, text: 'text-good', word: 'passed' },
  failed: { icon: CircleX, text: 'text-danger', word: 'failed' },
  skipped: { icon: CircleDashed, text: 'text-muted', word: 'skipped' },
  error: { icon: TriangleAlert, text: 'text-danger', word: 'errored' },
} as const;

export function GateStrip(props: { results: readonly GateResult[] }) {
  const gates = latestGates(props.results);

  return (
    <section aria-label="Gates" className="grid gap-2">
      <h2 className="text-sm font-semibold">Gates</h2>
      {gates.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={ShieldCheck}
          title="No gate has run on this ticket yet"
        />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {gates.map((gate) => {
            const { icon: Icon, text, word } = GATE_VIEW[gate.status];

            return (
              <li
                key={gate.gate}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-sm"
              >
                <Icon aria-hidden="true" className={`size-4 ${text}`} />
                <span className="font-data text-xs font-medium">{gate.gate}</span>
                <span className={`text-xs ${text}`}>{word}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function RunsList(props: {
  runs: readonly Run[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  now: number;
}) {
  const runs = [...props.runs].sort((a, b) => b.started_at.localeCompare(a.started_at));

  return (
    <section aria-label="Runs" className="grid content-start gap-2">
      <h2 className="text-sm font-semibold">Runs</h2>
      {runs.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={Activity}
          title="No Worker has run on this ticket yet"
        />
      ) : (
        <ul className="grid gap-2">
          {runs.map((run) => {
            const selected = run.id === props.selectedId;

            return (
              <li key={run.id}>
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => props.onSelect(run.id)}
                  className={`grid w-full gap-1 rounded-xl border p-2 text-left text-sm transition-[background-color,border-color] duration-150 hover:bg-hover ${selected ? 'border-signal bg-signal-soft' : 'border-line bg-surface'}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-data text-xs">{run.id}</span>
                    <RunChip status={run.status} />
                  </span>
                  <span className="text-xs text-muted">
                    {run.harness} · started {timeAgo(run.started_at, props.now)}
                    {run.retry_of ? ` · retry of ${run.retry_of}` : ''}
                    {run.cost_usd === undefined ? '' : ` · $${run.cost_usd.toFixed(2)}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
