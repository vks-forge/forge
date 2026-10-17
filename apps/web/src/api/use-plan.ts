/**
 * TanStack Query hooks for a card's plan and for every action that moves the card through the
 * planning flow: answer the grill, use its shortcuts, approve, request changes, edit tickets,
 * start planning, run a held ticket as Express.
 *
 * Why: the plan is read on the Plan tab and the Chat's "Review plan" button, and each action
 *   changes what several views show (the card's phase and column, its history, the plan, the
 *   ticket list). Every action therefore invalidates the whole card family (`["card", id]`
 *   covers detail, history and plan), the board's list and the tickets, so one click is reflected
 *   everywhere without per-view bookkeeping; the project stream does the same for changes made
 *   elsewhere. The plan polls only on the slow safety-net interval because the stream tells it
 *   when to reload. An action returns the raw server error, so the caller can say why in words
 *   (domain/flow-errors); nothing here swallows a refusal.
 *
 * Exports: planKey(), usePlan(), usePlanVersion(), useAnswerGrill(), useGrillShortcut(),
 *   useApprovePlan(), useRequestChanges(), useEditPlanTickets(), useStartPlanning(),
 *   useRunAsExpress().
 * Depends on: @tanstack/react-query, api/api-provider, api/poll-interval, api/use-card-board,
 *   api/use-tickets, schemas/plan (types), types/cards-api.types, types/plan.types.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { useRefetchMs } from '#/api/poll-interval.js';
import { CARDS_KEY, cardKey } from '#/api/use-card-board.js';
import { TICKETS_KEY } from '#/api/use-tickets.js';
import type { GrillAnswerBody, GrillShortcutKind } from '#/types/cards-api.types.js';
import type { PlanEditBody } from '#/types/plan.types.js';

const PLAN_POLL_MS = 10_000;

export const planKey = (id: string) => [...cardKey(id), 'plan'] as const;

export function usePlan(cardId: string) {
  const api = useForgeApi();
  const pollMs = useRefetchMs(PLAN_POLL_MS);

  return useQuery({
    queryKey: planKey(cardId),
    queryFn: ({ signal }) => api.cards.plan(cardId, { signal }),
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
  });
}

/** One stored version, for the version picker; the current one comes from `usePlan`. */
export function usePlanVersion(cardId: string, version: number | null) {
  const api = useForgeApi();

  return useQuery({
    queryKey: [...planKey(cardId), version],
    queryFn: ({ signal }) => api.cards.planVersion(cardId, version ?? 0, { signal }),
    enabled: version !== null,
    staleTime: 60_000,
  });
}

/** Refreshes every view of the card and the lists it appears in. */
function useRefreshCard(cardId: string) {
  const client = useQueryClient();

  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: cardKey(cardId) }),
      client.invalidateQueries({ queryKey: CARDS_KEY }),
      client.invalidateQueries({ queryKey: TICKETS_KEY }),
    ]);
}

export function useAnswerGrill(cardId: string) {
  const api = useForgeApi();
  const refresh = useRefreshCard(cardId);

  return useMutation({
    mutationFn: (body: GrillAnswerBody) => api.cards.answerGrill(cardId, body),
    // A refusal means the question moved on; reload so the chat shows the truth.
    onSettled: refresh,
  });
}

export function useGrillShortcut(cardId: string) {
  const api = useForgeApi();
  const refresh = useRefreshCard(cardId);

  return useMutation({
    mutationFn: (kind: GrillShortcutKind) => api.cards.grillShortcut(cardId, kind),
    onSettled: refresh,
  });
}

export function useApprovePlan(cardId: string) {
  const api = useForgeApi();
  const refresh = useRefreshCard(cardId);

  return useMutation({
    mutationFn: (version: number) => api.cards.approvePlan(cardId, version),
    onSettled: refresh,
  });
}

export function useRequestChanges(cardId: string) {
  const api = useForgeApi();
  const refresh = useRefreshCard(cardId);

  return useMutation({
    mutationFn: (input: { version: number; comment: string }) =>
      api.cards.requestChanges(cardId, input.version, input.comment),
    onSettled: refresh,
  });
}

export function useEditPlanTickets(cardId: string) {
  const api = useForgeApi();
  const refresh = useRefreshCard(cardId);

  return useMutation({
    mutationFn: (input: { version: number; body: PlanEditBody }) =>
      api.cards.editPlanTickets(cardId, input.version, input.body),
    onSettled: refresh,
  });
}

export function useStartPlanning(cardId: string) {
  const api = useForgeApi();
  const refresh = useRefreshCard(cardId);

  return useMutation({
    mutationFn: () => api.cards.startPlanning(cardId),
    onSettled: refresh,
  });
}

export function useRetryPlanningStep(cardId: string) {
  const api = useForgeApi();
  const refresh = useRefreshCard(cardId);

  return useMutation({
    mutationFn: () => api.cards.retryPlanningStep(cardId),
    onSettled: refresh,
  });
}

export function useRunAsExpress(cardId: string) {
  const api = useForgeApi();
  const refresh = useRefreshCard(cardId);

  return useMutation({
    mutationFn: (ticketId: string) => api.cards.runAsExpress(ticketId),
    onSettled: refresh,
  });
}
