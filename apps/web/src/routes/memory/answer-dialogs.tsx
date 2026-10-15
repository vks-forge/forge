/**
 * Approve and reject dialogs for a Director proposal.
 *
 * Why: an answer is permanent. The API has no "undo", so an undo window would be a promise
 *   the server cannot keep; the honest protection is one clear question first. Approving makes
 *   the statement a standing constraint the Director plans against (d-0007); rejecting
 *   writes it into memory as a rejected approach, with a reason that stops it being proposed
 *   again. Rejecting therefore requires a reason (the server refuses an empty one), and the
 *   dialog repeats the proposal's own words so the owner confirms the right record.
 *
 * Exports: ApproveDialog, RejectDialog.
 * Depends on: react, components/ui/{confirm-dialog,field}.
 */

import { useState } from 'react';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';

export function ApproveDialog(props: {
  statement: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={props.statement !== null}
      onOpenChange={(open) => {
        if (!open) {
          props.onCancel();
        }
      }}
      title="Approve this proposal?"
      description="It becomes a decision the Director must follow when planning work on this project. You cannot undo this here; a later decision can replace it."
      confirmLabel="Approve proposal"
      onConfirm={props.onConfirm}
    >
      <blockquote className="rounded-lg bg-hover px-3 py-2 text-sm">
        {props.statement}
      </blockquote>
    </ConfirmDialog>
  );
}

export function RejectDialog(props: {
  statement: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  return (
    <ConfirmDialog
      open={props.statement !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason('');
          props.onCancel();
        }
      }}
      title="Reject this proposal?"
      description="It is kept as a rejected approach so the Director does not propose it again. You cannot undo this here."
      confirmLabel="Reject proposal"
      tone="danger"
      confirmDisabled={trimmed === ''}
      onConfirm={() => {
        props.onConfirm(trimmed);
        setReason('');
      }}
    >
      <blockquote className="rounded-lg bg-hover px-3 py-2 text-sm">
        {props.statement}
      </blockquote>
      <Field
        id="reject-reason"
        label="Why are you rejecting it?"
        hint="Required. Shown with the rejected record."
      >
        <textarea
          id="reject-reason"
          aria-describedby="reject-reason-hint"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
    </ConfirmDialog>
  );
}
