/**
 * The Inbox as TanStack Query: the paged list, the counts, a short preview, and optimistic marks.
 *
 * Why: the Inbox is where the user clears what waits on them, and each click (read, archive)
 *   must answer instantly. A mark is applied to every cached view and to the counts behind the
 *   sidebar badge at once; if the server refuses (Forge down, the item gone), the snapshot is
 *   put back exactly and the caller can say why. Either way the inbox is refetched afterwards,
 *   so what stays on screen is what the server holds. The counts refetch every 30 seconds and
 *   on window focus so the badge notices new work without a reload.
 *
 * Exports: useInboxList(), useInboxCounts(), useInboxPreview(), useMarkInbox(), INBOX_COUNTS_MS.
 * Depends on: @tanstack/react-query, api/api-provider, domain/inbox-marks, @forge/core (types).
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { InboxCounts, InboxItem, InboxPage, InboxView } from '@forge/core';
import { useForgeApi } from '#/api/api-provider.js';
import { applyMarkToCounts, applyMarkToPages, findItem } from '#/domain/inbox-marks.js';
import type { InboxMarkName } from '#/types/work-api.types.js';
import type { CacheSnapshot as Snapshot } from '#/types/work-ui.types.js';

export const INBOX_COUNTS_MS = 30_000;
const PAGE_SIZE = 50;

const root = (slug: string) => ['inbox', slug] as const;

export function useInboxList(slug: string, view: InboxView) {
  const api = useForgeApi();

  return useInfiniteQuery({
    queryKey: [...root(slug), 'list', view] as const,
    queryFn: ({ pageParam, signal }) =>
      api.inbox.list(slug, { view, cursor: pageParam, limit: PAGE_SIZE }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** The badge and tab counts; failures are quiet (no badge), the Inbox page has the error state. */
export function useInboxCounts(slug: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: [...root(slug), 'counts'] as const,
    queryFn: ({ signal }) => api.inbox.counts(slug, { signal }),
    enabled: slug !== '',
    refetchInterval: INBOX_COUNTS_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

/** The first few items that need the user, for Home. */
export function useInboxPreview(
  slug: string,
  limit: number,
  options: { pollMs?: number } = {},
) {
  const api = useForgeApi();

  return useQuery({
    queryKey: [...root(slug), 'preview', limit] as const,
    enabled: slug !== '',
    refetchInterval: options.pollMs ?? false,
    queryFn: ({ signal }) =>
      api.inbox.list(slug, { view: 'needs_action', limit }, { signal }),
  });
}

function itemInCache(queryClient: QueryClient, slug: string, itemId: string) {
  for (const [, data] of queryClient.getQueriesData<
    InfiniteData<InboxPage> | InboxPage | InboxCounts
  >({ queryKey: root(slug) })) {
    const pages =
      data && 'pages' in data ? data.pages : data && 'items' in data ? [data] : [];

    const found = findItem(pages, itemId);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function patchCache(
  queryClient: QueryClient,
  slug: string,
  item: InboxItem,
  mark: InboxMarkName,
): void {
  for (const [key, data] of queryClient.getQueriesData({ queryKey: root(slug) })) {
    const kind = key[2];

    if (kind === 'list') {
      const view = key[3] as InboxView;
      const infinite = data as InfiniteData<InboxPage> | undefined;
      if (infinite) {
        queryClient.setQueryData(key, {
          ...infinite,
          pages: applyMarkToPages(infinite.pages, view, item.id, mark),
        });
      }
    } else if (kind === 'preview') {
      const page = data as InboxPage | undefined;
      if (page) {
        queryClient.setQueryData(
          key,
          applyMarkToPages([page], 'needs_action', item.id, mark)[0],
        );
      }
    } else if (kind === 'counts') {
      const counts = data as InboxCounts | undefined;
      if (counts) {
        queryClient.setQueryData(key, applyMarkToCounts(counts, item, mark));
      }
    }
  }
}

export function useMarkInbox(slug: string) {
  const api = useForgeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { itemId: string; mark: InboxMarkName }) =>
      api.inbox.mark(slug, args.itemId, args.mark),
    async onMutate(args): Promise<{ snapshot: Snapshot }> {
      await queryClient.cancelQueries({ queryKey: root(slug) });
      const snapshot: Snapshot = queryClient
        .getQueriesData({ queryKey: root(slug) })
        .map(([key, data]) => [key, data] as const);

      const item = itemInCache(queryClient, slug, args.itemId);
      if (item) {
        patchCache(queryClient, slug, item, args.mark);
      }

      return { snapshot };
    },
    onError(_error, _args, context) {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: root(slug) }),
  });
}
