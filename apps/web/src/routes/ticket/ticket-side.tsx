/**
 * GateStrip: the ticket's checks.
 *
 * Why: "did it pass its checks?" follows "what is this ticket doing?". The strip shows the
 *   latest result of each gate that has run (G1 first), each with an icon and a word, never
 *   colour alone; gates that have not run are simply absent, and an empty strip says so. It
 *   appears in the Review tab (what the owner judges) and the Details tab.
 *
 * Exports: GateStrip, latestGates().
 * Depends on: react, lucide-react, @forge/core (types), components/ui/empty-state.
 */

import type { GateResult } from '@forge/core';
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
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
