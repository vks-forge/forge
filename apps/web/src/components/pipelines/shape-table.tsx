/**
 * ShapeTable: how each pipeline shape of a lane has done, with the Director-changed ones marked.
 *
 * Why: the owner edits a lane's stages on a hunch ("is the second review worth it?"). The record
 *   answers it: tickets that ran the lane as written are one shape, and tickets the Director gave an
 *   extra reviewer or a lighter list are others ("Standard + security-reviewer", "Standard -
 *   reviewer"), each with its own clean rate, reworks and cost. Shapes the Director made are marked, so a
 *   difference between them is attributed to the right choice. Under five tickets a shape says "Too
 *   few tickets to judge" and shows no rate. The figures are computed on read and never change a
 *   lane. Loading, empty (nothing has run this lane yet) and error each have a face; the window
 *   (30 or 90 days) is the owner's choice.
 *
 * Exports: ShapeTable.
 * Depends on: react, api/describe-error, api/use-scorecards, components/agents/scorecard-row-view,
 *   components/status/state-panel, components/ui/toggle-group, domain/scorecard-copy, @forge/core (types).
 */

import { useState } from 'react';
import type { Lane } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useScorecards } from '#/api/use-scorecards.js';
import { ScorecardRowView } from '#/components/agents/scorecard-row-view.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import { RANGE_OPTIONS } from '#/domain/scorecard-copy.js';

export function ShapeTable(props: { slug: string; lane: Lane }) {
  const [range, setRange] = useState<'30d' | '90d'>('90d');
  const query = useScorecards(props.slug, range);
  const shapes = (query.data?.shapes ?? []).filter((shape) => shape.lane === props.lane);

  return (
    <section aria-label="How this lane has done" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">How this lane has done</h4>
        <ToggleGroup
          label="Window"
          value={range}
          options={RANGE_OPTIONS}
          onChange={setRange}
        />
      </div>
      {query.isPending ? (
        <StatePanel kind="loading" label="Loading the record" />
      ) : query.data === undefined ? (
        <StatePanel
          kind="error"
          title="Could not load the record"
          detail={describeError(query.error).detail}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : shapes.length === 0 ? (
        <StatePanel kind="empty" compact title="No ticket has finished on this lane yet">
          Each shape this lane runs in appears here once tickets finish.
        </StatePanel>
      ) : (
        <ul aria-label="Pipeline shapes" className="grid gap-3">
          {shapes.map((shape) => {
            const all = shape.rows.find((row) => row.by === 'all');

            return all === undefined ? null : (
              <ScorecardRowView
                key={shape.hash}
                row={all}
                heading={shape.label}
                badge={shape.director_changed ? 'Changed by the Director' : undefined}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
