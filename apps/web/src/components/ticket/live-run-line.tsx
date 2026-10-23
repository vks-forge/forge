/**
 * LiveRunLine: "run 2 · implementer · 10m 03s" with a live dot, for a run in flight.
 *
 * Why: the Board must show that a Worker is running right now and for how long, so a stalled
 *   ticket is told apart from a busy one at a glance. The dot is a pulse and the clock ticks
 *   every second; under reduced motion the dot stays still (the ticking number alone says it is
 *   alive) and the dot is never the only signal, since the words carry it for a screen reader.
 *   The line truncates at narrow widths with the full sentence in its tooltip.
 *
 * Exports: LiveRunLine.
 * Depends on: @forge/core (type), domain/tile-progress, state/use-elapsed.
 */

import type { TicketLiveRun } from '@forge/core';
import { formatElapsed, runText } from '#/domain/tile-progress.js';
import { useElapsed } from '#/state/use-elapsed.js';

export function LiveRunLine(props: { run: TicketLiveRun }) {
  const elapsed = useElapsed(props.run.started_at);
  const clock = elapsed === null ? '' : formatElapsed(elapsed);
  const text = runText(props.run);

  return (
    <p
      className="flex min-w-0 items-center gap-1.5 text-xs"
      title={`Running: ${text}${clock === '' ? '' : `, ${clock} so far`}`}
    >
      <span aria-hidden="true" className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full rounded-full bg-signal opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-signal" />
      </span>
      <span className="sr-only">Running: </span>
      <span className="min-w-0 truncate">
        {text}
        {clock === '' ? null : (
          <>
            {' · '}
            <span className="font-data tabular-nums">{clock}</span>
          </>
        )}
      </span>
    </p>
  );
}
