/**
 * MemoryPage: a project's memory, searchable, in tabs by kind.
 *
 * Why: memory is what the Director plans against, and the Director may only propose, never
 *   decide (d-0007). This screen is where the owner finds what binds the Director ("did we
 *   already decide this?"), reads what it proposes and answers it. A search box sits above
 *   everything: while a query is active the tabs give way to ranked results with the matched
 *   words highlighted, and the query and chips live in the address (`?q=&kind=&status=&tag=`) so
 *   a link or Back returns to the same answer. A project whose memory is still in files cannot
 *   search on the server (409), so the page says so and falls back to the plain word filter of
 *   the list. A banner states where the memory is stored and offers Retry when the move to the
 *   database did not finish. An old `?record=d-0003` link opens the record page. Loading, empty,
 *   error and offline each have their own state.
 *
 * Exports: MemoryPage.
 * Depends on: react, react-router, api/*, components/*, domain/memory-*, routes/memory/*.
 */

import { Database, WifiOff } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { useMemoryImport, useMemoryList, useMemorySearch } from '#/api/use-memory.js';
import { isFileBacked } from '#/domain/memory-import-copy.js';
import {
  EMPTY_SEARCH,
  isSearching,
  readSearchState,
  writeSearchState,
} from '#/domain/memory-search-params.js';
import { tagsInUse } from '#/domain/memory-filter.js';
import { projectPath } from '#/domain/nav-entries.js';
import { ExportButton } from '#/routes/memory/export-button.js';
import { ImportBanner } from '#/routes/memory/import-banner.js';
import { MemoryListView } from '#/routes/memory/memory-list-view.js';
import { SearchBox } from '#/routes/memory/search-box.js';
import { SearchFilters } from '#/routes/memory/search-filters.js';
import { SearchResults } from '#/routes/memory/search-results.js';
import { useProposalAnswers } from '#/routes/memory/use-proposal-answers.js';
import { useOnline } from '#/state/use-online.js';
import type { MemorySearchState } from '#/types/memory.types.js';

const FILES_NOTE =
  'Search is not available yet: this project’s memory is still stored in files. The words you typed narrow the list below instead.';

function MemoryScreen() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const online = useOnline();
  const list = useMemoryList(slug);
  const entries = list.data ?? [];

  const state = readSearchState(params);
  const searching = isSearching(state);
  // The import status says up front that search cannot work yet; a 409 says it too.
  const filesKnown = isFileBacked(useMemoryImport(slug).data);
  const query = useMemorySearch(slug, state, searching && !filesKnown);
  const onFiles =
    searching &&
    (filesKnown ||
      (query.error instanceof ApiError && query.error.code === 'memory_not_migrated'));

  const answers = useProposalAnswers(
    slug,
    (id) => entries.find((entry) => entry.id === id)?.statement ?? null,
  );

  useEffect(() => {
    document.title = 'Memory · Forge';
  }, []);

  const write = useCallback(
    (change: (previous: MemorySearchState) => MemorySearchState): void =>
      setParams(
        (previous) => writeSearchState(previous, change(readSearchState(previous))),
        { replace: true },
      ),
    [setParams],
  );

  const commit = useCallback(
    (q: string) => write((previous) => ({ ...previous, q })),
    [write],
  );

  return (
    <section className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="font-data text-xs text-muted">{slug}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
          <p className="max-w-prose text-sm text-muted">
            What the Director must follow on this project, what you ruled out, and what it
            proposes. Only you can approve a proposal. Records are never edited: to change
            one, supersede it.
          </p>
        </div>
        <ExportButton slug={slug} online={online} />
      </header>

      {!online ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-hover px-3 py-2 text-sm"
        >
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          You are offline. You can read what is loaded; answering proposals is paused.
        </p>
      ) : null}

      {answers.banner}

      <ImportBanner slug={slug} online={online} />

      <SearchBox value={state.q} onCommit={commit} />

      {searching && !onFiles ? (
        <>
          <SearchFilters
            state={state}
            tags={tagsInUse(entries)}
            onChange={(next) => write(() => next)}
          />
          <SearchResults
            slug={slug}
            query={query}
            text={state.q.trim()}
            online={online}
            narrowed={
              state.kinds.length + state.statuses.length + state.tags.length > 0 ||
              state.superseded
            }
            onClearFilters={() =>
              write((previous) => ({ ...EMPTY_SEARCH, q: previous.q }))
            }
          />
        </>
      ) : (
        <>
          {onFiles ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg bg-hover px-3 py-2 text-sm"
            >
              <Database aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {FILES_NOTE}
            </p>
          ) : null}
          <MemoryListView
            slug={slug}
            list={list}
            text={onFiles ? state.q.trim() : ''}
            onClearText={() => commit('')}
            answersDisabled={!online}
            onApprove={answers.askApprove}
            onReject={answers.askReject}
          />
        </>
      )}

      {answers.dialogs}
    </section>
  );
}

/** `?record=d-0003` was the drawer's link; it now opens the record page. */
export function MemoryPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const legacy = params.get('record');

  if (legacy) {
    return (
      <Navigate replace to={projectPath(slug, `memory/${encodeURIComponent(legacy)}`)} />
    );
  }

  return <MemoryScreen />;
}
