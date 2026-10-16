/**
 * PlanDialogs: the two confirmations for a ready plan, "Approve plan" and "Request changes".
 *
 * Why: approving creates real tickets and cannot be undone from the plan (d-0133), so it asks
 *   first and says exactly what will happen: how many tickets, in which order. Requesting changes
 *   needs words the Director can act on, so it takes a comment of at least five characters and
 *   keeps the Send button off until there is one. Escape and Cancel leave without sending
 *   anything. Both belong to the Card page so the Plan tab buttons and the Needs you banner open
 *   the very same dialog.
 *
 * Exports: PlanDialogs.
 * Depends on: react, api/use-plan, components/ui/confirm-dialog, components/ui/modal,
 *   components/ui/button, components/ui/field, types/plan.types.
 */

import { useState } from 'react';
import { usePlan } from '#/api/use-plan.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { Modal } from '#/components/ui/modal.js';
import type { PlanDecisions } from '#/types/plan.types.js';

const MIN_COMMENT = 5;

export function PlanDialogs(props: { cardId: string; decisions: PlanDecisions }) {
  const { decisions } = props;
  const plan = usePlan(props.cardId).data?.current ?? null;
  const [comment, setComment] = useState('');

  if (plan === null) {
    return null;
  }

  const count = plan.tickets.length;
  const order = plan.tickets.map((t) => t.title).join(', ');
  const valid = comment.trim().length >= MIN_COMMENT;

  return (
    <>
      <ConfirmDialog
        open={decisions.dialog === 'approve'}
        onOpenChange={(open) => (open ? decisions.open('approve') : decisions.close())}
        title={`Approve plan v${plan.version}?`}
        description={`Creates ${count} ticket${count === 1 ? '' : 's'} in this order: ${order}. The first ticket that waits for nothing starts right away.`}
        confirmLabel="Approve plan"
        onConfirm={() => decisions.approve(plan.version)}
      />
      <Modal
        open={decisions.dialog === 'changes'}
        onClose={() => {
          setComment('');
          decisions.close();
        }}
        title="Request changes"
        description="The Director asks again only about what you name, then writes the next version of the plan."
        dirty={comment.trim() !== ''}
        busy={decisions.pending}
        primary={
          <Button
            variant="primary"
            disabled={!valid}
            status={decisions.pending ? 'loading' : 'idle'}
            onClick={() => decisions.requestChanges(plan.version, comment.trim())}
          >
            Send to the Director
          </Button>
        }
      >
        <Field
          id="plan-changes-comment"
          label="What should change?"
          hint={`At least ${MIN_COMMENT} characters.`}
        >
          <textarea
            id="plan-changes-comment"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        {decisions.error !== null ? (
          <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm">
            {decisions.error}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
