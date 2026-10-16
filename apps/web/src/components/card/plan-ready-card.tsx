/**
 * PlanReadyCard: the chat's announcement that a plan is waiting, with the way to review it.
 *
 * Why: when the grill ends the Director writes the plan into the Plan tab and says so in the
 *   chat (d-0132). The owner may be reading the conversation, so the announcement carries the
 *   two facts that decide whether to open it (the version and how many tickets it would create)
 *   and one button that opens the Plan tab, so the next step is never a hunt. When the Director
 *   could approve this plan itself, the card says so, so the owner knows a wait is not needed.
 *
 * Exports: PlanReadyCard.
 * Depends on: react, lucide-react, components/ui/button.
 */

import { ClipboardList } from 'lucide-react';
import { Button } from '#/components/ui/button.js';

export function PlanReadyCard(props: {
  text: string;
  ticketCount: number;
  autoApprove: boolean;
  onReview: () => void;
}) {
  return (
    <div className="grid max-w-[92%] gap-2 rounded-2xl border border-signal/50 bg-signal-soft p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ClipboardList aria-hidden="true" className="size-4 shrink-0 text-signal" />
        {props.text}
      </p>
      <p className="text-xs text-muted">
        {props.ticketCount} ticket{props.ticketCount === 1 ? '' : 's'}
        {props.autoApprove ? ' · the Director may approve this itself' : ''}
      </p>
      <div>
        <Button variant="primary" onClick={props.onReview}>
          Review plan
        </Button>
      </div>
    </div>
  );
}
