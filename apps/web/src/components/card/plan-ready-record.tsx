/**
 * PlanReadyRecord: the chat's quiet line that a plan is ready, with a link to read it.
 *
 * Why: the decision on a ready plan is made in the needs-you dock and the plan itself is read
 *   in the side rail, so the chat keeps only the record: which version, how many tickets, and a
 *   text link that opens the plan beside (or, on a narrow screen, over) the conversation. It is
 *   deliberately not a button: the one primary action for a waiting plan lives in the dock.
 *   When the Director could approve the plan itself, the line says so, so a wait is not assumed.
 *
 * Exports: PlanReadyRecord.
 * Depends on: react, lucide-react.
 */

import { ClipboardList } from 'lucide-react';

export function PlanReadyRecord(props: {
  text: string;
  ticketCount: number;
  autoApprove: boolean;
  onOpen: () => void;
}) {
  return (
    <p className="flex max-w-[92%] flex-wrap items-center gap-x-1.5 text-sm">
      <ClipboardList aria-hidden="true" className="size-4 shrink-0 text-signal" />
      <span className="font-medium">{props.text}</span>
      <span className="text-xs text-muted">
        {props.ticketCount} ticket{props.ticketCount === 1 ? '' : 's'}
        {props.autoApprove ? ' · the Director may approve this itself' : ''}
      </span>
      <button
        type="button"
        onClick={props.onOpen}
        className="min-h-9 rounded-md px-1 text-sm font-medium text-signal underline-offset-2 hover:underline"
      >
        Open plan →
      </button>
    </p>
  );
}
