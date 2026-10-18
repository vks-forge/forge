/**
 * PlanTickets: the Tickets section of a plan, with its dependency graph and light editing.
 *
 * Why: approving a plan is the only path that creates tickets (d-0133), so this is the part the
 *   owner scrutinises most: the tickets in the order they would be created, each with what it
 *   does, its priority, what it waits for, its lane and size, and the acceptance criteria that
 *   will decide "done", and the pipeline the Director shaped for it (its changes to the lane, each with
 *   a reason, and a flag when one removes a stage and so needs the owner's approval). The graph beside the list shows the dependencies as a picture. While the
 *   plan is waiting for a decision, "Edit tickets" switches the list into a draft the owner can
 *   change in place (rename, reorder, remove, priority, take off one of the Director's pipeline changes) and send once; any other time the list
 *   is read-only, so an old version or an approved plan can never be edited by accident.
 *
 * Exports: PlanTickets.
 * Depends on: react, api/use-plan, components/ui/button, components/card/priority-mark,
 *   routes/card/plan/*, domain/plan-edit, domain/flow-errors, schemas/plan (type).
 */

import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useEditPlanTickets } from '#/api/use-plan.js';
import { PriorityMark } from '#/components/card/priority-mark.js';
import { Button } from '#/components/ui/button.js';
import { canSaveDraft, draftOf, editBody } from '#/domain/plan-edit.js';
import { describeFlowError } from '#/domain/flow-errors.js';
import { PlanGraphView } from '#/routes/card/plan/plan-graph-view.js';
import { PlanPipelineLine } from '#/routes/card/plan/plan-pipeline-ops.js';
import { PlanSection } from '#/routes/card/plan/plan-sections.js';
import { PlanTicketEditor } from '#/routes/card/plan/plan-ticket-editor.js';
import type { PlanVersion } from '#/schemas/plan.js';
import type { DraftTicket } from '#/types/plan.types.js';

function ReadRow(props: { ticket: PlanVersion['tickets'][number] }) {
  const { ticket } = props;

  return (
    <li
      data-ticket={ticket.key}
      className="grid gap-1.5 rounded-xl border border-line bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-md bg-hover px-1.5 font-data text-xs">{ticket.key}</span>
        <span className="min-w-0 break-words text-sm font-medium">{ticket.title}</span>
        <PriorityMark priority={ticket.priority} always />
        <span className="text-xs text-muted">
          {ticket.lane} · size {ticket.size}
        </span>
      </div>
      {ticket.body ? (
        <p className="min-w-0 break-words text-sm text-muted">{ticket.body}</p>
      ) : null}
      <PlanPipelineLine ticket={ticket} />
      {ticket.depends_on.length > 0 ? (
        <p className="text-xs text-muted">Depends on {ticket.depends_on.join(', ')}</p>
      ) : null}
      {ticket.files.length > 0 ? (
        <p className="text-xs text-muted">
          Touches {ticket.files.length} file{ticket.files.length === 1 ? '' : 's'}
        </p>
      ) : null}
      {ticket.acceptance.length > 0 ? (
        <ul
          aria-label={`Acceptance criteria of ${ticket.key}`}
          className="grid gap-0.5 pl-4 text-xs [&>li]:list-disc"
        >
          {ticket.acceptance.map((criterion, index) => (
            <li key={`${index}-${criterion}`} className="min-w-0 break-words">
              {criterion}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PlanTickets(props: {
  cardId: string;
  plan: PlanVersion;
  /** True only for the newest version of a plan that is waiting for a decision. */
  editable: boolean;
}) {
  const { plan } = props;
  const edit = useEditPlanTickets(props.cardId);
  const [draft, setDraft] = useState<readonly DraftTicket[] | null>(null);

  const save = (current: readonly DraftTicket[]): void => {
    const body = editBody(plan.tickets, current);
    if (body !== null) {
      edit.mutate({ version: plan.version, body }, { onSuccess: () => setDraft(null) });
    }
  };

  return (
    <PlanSection title="Tickets">
      {plan.tickets.length === 0 ? (
        <p className="text-sm text-muted">None.</p>
      ) : (
        <>
          <PlanGraphView tickets={plan.tickets} />
          {draft === null ? (
            <>
              {props.editable ? (
                <div>
                  <Button
                    onClick={() => {
                      edit.reset();
                      setDraft(draftOf(plan.tickets));
                    }}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    Edit tickets
                  </Button>
                </div>
              ) : null}
              <ol aria-label="Planned tickets" className="grid gap-2">
                {plan.tickets.map((ticket) => (
                  <ReadRow key={ticket.key} ticket={ticket} />
                ))}
              </ol>
            </>
          ) : (
            <PlanTicketEditor
              tickets={plan.tickets}
              draft={draft}
              onChange={setDraft}
              canSave={canSaveDraft(plan.tickets, draft)}
              saving={edit.isPending}
              error={edit.isError ? describeFlowError(edit.error) : null}
              onSave={() => save(draft)}
              onDiscard={() => {
                edit.reset();
                setDraft(null);
              }}
            />
          )}
        </>
      )}
    </PlanSection>
  );
}
