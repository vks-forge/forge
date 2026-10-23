/**
 * `useCardDock()`: turns the card's waiting items into dock items with working buttons.
 *
 * Why: the server says what waits on the owner (`needs_you_detail` on the card, so the dock never
 *   depends on which slice of history the page loaded); this hook gives each item the means to
 *   act. Approve and request changes open the plan dialogs the Plan tab uses (or the plan itself
 *   when it has not loaded); start planning and retry the step call their endpoints; run as
 *   Express releases the held ticket the raise names; a ticket's waiting item opens its own
 *   escalation card in place (the same card the Inbox and the Ticket page draw, so one act settles
 *   all three) or links to the ticket (a tool approval opens at once, since the owner must read the
 *   exact command before choosing); the step budget links to its setting. The Director's open
 *   question gets its options from the history and answers through the grill endpoints. A failed
 *   action is shown inside the item it belongs to, in words, and the item stays open.
 *
 * Exports: useCardDock().
 * Depends on: react, api/use-plan, components/escalation/escalation-card, domain/director-flow,
 *   domain/flow-errors, domain/needs-you-dock, domain/ticket-paths, routes/card/dock-question,
 *   schemas/cards (types), schemas/escalation (type), types/*.
 */

import type { NeedsYouItem } from '@forge/core';
import { useState } from 'react';
import {
  useAnswerGrill,
  useGrillShortcut,
  useRetryPlanningStep,
  useRunAsExpress,
  useStartPlanning,
} from '#/api/use-plan.js';
import { EscalationCard } from '#/components/escalation/escalation-card.js';
import { canAnswerGrill, grillOf } from '#/domain/director-flow.js';
import { describeFlowError } from '#/domain/flow-errors.js';
import {
  DOCK_ACTION_LABEL,
  STEP_BUDGET_SETTINGS,
  dockActionPlan,
  dockKey,
  orderDockItems,
} from '#/domain/needs-you-dock.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import { DockQuestion } from '#/routes/card/dock-question.js';
import type { CardDetailReply, CardHistoryEvent } from '#/schemas/cards.js';
import type { EscalationView } from '#/schemas/escalation.js';
import type { CardTab, FlowHandlers } from '#/types/cards-ui.types.js';
import type {
  DockActionId,
  DockActionView,
  DockView,
} from '#/types/needs-you-dock.types.js';
import type { PlanDecisions } from '#/types/plan.types.js';

export function useCardDock(input: {
  cardId: string;
  /** Undefined while the card loads: the dock is then empty. */
  card: CardDetailReply | undefined;
  events: readonly CardHistoryEvent[] | undefined;
  escalations: readonly EscalationView[] | undefined;
  decisions: PlanDecisions;
  hasPlan: boolean;
  goTab: (tab: CardTab) => void;
}): readonly DockView[] {
  const { card, cardId, decisions, goTab } = input;
  const start = useStartPlanning(cardId);
  const retry = useRetryPlanningStep(cardId);
  const express = useRunAsExpress(cardId);
  const answer = useAnswerGrill(cardId);
  const shortcut = useGrillShortcut(cardId);
  // The item an action was started from, so its failure is shown there and nowhere else.
  const [actedOn, setActedOn] = useState<string | null>(null);

  const items =
    card === undefined || card.closed_reason !== undefined
      ? []
      : orderDockItems(card.needs_you_detail);

  const grill = input.events === undefined ? null : grillOf(input.events);
  const question =
    card !== undefined && canAnswerGrill(card) ? (grill?.question ?? null) : null;

  const failure = start.error ?? retry.error ?? express.error;
  const grillFailure = answer.error ?? shortcut.error;

  const flow: FlowHandlers = {
    busy: answer.isPending || shortcut.isPending,
    error: grillFailure === null ? null : describeFlowError(grillFailure),
    onShortcut: (kind) => {
      answer.reset();
      shortcut.mutate(kind);
    },
    onAnswer: (questionId, choice) => {
      shortcut.reset();
      answer.mutate(
        'optionId' in choice
          ? { question_id: questionId, option_id: choice.optionId }
          : { question_id: questionId, text: choice.text },
      );
    },
  };

  const openPlan = (): void => goTab('plan');

  const actionView = (
    id: DockActionId,
    item: NeedsYouItem,
    key: string,
  ): DockActionView => {
    const label = DOCK_ACTION_LABEL[id];
    const ticket = item.ticket_id;
    const acting = (run: () => void) => (): void => {
      setActedOn(key);
      run();
    };

    switch (id) {
      case 'approve_plan':
        return {
          id,
          label,
          busy: decisions.pending,
          leaves: true,
          onRun: () => (input.hasPlan ? decisions.open('approve') : openPlan()),
        };
      case 'request_changes':
        return {
          id,
          label,
          leaves: true,
          onRun: () => (input.hasPlan ? decisions.open('changes') : openPlan()),
        };
      case 'start_planning':
        return {
          id,
          label,
          busy: start.isPending,
          onRun: acting(() => {
            start.reset();
            start.mutate();
          }),
        };
      case 'retry_step':
        return {
          id,
          label,
          busy: retry.isPending,
          onRun: acting(() => {
            retry.reset();
            retry.mutate();
          }),
        };
      case 'raise_step_budget':
        return { id, label, to: STEP_BUDGET_SETTINGS };
      case 'run_as_express':
        return {
          id,
          label,
          busy: express.isPending,
          onRun: acting(() => {
            // The raise schema requires a ticket for this action, so one is always named.
            if (ticket !== undefined) {
              express.reset();
              express.mutate(ticket);
            }
          }),
        };
      case 'open_ticket': {
        const tab =
          item.kind === 'ticket_review' ||
          item.kind === 'ticket_signoff' ||
          item.kind === 'held_ticket'
            ? 'review'
            : undefined;

        return { id, label, to: ticketPath(card?.project ?? '', ticket ?? '', tab) };
      }
    }
  };

  return items.map((item): DockView => {
    const key = dockKey(item);
    const live =
      item.interaction_id === undefined
        ? undefined
        : input.escalations?.find((view) => view.id === item.interaction_id);

    const canRespond =
      live !== undefined && live.stage === 'owner' && live.settled === undefined;

    // An escalation is answered where it is read: the modal shows its card at once, with no Respond.
    const direct = canRespond;
    const plan = dockActionPlan(item, canRespond);
    const primary =
      plan.primary === null || direct ? undefined : actionView(plan.primary, item, key);

    const secondary =
      plan.secondary === null ? undefined : actionView(plan.secondary, item, key);

    const base = {
      key,
      kind: item.kind,
      title: item.title,
      raisedAt: item.raised_at,
      ...(primary === undefined ? {} : { primary }),
      ...(secondary === undefined ? {} : { secondary }),
    };

    if (item.kind === 'director_questions') {
      return {
        ...base,
        reasons: [],
        body: <DockQuestion question={question} fallback={item.items} flow={flow} />,
        error: flow.error,
      };
    }

    return {
      ...base,
      reasons: direct ? [] : item.items,
      ...(item.kind === 'plan_approval'
        ? { link: { label: 'Open the plan', onRun: openPlan } }
        : {}),
      ...(direct && live !== undefined
        ? { body: <EscalationCard view={live} variant="plain" /> }
        : {}),
      error:
        item.kind === 'plan_approval'
          ? decisions.error
          : actedOn === key && failure !== null
            ? describeFlowError(failure)
            : null,
    };
  });
}
