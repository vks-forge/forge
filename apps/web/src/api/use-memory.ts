/**
 * Project memory as TanStack Query: the list, one record, and an optimistic answer.
 *
 * Why: approving or rejecting a proposal must feel instant, but it is a real decision with a
 *   git commit behind it, so the screen can never be left lying. The answer moves the
 *   proposal in the cached list at once; if the server refuses (already answered in another
 *   tab, Forge down) the cached list is put back exactly as it was and the screen says why.
 *   Either way the list and the open record are refetched afterwards, so what stays on
 *   screen is what the server holds.
 *
 * Exports: useMemoryList(), useMemoryRecord(), useAnswerProposal(), memoryKey().
 * Depends on: @tanstack/react-query, api/api-provider, domain/memory-filter, types/*.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MemoryListEntry } from '@forge/core';
import { useForgeApi } from '#/api/api-provider.js';
import { applyAnswer } from '#/domain/memory-filter.js';
import type { MemoryAnswer } from '#/types/memory.types.js';

export const memoryKey = (slug: string) => ['memory', slug] as const;
const recordKey = (slug: string, id: string) => ['memory', slug, 'record', id] as const;

export function useMemoryList(slug: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: memoryKey(slug),
    queryFn: ({ signal }) => api.memory.list(slug, { signal }),
  });
}

/** One record with its body; idle while `id` is null (drawer closed). */
export function useMemoryRecord(slug: string, id: string | null) {
  const api = useForgeApi();

  return useQuery({
    queryKey: recordKey(slug, id ?? ''),
    queryFn: ({ signal }) => api.memory.get(slug, id ?? '', { signal }),
    enabled: id !== null,
  });
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
