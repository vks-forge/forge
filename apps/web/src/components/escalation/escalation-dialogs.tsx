/**
 * Escalation dialogs: "Re-plan", "Send back for rework", "Merge anyway" and "Continue" ask for
 * words, and "Approve and merge" asks before it merges.
 *
 * Why: re-planning sends the whole card back to the Director and rework sends one ticket back to
 *   a Worker; both are useless without a reason, so each takes a comment of at least five
 *   characters and keeps Send off until there is one, and Re-plan says what happens to the
 *   card's tickets before the owner commits. Merge anyway and Continue overrule a hold, so they
 *   need the owner's reason too (it is recorded on the card), and Merge anyway says it cannot be
 *   undone. A refusal is shown inside the dialog so it never closes on a failure. A comment dialog
 *   can start with a note the owner may edit (the merge-conflict re-plan names its ticket). Re-plan
 *   and Merge anyway carry a live list of what they change (a `preview`, drawn by
 *   escalation-consequences), open with Cancel focused, hold their confirm until that list has
 *   loaded (or failed, when the generic words stand) and name the ticket on the confirm button.
 *   Cancelling a ticket has its own dialog (escalation-cancel-dialog).
 *
 * Exports: CommentDialog, MergeDialog (the cancel dialog is in escalation-cancel-dialog).
 * Depends on: react, components/ui/button, components/ui/confirm-dialog, components/ui/field,
 *   components/ui/modal, domain/escalation-copy.
 */

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { Modal } from '#/components/ui/modal.js';
import { describeEscalationError } from '#/domain/escalation-copy.js';
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
  footnote?: string | undefined;
  /** A note the field starts with and returns to when the dialog is closed; the owner can edit or clear it. */
  initialComment?: string | undefined;
  /** What the action changes, listed between the description and the comment field. */
  preview?: ReactNode;
  /** Holds Send while the preview loads. */
  sendDisabled?: boolean;
  /** Opens with Cancel focused (a far-reaching action). */
  focusCancel?: boolean;
}) {
  const { controls } = props;
  const start = props.initialComment ?? '';
  const [comment, setComment] = useState(start);
  const id = `escalation-${props.action}-comment`;
  const busy = controls.pending === props.action;
  const close = (): void => {
    setComment(start);
    props.onClose();
  };

  const done = (): void => {
    setComment(start);
    (props.onDone ?? props.onClose)();
  };

  return (
    <Modal
      open={props.open}
      onClose={close}
      title={props.title}
      description={props.description}
      dirty={comment.trim() !== start.trim()}
      busy={busy}
      focusCancel={props.focusCancel === true}
      primary={
        <Button
          variant="primary"
          disabled={comment.trim().length < MIN_COMMENT || props.sendDisabled === true}
          status={busy ? 'loading' : 'idle'}
          onClick={() =>
            controls.act({ action: props.action, comment: comment.trim() }, done)
          }
        >
          {props.sendLabel}
        </Button>
      }
    >
      {props.preview === undefined ? null : <div className="mb-4">{props.preview}</div>}
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
