/**
 * InboxBudget: the drawer body for "Change cap" on a budget warning.
 *
 * Why: a budget warning says a card has spent most of what its owner meant it to, and the
 *   two sensible answers are "I know, carry on" (Acknowledge on the row) and "carry on, but
 *   warn me later" (a new cap). The second belongs where the owner is, not a click away on
 *   another page, so this opens the same cap box as the card's Details tab, with the card's
 *   current cap. It reads the card first so the box starts from the real cap, and says so in
 *   words when the card cannot be read or is closed. Saving changes the cap the warning was
 *   written for, so the server warns again at the new cap if spend already passes it.
 *
 * Exports: InboxBudget.
 * Depends on: api/use-card, api/describe-error, components/card/budget-cap-field,
 *   components/status/state-panel.
 */

import { describeError } from '#/api/describe-error.js';
import { useCardDetail } from '#/api/use-card.js';
import { BudgetCapForm } from '#/components/card/budget-cap-field.js';
import { StatePanel } from '#/components/status/state-panel.js';

export function InboxBudget(props: { cardId: string; onDone: () => void }) {
  const card = useCardDetail(props.cardId);

  if (card.isPending) {
    return <StatePanel kind="loading" label="Loading the card" />;
  }

  if (card.isError || !card.data) {
    return (
      <StatePanel
        kind="error"
        title={describeError(card.error).title}
        detail={describeError(card.error).detail}
        onRetry={() => void card.refetch()}
        retrying={card.isFetching}
      />
    );
  }

  if (card.data.closed_reason !== undefined) {
    return (
      <p role="status" className="text-sm">
        This card is closed, so its cap cannot change. Acknowledge the warning to clear
        it.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">
        The warning is only a warning: the card keeps working whatever you choose here.
      </p>
      <BudgetCapForm
        cardId={card.data.id}
        cap={card.data.budget_cap_usd}
        onSaved={props.onDone}
        onCancel={props.onDone}
      />
    </div>
  );
}
