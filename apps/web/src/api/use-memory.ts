/**
 * Project memory as TanStack Query: the list, search, one record with its history and related
 * records, the import status, export, and an optimistic answer.
 *
 * Why: approving or rejecting a proposal must feel instant, but it is a real decision with a
 *   history entry behind it, so the screen can never be left lying. The answer moves the
 *   proposal in the cached list at once; if the server refuses (already answered in another
 *   tab, Forge down) the cached list is put back exactly as it was and the screen says why.
 *   Every key sits under `['memory', slug]`, the key the server announces after any memory
 *   write or import, so one invalidation refreshes the list, a search, an open record and the
 *   import status together. Search reads in pages of ten so a broad query stays cheap.
 *
 * Exports: useMemoryList(), useMemoryRecord(), useMemorySearch(), useMemoryHistory(),
 *   useMemoryRelated(), useMemoryImport(), useRetryImport(), useExportMemory(),
 *   useAnswerProposal(), memoryKey(), SEARCH_PAGE.
 * Depends on: @tanstack/react-query, api/api-provider, domain/memory-filter, types/*.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { MemoryListEntry } from '@forge/core';
import { ApiError } from '#/api/api-error.js';
import { useForgeApi } from '#/api/api-provider.js';
import { applyAnswer } from '#/domain/memory-filter.js';
import type { MemoryAnswer, MemorySearchState } from '#/types/memory.types.js';

export const memoryKey = (slug: string) => ['memory', slug] as const;
const recordKey = (slug: string, id: string) => ['memory', slug, 'record', id] as const;

/** Hits asked for per request; the server allows up to 25. */
export const SEARCH_PAGE = 10;

const IMPORT_POLL_MS = 5000;

export function useMemoryList(slug: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: memoryKey(slug),
    queryFn: ({ signal }) => api.memory.list(slug, { signal }),
  });
}

/** One record with its body; idle while `id` is null. */
export function useMemoryRecord(slug: string, id: string | null) {
  const api = useForgeApi();

  return useQuery({
    queryKey: recordKey(slug, id ?? ''),
    queryFn: ({ signal }) => api.memory.get(slug, id ?? '', { signal }),
    enabled: id !== null,
  });
}

/**
 * Search results in pages; idle while `enabled` is false (query too short). A 409
 * `memory_not_migrated` is final (the project is still on files), so it is not retried.
 */
export function useMemorySearch(
  slug: string,
  state: MemorySearchState,
  enabled: boolean,
) {
  const api = useForgeApi();

  return useInfiniteQuery({
    queryKey: [...memoryKey(slug), 'search', state] as const,
    queryFn: ({ pageParam, signal }) =>
      api.memory.search(
        slug,
        { ...state, offset: pageParam, limit: SEARCH_PAGE },
        { signal },
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.hits.length, 0);

      return last.hits.length > 0 && loaded < last.total ? loaded : undefined;
    },
    enabled,
    retry: (failures, error) =>
      failures < 1 && error instanceof ApiError && error.kind === 'network',
  });
}

export function useMemoryHistory(slug: string, id: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: [...recordKey(slug, id), 'history'] as const,
    queryFn: ({ signal }) => api.memory.history(slug, id, { signal }),
  });
}

export function useMemoryRelated(slug: string, id: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: [...recordKey(slug, id), 'related'] as const,
    queryFn: ({ signal }) => api.memory.related(slug, id, { signal }),
  });
}

/** Where the project's old repository import stands; checked again every few seconds while it runs. */
export function useMemoryImport(slug: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: [...memoryKey(slug), 'import'] as const,
    queryFn: ({ signal }) => api.memory.importStatus(slug, { signal }),
    refetchInterval: (query) =>
      query.state.data?.state === 'pending' ? IMPORT_POLL_MS : false,
  });
}

export function useRetryImport(slug: string) {
  const api = useForgeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.memory.retryImport(slug),
    onSettled: () => queryClient.invalidateQueries({ queryKey: memoryKey(slug) }),
  });
}

export function useExportMemory(slug: string) {
  const api = useForgeApi();

  return useMutation({ mutationFn: () => api.memory.exportMarkdown(slug) });
}

export function useAnswerProposal(slug: string) {
  const api = useForgeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (answer: MemoryAnswer) => api.memory.answer(slug, answer),
    async onMutate(answer) {
      await queryClient.cancelQueries({ queryKey: memoryKey(slug) });
      const previous = queryClient.getQueryData<readonly MemoryListEntry[]>(
        memoryKey(slug),
      );

      if (previous) {
        queryClient.setQueryData(memoryKey(slug), applyAnswer(previous, answer));
      }

      return { previous };
    },
    onError(_error, _answer, context) {
      if (context?.previous) {
        queryClient.setQueryData(memoryKey(slug), context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['memory', slug] }),
  });
}
