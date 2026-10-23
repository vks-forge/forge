/**
 * CloseDialog: the confirmation for closing a card, with its required reason.
 *
 * Why: closing is recorded, shown to everyone who opens the card later, and cannot be undone
 *   from the page, so it always asks first and always needs a reason. Two places start it: the
 *   "Close card" button in the header, and the "Close card" shortcut on the Director's close
 *   suggestion in the chat, which arrives with the Director's reason prefilled for the user to
 *   keep or edit. It says what closing really does (a running Worker stops, unfinished tickets are cancelled, merged work stays). The dialog is controlled by the page so both can open it; Escape and Cancel
 *   leave the card open.
 *
 * Exports: CloseDialog.
 * Depends on: react, components/ui/confirm-dialog, components/ui/field.
 */

import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { INPUT_CLASS } from '#/components/ui/field.js';

export function CloseDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: (reason: string) => void;
}) {
  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Close this card?"
      description="Closing stops any running Worker and cancels this card’s unfinished tickets. Work already merged stays. You cannot reopen it from here. The reason is recorded and shown to anyone who opens the card."
      confirmLabel="Close card"
      tone="danger"
      confirmDisabled={props.reason.trim() === ''}
      onConfirm={() => {
        props.onConfirm(props.reason.trim());
        props.onOpenChange(false);
      }}
    >
      <div className="grid gap-1.5">
        <label htmlFor="close-reason" className="text-sm font-medium">
          Reason (required)
        </label>
        <textarea
          id="close-reason"
          rows={3}
          value={props.reason}
          onChange={(event) => props.onReasonChange(event.target.value)}
          placeholder="Why is this card being closed?"
          className={INPUT_CLASS}
        />
      </div>
    </ConfirmDialog>
  );
}
