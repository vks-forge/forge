/**
 * MemoryListView: the four tabs with counts, their filters and rows.
 *
 * Why: when nobody is searching, memory is read by kind: what binds the Director (Decisions),
 *   what was ruled out (Rejected), what waits on the owner (Proposals) and what happened
 *   (Outcomes). The screen opens on Proposals when any exist, because that is the one thing that
 *   waits on the user. It owns its loading and error states so a slow or failed list never hides
 *   the search box, and it also serves a project still on files, where the search words narrow
 *   the list on this side instead of on the server.
 *
 * Exports: MemoryListView.
 * Depends on: lucide-react, api/describe-error, components/*, domain/memory-filter,
 *   routes/memory/*, state/use-memory-prefs, types/memory.types.
 */

import { BookOpen, SearchX } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { MemoryListEntry } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { WindowedList } from '#/components/ui/windowed-list.js';
import { countByTab, filterEntries, tagsOf } from '#/domain/memory-filter.js';
import { MEMORY_ROW_HEIGHT, MemoryRow } from '#/routes/memory/memory-row.js';
import { MemoryTabs, TAB_LABELS } from '#/routes/memory/memory-tabs.js';
import { MemoryToolbar } from '#/routes/memory/memory-toolbar.js';
import { useMemoryPrefs } from '#/state/use-memory-prefs.js';

const EMPTY_HINT = {
  decisions: 'Decisions you make, and proposals you approve, appear here.',
  rejected: 'Approaches you reject appear here, with your reason.',
  proposals: 'When the Director infers something about this project it proposes it here.',
  outcomes:
    'Outcomes of finished tickets appear here. The Forge server does not list them yet.',
} as const;

export function MemoryListView(props: {
  slug: string;
  list: UseQueryResult<readonly MemoryListEntry[]>;
  /** Words that narrow the list on this side (only while search is unavailable). */
  text: string;
  onClearText: () => void;
  answersDisabled: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { list } = props;
  const entries = list.data ?? [];
  const counts = countByTab(entries);
  const { filter: stored, setFilter } = useMemoryPrefs(
    counts.proposals > 0 ? 'proposals' : 'decisions',
  );

  if (list.isPending) {
    return <StatePanel kind="loading" label="Loading memory" />;
  }

  if (list.isError) {
    const { title, detail } = describeError(list.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  }

  const filter = { ...stored, text: props.text };
  const shown = filterEntries(entries, filter);
  const tabTotal = counts[filter.tab];

  return (
    <>
      <MemoryTabs
        tab={filter.tab}
        counts={counts}
        onChange={(tab) => setFilter({ ...filter, tab, text: '' })}
      />

      <div
        id="memory-panel"
        role="tabpanel"
        aria-labelledby={`memory-tab-${filter.tab}`}
        className="grid gap-4"
      >
        <MemoryToolbar
          filter={filter}
          tags={tagsOf(entries, filter.tab)}
          shown={shown.length}
          total={tabTotal}
          onChange={(next) => {
            if (next.text !== props.text) {
              props.onClearText();
            }

            setFilter({ ...next, text: '' });
          }}
        />

        {tabTotal === 0 ? (
          <StatePanel
            kind="empty"
            icon={BookOpen}
            title={`No ${TAB_LABELS[filter.tab].toLowerCase()} yet`}
          >
            {EMPTY_HINT[filter.tab]}
          </StatePanel>
        ) : shown.length === 0 ? (
          <StatePanel kind="empty" icon={SearchX} title="Nothing matches">
            Try fewer words, or clear the filters.
          </StatePanel>
        ) : (
          <WindowedList
            items={shown}
            rowHeight={MEMORY_ROW_HEIGHT}
            label={TAB_LABELS[filter.tab]}
            keyOf={(entry) => entry.id}
            renderRow={(entry) => (
              <MemoryRow
                slug={props.slug}
                entry={entry}
                onApprove={props.onApprove}
                onReject={props.onReject}
                answersDisabled={props.answersDisabled}
              />
            )}
          />
        )}
      </div>
    </>
  );
}
