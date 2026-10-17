/**
 * `useBannerActions()`: what each button of the Needs you banner does.
 *
 * Why: the Director lists the actions that can unblock a card, and each must lead somewhere
 *   (d-0135, no dead ends): "answer" moves focus to the open question (switching to the Chat tab
 *   first on a narrow screen); "approve plan" and "request changes" open the plan dialogs, or the
 *   Plan tab when no plan has loaded; "start planning" calls the endpoint for a card that was
 *   never planned; "run as Express" releases the held ticket the raise names, or opens the
 *   Tickets tab so the owner can choose one; "retry step" re-queues the planning step that ran out
 *   of its budget, and "raise the step budget" is a link (drawn by the banner) to Settings → Limits.
 *   A failed call is reported in words next to the
 *   banner.
 *
 * Exports: useBannerActions().
 * Depends on: react, api/use-plan, components/card/question-block, domain/flow-errors,
 *   schemas/card-events (types), types/cards-ui.types, types/plan.types.
 */

import { useEffect, useRef } from 'react';
import {
  useRetryPlanningStep,
  useRunAsExpress,
  useStartPlanning,
} from '#/api/use-plan.js';
import { FIRST_OPTION_ID } from '#/components/card/question-block.js';
import { describeFlowError } from '#/domain/flow-errors.js';
import type { NeedsYou, NeedsYouAction } from '#/schemas/card-events.js';
import type { CardTab } from '#/types/cards-ui.types.js';
import type { PlanDecisions } from '#/types/plan.types.js';

export function useBannerActions(input: {
  cardId: string;
  needs: NeedsYou | null;
  hasPlan: boolean;
  tab: CardTab;
  wide: boolean;
  decisions: PlanDecisions;
  goTab: (tab: CardTab) => void;
}) {
  const { cardId, needs, tab, wide, decisions, goTab } = input;
  const start = useStartPlanning(cardId);
  const express = useRunAsExpress(cardId);
  const retry = useRetryPlanningStep(cardId);
  const focusWhenShown = useRef(false);

  const focusQuestion = (): boolean => {
    const first = document.getElementById(FIRST_OPTION_ID);
    first?.focus();
    first?.scrollIntoView({ block: 'nearest' });

    return first !== null;
  };

  // The question is not mounted until the Chat tab is: focus it once it is.
  useEffect(() => {
    if (focusWhenShown.current && (wide || tab === 'chat') && focusQuestion()) {
      focusWhenShown.current = false;
    }
  });

  const run = (action: NeedsYouAction): void => {
    switch (action) {
      case 'answer':
        if (!focusQuestion()) {
          focusWhenShown.current = true;
          goTab('chat');
        }

        break;
      case 'approve_plan':
      case 'request_changes':
        if (input.hasPlan) {
          decisions.open(action === 'approve_plan' ? 'approve' : 'changes');
        } else {
          goTab('plan');
        }

        break;
      case 'start_planning':
        start.reset();
        start.mutate();
        break;
      case 'retry_step':
        retry.reset();
        retry.mutate();
        break;
      case 'raise_step_budget':
        // Drawn as a link to Settings → Limits by the banner; nothing to run here.
        break;
      case 'run_as_express':
        if (needs?.ticket_id === undefined) {
          goTab('tickets');
        } else {
          express.reset();
          express.mutate(needs.ticket_id);
        }

        break;
    }
  };

  const failure = start.error ?? express.error ?? retry.error;
  const busy: NeedsYouAction | null = start.isPending
    ? 'start_planning'
    : retry.isPending
      ? 'retry_step'
      : express.isPending
        ? 'run_as_express'
        : null;

  return {
    run,
    busy,
    error: failure === null ? null : describeFlowError(failure),
  };
}
