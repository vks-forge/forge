/**
 * PlanImpact: what approving the plan would cancel, and what of that the plan does not cover.
 *
 * Why: approving a re-plan cancels the earlier tickets that have no run. The owner decides on the
 *   plan, so they must see that effect before the click, not in the card history afterwards; and a
 *   cancelled ticket whose work the new plan neither plans nor drops on purpose is the one case that
 *   loses work unnoticed. Two plain lists carry it, and the second says how to get out (approve
 *   anyway, or ask for changes). Nothing renders when approval cancels nothing.
 *
 * Exports: PlanImpact.
 * Depends on: react, lucide-react, schemas/plan (type).
 */

import { CircleAlert } from 'lucide-react';
import type { PlanImpactTicket } from '#/schemas/plan.js';

function TicketList(props: { label: string; tickets: readonly PlanImpactTicket[] }) {
  return (
    <ul aria-label={props.label} className="grid gap-0.5 pl-6 text-xs [&>li]:list-disc">
      {props.tickets.map((t) => (
        <li key={t.id} className="min-w-0 break-words">
          <span className="font-medium">{t.id}</span> {t.title}
        </li>
      ))}
    </ul>
  );
}

export function PlanImpact(props: {
  willCancel: readonly PlanImpactTicket[];
  notCovered: readonly PlanImpactTicket[];
  alreadyExists: readonly PlanImpactTicket[];
}) {
  const { willCancel, notCovered, alreadyExists } = props;
  if (willCancel.length === 0 && alreadyExists.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
      {willCancel.length > 0 ? (
        <section className="grid gap-1">
          <h3 className="font-medium">Will be cancelled when you approve</h3>
          <p className="pl-6 text-xs text-muted">
            Tickets with a run stay as they are, unless you asked to re-plan from them.
          </p>
          <TicketList label="Will be cancelled when you approve" tickets={willCancel} />
        </section>
      ) : null}
      {alreadyExists.length > 0 ? (
        <section className="grid gap-1">
          <h3 className="flex items-center gap-2 font-medium">
            <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-attn" />
            Already exists
          </h3>
          <p className="pl-6 text-xs text-muted">
            The plan reuses the key of a ticket that has started, so the work would exist
            twice. Request changes to give it a new key or remove it.
          </p>
          <TicketList label="Already exists" tickets={alreadyExists} />
        </section>
      ) : null}
      {notCovered.length > 0 ? (
        <section className="grid gap-1">
          <h3 className="flex items-center gap-2 font-medium">
            <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-attn" />
            Not covered by the new plan
          </h3>
          <p className="pl-6 text-xs text-muted">
            The plan neither plans this work nor says it is dropped. Approve anyway, or
            request changes so the plan covers it.
          </p>
          <TicketList label="Not covered by the new plan" tickets={notCovered} />
        </section>
      ) : null}
    </div>
  );
}
