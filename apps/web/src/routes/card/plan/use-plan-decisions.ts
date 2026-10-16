/**
 * `usePlanDecisions()`: approve a plan or send it back, and which dialog is open for that.
 *
 * Why: the owner can reach the same two decisions from the Plan tab and from the pinned Needs
 *   you banner, on any tab. Holding the dialog and the request at the Card page means both open
 *   the same dialog, one request is in flight at a time, and a refusal (a stale plan, a card that
 *   moved on) is shown in one place, the Plan tab, which the page switches to when a decision
 *   fails so the reason is never off-screen. A success says so once, in a toast, because the
 *   chat and the board then show the new state.
 *
 * Exports: usePlanDecisions().
 * Depends on: react, api/use-plan, domain/flow-errors, state/notify/notify-context, types/plan.types.
 */

import { useState } from 'react';
import { useApprovePlan, useRequestChanges } from '#/api/use-plan.js';
import { describeFlowError } from '#/domain/flow-errors.js';
import { useNotify } from '#/state/notify/notify-context.js';
import type { PlanDecisions, PlanDialog } from '#/types/plan.types.js';

export function usePlanDecisions(cardId: string, onRefused: () => void): PlanDecisions {
  const [dialog, setDialog] = useState<PlanDialog>(null);
  const approve = useApprovePlan(cardId);
  const changes = useRequestChanges(cardId);
  const notify = useNotify();
  const error = approve.error ?? changes.error;

  return {
    dialog,
    open: (next) => {
      approve.reset();
      changes.reset();
      setDialog(next);
    },
    close: () => setDialog(null),
    pending: approve.isPending || changes.isPending,
    error: error === null ? null : describeFlowError(error),
    approve: (version) =>
      approve.mutate(version, {
        onSuccess: () => notify.success('Plan approved'),
        onError: onRefused,
      }),
    requestChanges: (version, comment) =>
      changes.mutate(
        { version, comment },
        {
          onSuccess: () => {
            setDialog(null);
            notify.success('Sent back to the Director');
          },
          onError: onRefused,
        },
      ),
  };
}
