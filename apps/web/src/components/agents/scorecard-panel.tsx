/**
 * ScorecardPanel: one agent's record in this project, by all tickets or by type, tier or lane, over 30 or 90 days.
 *
 * Why: before changing an agent's instructions or trusting it with more, the owner wants to know how
 *   it has done: how often its work passed or needed rework, what it cost and whether its findings
 *   held up. The figures are computed on read from finished tickets, never stored and never applied
 *   (nothing here changes a setting by itself). Each slice is a card with the headline figure first;
 *   a slice under five tickets says "Too few tickets to judge" and shows no percentage, a figure with
 *   no data says so, and cost says how many runs were priced. The panel has its own loading, empty
 *   (no finished tickets) and error states, and a project-only home: a company agent has no record
 *   until it runs in a project.
 *
 * Exports: ScorecardPanel.
 * Depends on: react, api/describe-error, api/use-scorecards, components/settings/settings-card,
 *   components/ui/toggle-group, components/status/state-panel, components/agents/scorecard-row-view,
 *   domain/scorecard-copy.
 */

import { useState } from 'react';
import type { ScorecardRange, ScorecardSlice } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useScorecards } from '#/api/use-scorecards.js';
import { ScorecardRowView } from '#/components/agents/scorecard-row-view.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { SettingsCard } from '#/components/settings/settings-card.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import { RANGE_OPTIONS, SLICE_OPTIONS } from '#/domain/scorecard-copy.js';

export function ScorecardPanel(props: { slug: string; agentId: string }) {
  const [range, setRange] = useState<ScorecardRange>('90d');
  const [slice, setSlice] = useState<ScorecardSlice>('all');
  const query = useScorecards(props.slug, range, { agent: props.agentId });
  const card = query.data?.agents.find((agent) => agent.agent_id === props.agentId);
  const rows = (card?.rows ?? []).filter((row) => row.by === slice);

  return (
    <SettingsCard
      id="scorecard"
      title="Scorecard"
      description="How this agent has done in this project, from finished tickets. Nothing here changes a setting by itself."
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <ToggleGroup
          label="Slice"
          value={slice}
          options={SLICE_OPTIONS}
          onChange={setSlice}
        />
        <ToggleGroup
          label="Window"
          value={range}
          options={RANGE_OPTIONS}
          onChange={setRange}
        />
      </div>

      {query.isPending ? (
        <StatePanel kind="loading" label="Loading the scorecard" />
      ) : query.data === undefined ? (
        <StatePanel
          kind="error"
          title="Could not load the scorecard"
          detail={describeError(query.error).detail}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <StatePanel
          kind="empty"
          compact
          title={
            slice === 'all'
              ? 'No finished tickets for this agent yet'
              : 'Nothing to split yet'
          }
        >
          The record appears once tickets it worked on have finished.
        </StatePanel>
      ) : (
        <ul aria-label="Scorecard rows" className="grid gap-3">
          {rows.map((row) => (
            <ScorecardRowView key={`${row.by}-${row.value ?? ''}`} row={row} />
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
