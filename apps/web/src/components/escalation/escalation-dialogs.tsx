/**
 * Escalation dialogs: "Re-plan", "Send back for rework", "Merge anyway" and "Continue" ask for
 * words, "Cancel ticket" asks before it throws work away.
 *
 * Why: re-planning sends the whole card back to the Director and rework sends one ticket back to
 *   a Worker; both are useless without a reason, so each takes a comment of at least five
 *   characters and keeps Send off until there is one, and Re-plan says what happens to the
 *   card's tickets before the owner commits. Merge anyway and Continue overrule a hold, so they
 *   need the owner's reason too (it is recorded on the card), and Merge anyway says it cannot be
 *   undone. Cancelling cannot be undone, so it asks; when other tickets depend on this one the server refuses a plain cancel, and the dialog then lists them
 *   and offers "Cancel all" instead of leaving the owner with a bare error. A refusal is shown
 *   inside the dialog so it never closes on a failure.
 *
 * Exports: CommentDialog, CancelDialog, MergeDialog.
 * Depends on: react, components/ui/button, components/ui/confirm-dialog, components/ui/field,
 *   components/ui/modal, components/ticket/ticket-link, domain/escalation-copy.
 */

import { useRef, useState } from 'react';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { Modal } from '#/components/ui/modal.js';
import { dependentsOf, describeEscalationError } from '#/domain/escalation-copy.js';
import type { EscalationControls } from '#/types/escalation-ui.types.js';

const MIN_COMMENT = 5;

/** A dialog that takes a comment (re-plan, rework, merge anyway, continue) and sends it. */
export function CommentDialog(props: {
  open: boolean;
  onClose: () => void;
  /**
   * Called instead of `onClose` once the server accepted the comment. Closing a dismissed dialog
   * clears the shown refusal; closing an accepted one must not, or it would also clear the answer
   * the card is about to show ("Merged anyway by you").
   */
  onDone?: () => void;
  controls: EscalationControls;
  action: 'replan' | 'rework' | 'merge_anyway' | 'continue';
  title: string;
  description: string;
  label: string;
  sendLabel: string;
  /** One more line under the field, such as "Recorded on the card. Only you can do this." */
  footnote?: string;
}) {
  const { controls } = props;
  const [comment, setComment] = useState('');
  const id = `escalation-${props.action}-comment`;
  const busy = controls.pending === props.action;
  const close = (): void => {
    setComment('');
    props.onClose();
  };

  const done = (): void => {
    setComment('');
    (props.onDone ?? props.onClose)();
  };

  return (
    <Modal
      open={props.open}
      onClose={close}
      title={props.title}
      description={props.description}
      dirty={comment.trim() !== ''}
      busy={busy}
      primary={
        <Button
          variant="primary"
          disabled={comment.trim().length < MIN_COMMENT}
          status={busy ? 'loading' : 'idle'}
          onClick={() =>
            controls.act({ action: props.action, comment: comment.trim() }, done)
          }
        >
          {props.sendLabel}
        </Button>
      }
    >
      <Field
        id={id}
        label={props.label}
        hint={`At least ${MIN_COMMENT} characters.${props.footnote === undefined ? '' : ` ${props.footnote}`}`}
      >
        <textarea
          id={id}
          rows={4}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
      {controls.error !== null && controls.error !== undefined ? (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm">
          {describeEscalationError(controls.error)}
        </p>
      ) : null}
    </Modal>
  );
}

/**
 * Asks before merging finished work: merging cannot be undone from Forge. Tier C (`sign_off`) asks
 * who signs it off. A refusal (the PR changed, a conflict) is shown inside the dialog, which then
 * stays open so the owner can read it.
 */
export function MergeDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controls: EscalationControls;
  action: 'approve' | 'sign_off';
}) {
  const { controls, action } = props;
  const [signer, setSigner] = useState('owner');
  const signing = action === 'sign_off';
  const hasError = controls.error !== null && controls.error !== undefined;
  // As with Cancel: the confirm button closes the dialog by itself, but a refusal must stay
  // readable, so closing waits for the server's answer.
  const holding = useRef(false);

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={(next) => {
        if (next || !holding.current) {
          props.onOpenChange(next);
        }
      }}
      title={signing ? 'Sign off and merge?' : 'Approve and merge?'}
      description={
        signing
          ? 'You sign off a change that touches protected paths. It is merged into the main branch now, and that cannot be undone from Forge.'
          : 'The checked change is merged into the main branch now. That cannot be undone from Forge.'
      }
      confirmLabel={signing ? 'Sign off and merge' : 'Approve and merge'}
      confirmDisabled={signing && signer.trim() === ''}
      onConfirm={() => {
        holding.current = true;
        controls.act(
          signing ? { action, signer: signer.trim() } : { action },
          () => {
            holding.current = false;
            props.onOpenChange(false);
          },
          () => {
            holding.current = false;
          },
        );
      }}
    >
      {signing ? (
        <Field id="escalation-signer" label="Signed off by" hint="Recorded on the card.">
          <input
            id="escalation-signer"
            value={signer}
            onChange={(event) => setSigner(event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      ) : null}
      {hasError ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
          {describeEscalationError(controls.error)}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

/** Asks before cancelling; on a refusal for dependents, lists them and offers "Cancel all". */
export function CancelDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controls: EscalationControls;
}) {
  const { controls } = props;
  const dependents = dependentsOf(controls.error);
  const hasError = controls.error !== null && controls.error !== undefined;
  // The confirm button closes the dialog by itself; while the server decides, a refusal
  // ("others depend on this") must still have somewhere to be shown, so closing waits for it.
  const holding = useRef(false);
  const close = (): void => {
    holding.current = false;
    props.onOpenChange(false);
  };

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={(next) => {
        if (next || !holding.current) {
          props.onOpenChange(next);
        }
      }}
      title="Cancel this ticket?"
      description={
        dependents === null
          ? 'The ticket stops and is closed as cancelled. This cannot be undone.'
          : 'Other tickets are waiting on this one, so cancelling it alone is not allowed.'
      }
      confirmLabel={dependents === null ? 'Cancel ticket' : 'Cancel all'}
      tone="danger"
      onConfirm={() => {
        holding.current = true;
        controls.act(
          dependents === null
            ? { action: 'cancel' }
            : { action: 'cancel', cascade: true },
          close,
          () => {
            holding.current = false;
          },
        );
      }}
    >
      {dependents !== null && dependents.length > 0 ? (
        <div className="grid gap-1 text-sm">
          <p>
            Cancel all stops this ticket and every ticket that depends on it:{' '}
            {dependents.map((id, index) => (
              <span key={id}>
                {index > 0 ? ', ' : ''}
                <TicketLink id={id} />
              </span>
            ))}
            .
          </p>
        </div>
      ) : null}
      {hasError && dependents === null ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
          {describeEscalationError(controls.error)}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
