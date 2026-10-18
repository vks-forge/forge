/**
 * SearchResults: the list under the search box, in every state it can be in.
 *
 * Why: search has more ways to stop than a list does: the query may be too new to have an
 *   answer (loading), match nothing, fail, run offline, or hit a project whose memory is still
 *   in files. Each says what happened in words and offers the next step: Try again, Clear
 *   filters, or (for files) the plain filter of the list. The count is announced politely so a
 *   screen-reader user hears that typing changed the result, and a long result is read in pages
 *   with "Show more" instead of one long wait.
 *
 * Exports: SearchResults.
 * Depends on: lucide-react, api/describe-error, api/use-memory (type), components/status/state-panel, components/ui/button,
 *   routes/memory/search-hit-row, types/memory.types.
 */

import { SearchX, WifiOff } from 'lucide-react';
import { describeError } from '#/api/describe-error.js';
import type { useMemorySearch } from '#/api/use-memory.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { SearchHitRow } from '#/routes/memory/search-hit-row.js';

export function SearchResults(props: {
  slug: string;
  query: ReturnType<typeof useMemorySearch>;
  text: string;
  online: boolean;
  /** Whether chips narrow the search, so "Clear filters" is offered. */
  narrowed: boolean;
  onClearFilters: () => void;
}) {
  const { query } = props;
  const pages = query.data?.pages ?? [];
  const hits = pages.flatMap((page) => page.hits);
  const last = pages[pages.length - 1];

  // Offline is the likely cause of a search that cannot finish; say so before anything else.
  if (!props.online && hits.length === 0 && (query.isPending || query.isError)) {
    return (
      <StatePanel kind="empty" icon={WifiOff} title="You are offline" compact>
        Search needs a connection to Forge. Try again when you are back online.
      </StatePanel>
    );
  }

  if (query.isPending) {
    return <StatePanel kind="loading" label="Searching memory" />;
  }

  if (query.isError) {
    const { title, detail } = describeError(query.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  if (hits.length === 0) {
    return (
      <StatePanel
        kind="empty"
        icon={SearchX}
        title={`No matches for “${props.text}”`}
        actions={
          props.narrowed ? (
            <Button onClick={props.onClearFilters}>Clear filters</Button>
          ) : undefined
        }
      >
        Try fewer or different words, or clear the filters.
      </StatePanel>
    );
  }

  return (
    <div className="grid gap-2">
      <p aria-live="polite" className="text-xs text-muted">
        {last?.total === 1 ? '1 match' : `${last?.total ?? hits.length} matches`}
        {last?.narrowed_note ? ` · ${last.narrowed_note}` : ''}
        {last?.truncated
          ? ' · The list is shortened; narrow the search to see more.'
          : ''}
      </p>
      <ul aria-label="Search results" className="grid">
        {hits.map((hit) => (
          <SearchHitRow key={hit.id} slug={props.slug} hit={hit} />
        ))}
      </ul>
      {query.hasNextPage ? (
        <div>
          <Button
            onClick={() => void query.fetchNextPage()}
            status={query.isFetchingNextPage ? 'loading' : 'idle'}
          >
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
