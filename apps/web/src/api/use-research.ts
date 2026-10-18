/**
 * TanStack Query hooks for research: a card's evidence, one source's text, the pages a run
 * read, and the "Test provider" call.
 *
 * Why: the Director looks facts up on the web and the owner must be able to check what it
 *   leaned on. The evidence list changes when a research run ends, so the server announces
 *   `["card-evidence", id]` on the project stream and the hook refetches exactly then; a
 *   Worker page announces `["run-sources", runId]` the same way. Page text is heavy and never
 *   changes once stored, so it is read only when its drawer opens and kept for a minute.
 *   Testing the provider is a mutation, not a query: it must run when the owner presses the
 *   button, never on its own, and it saves nothing.
 *
 * Exports: cardEvidenceKey(), runSourcesKey(), useCardEvidence(), useSourceText(),
 *   useRunSources(), useTestResearch().
 * Depends on: @tanstack/react-query, @forge/core (types), api/api-provider, api/poll-interval.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ResearchTestBody } from '@forge/core';
import { useForgeApi } from '#/api/api-provider.js';
import { useRefetchMs } from '#/api/poll-interval.js';

const EVIDENCE_POLL_MS = 15_000;

export const cardEvidenceKey = (cardId: string) => ['card-evidence', cardId] as const;
export const runSourcesKey = (runId: string) => ['run-sources', runId] as const;

/** A card's evidence rows, sources and research-run count; always read so the tab can appear. */
export function useCardEvidence(cardId: string) {
  const api = useForgeApi();
  const pollMs = useRefetchMs(EVIDENCE_POLL_MS);

  return useQuery({
    queryKey: cardEvidenceKey(cardId),
    queryFn: ({ signal }) => api.cards.evidence(cardId, { signal }),
    refetchInterval: pollMs,
  });
}

/** One source's stored text; idle while `ref` is null (drawer closed). */
export function useSourceText(cardId: string, ref: string | null) {
  const api = useForgeApi();

  return useQuery({
    queryKey: ['source-text', cardId, ref ?? ''] as const,
    queryFn: ({ signal }) => api.cards.sourceText(cardId, ref ?? '', { signal }),
    enabled: ref !== null,
    staleTime: 60_000,
  });
}

/** The pages one run's Worker read; idle while `runId` is null. */
export function useRunSources(runId: string | null) {
  const api = useForgeApi();

  return useQuery({
    queryKey: runSourcesKey(runId ?? ''),
    queryFn: ({ signal }) => api.runs.sources(runId ?? '', { signal }),
    enabled: runId !== null,
  });
}

/** Tries the search provider with the settings on screen (saved or not); nothing is stored. */
export function useTestResearch() {
  const api = useForgeApi();

  return useMutation({
    mutationFn: (body: ResearchTestBody) => api.settings.testResearch(body),
  });
}
