/**
 * CancelDialog: the "Cancel this ticket?" confirmation with its live list, cascade and reason.
 *
 * Why: cancelling a ticket cannot be undone and reaches beyond it: the Worker stops, the work
 *   branch is deleted, the pull request closed and the tickets that wait on it are cancelled with
 *   it. So it asks, in words that say all of that, and the owner may say why (optional; written on
 *   the ticket's history and shown to the Director so it does not file the same work again). The
 *   live list of what is stopped and deleted comes from the consequences read; when other tickets
 *   depend on this one the confirm button names them and cancels them together, from the read or,
 *   if the read cannot load, from the dependents the ticket page already knows; a server refusal
 *   for dependents shows them and offers "Cancel all". A refusal is shown inside the dialog, which
 *   stays open. The leave-it button is "Keep running" so two buttons are never both named Cancel.
 *   Both the escalation buttons and the ticket header's menu open this one dialog.
 *
 * Exports: CancelDialog.
 * Depends on: react, components/escalation/escalation-consequences, components/ticket/ticket-link,
 *   components/ui/confirm-dialog, components/ui/field, domain/escalation-copy, types/*.
 */

import { useRef, useState } from 'react';
import { ConsequenceList } from '#/components/escalation/escalation-consequences.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { dependentsOf, describeEscalationError } from '#/domain/escalation-copy.js';
import type { ConsequenceRead } from '#/types/consequence-ui.types.js';
import type { EscalationControls } from '#/types/escalation-ui.types.js';

/**
 * Asks before cancelling; on a refusal for dependents, lists them and offers "Cancel all". The
 * owner may say why (optional): it is written on the ticket's history and shown to the Director.
 */
export function CancelDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controls: EscalationControls;
  ticketId: string;
  /** The live list of what the cancel removes; its dependents decide the button before any refusal. */
  read: ConsequenceRead;
  /** The open tickets that wait on this one, from the ticket page; names them when the live read is unavailable. */
  dependents?: readonly string[] | undefined;
}) {
  const { controls } = props;
  const [reason, setReason] = useState('');
  // From the refusal (the server's list) or, before any refusal, from the live read.
  const refused = dependentsOf(controls.error);
  const known = props.read.data?.action === 'cancel' ? props.read.data.dependents : [];
  const unread = props.read.isError ? (props.dependents ?? []) : [];
  const cascade = refused !== null || known.length > 0 || unread.length > 0;
  const dependents = refused;
  const hasError = controls.error !== null && controls.error !== undefined;
  const waiting = known.length > 0 ? known.length : unread.length;
  // The confirm button closes the dialog by itself; while the server decides, a refusal
  // ("others depend on this") must still have somewhere to be shown, so closing waits for it.
  const holding = useRef(false);
  const close = (): void => {
    holding.current = false;
    setReason('');
    props.onOpenChange(false);
  };

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={(next) => {
        if (next || !holding.current) {
          if (!next) {
            setReason('');
          }

          props.onOpenChange(next);
        }
      }}
      title="Cancel this ticket?"
      description={
        dependents === null
          ? 'The Worker stops now and nothing from this ticket is merged. The ticket is closed as cancelled. Its branch is deleted and its pull request closed; the last commit id stays on the card. The Director is told. This cannot be undone.'
          : 'Other tickets are waiting on this one, so cancelling it alone is not allowed.'
      }
      cancelLabel="Keep running"
      confirmLabel={
        refused !== null
          ? 'Cancel all'
          : waiting > 0
            ? `Cancel ${props.ticketId} and ${waiting} waiting`
            : `Cancel ${props.ticketId}`
      }
      confirmDisabled={props.read.isPending}
      tone="danger"
      onConfirm={() => {
        holding.current = true;
        controls.act(
          {
            action: 'cancel',
            ...(cascade ? { cascade: true } : {}),
            ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
          },
          close,
          () => {
            holding.current = false;
          },
        );
      }}
    >
      {dependents === null ? <ConsequenceList read={props.read} /> : null}
      {dependents === null && unread.length > 0 ? (
        <p className="text-sm">
          These tickets wait on it and are cancelled with it:{' '}
          {unread.map((id, index) => (
            <span key={id}>
              {index > 0 ? ', ' : ''}
              <TicketLink id={id} />
            </span>
          ))}
          .
        </p>
      ) : null}
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
      <Field
        id="escalation-cancel-reason"
        label="Why? (optional)"
        hint="Written on the ticket's history and shown to the Director, so it does not file the same work again."
      >
        <textarea
          id="escalation-cancel-reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
      {hasError && dependents === null ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
          {describeEscalationError(controls.error)}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
