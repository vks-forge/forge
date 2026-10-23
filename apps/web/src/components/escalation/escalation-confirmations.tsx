/**
 * Escalation confirmations: the Re-plan, Merge anyway and Cancel ticket popups with their live lists.
 *
 * Why: these three buttons reach beyond the ticket they sit on, so each popup reads what it would
 *   change when it opens (held tickets, what is deleted, which check is overruled) and lists it in
 *   plain words before the owner commits. The confirm button names the act and the ticket
 *   ("Re-plan CHE-6"), Cancel is focused first, and for a mechanical stop (setup, lockfile, generated
 *   file) Re-plan offers the cheaper Send back for rework, or Retry, with a button. Each wrapper owns
 *   its own read so it only runs while its popup is open.
 *
 * Exports: ReplanConfirm, MergeAnywayConfirm, CancelConfirm.
 * Depends on: api/use-consequences, components/escalation/escalation-consequences,
 *   components/escalation/escalation-dialogs, components/escalation/escalation-cancel-dialog, domain/escalation-copy, types/*.
 */

import { useActionConsequences } from '#/api/use-consequences.js';
import { ConsequenceList } from '#/components/escalation/escalation-consequences.js';
import { CancelDialog } from '#/components/escalation/escalation-cancel-dialog.js';
import { CommentDialog } from '#/components/escalation/escalation-dialogs.js';
import { ACTION_LABEL, replanConsequence } from '#/domain/escalation-copy.js';
import type { EscalationAction } from '#/schemas/escalation.js';
import type { CheaperAction, ConfirmationBase } from '#/types/consequence-ui.types.js';
import type { ConflictReplan } from '#/types/escalation-ui.types.js';

/** Re-plan: lists the held and kept tickets and the stop the Director will get; offers the cheaper action for a mechanical stop. */
export function ReplanConfirm(
  props: ConfirmationBase & {
    onClose: () => void;
    onDone: () => void;
    /** The actions on offer, to find the cheaper one. */
    actions: readonly EscalationAction[];
    /** Takes the cheaper way: closes this popup and opens (or performs) it. */
    onCheaper: (action: 'rework' | 'retry') => void;
    /** A merge conflict re-plans from one ticket with its own words and a starting note. */
    replan?: ConflictReplan | undefined;
  },
) {
  const read = useActionConsequences(props.ticketId, 'replan', props.open);
  const cheaperAction = props.actions.includes('rework')
    ? 'rework'
    : props.actions.includes('retry')
      ? 'retry'
      : null;

  const cheaper: CheaperAction | undefined =
    cheaperAction === null
      ? undefined
      : {
          action: cheaperAction,
          label: ACTION_LABEL[cheaperAction],
          onUse: () => props.onCheaper(cheaperAction),
        };

  return (
    <CommentDialog
      open={props.open}
      onClose={props.onClose}
      onDone={props.onDone}
      controls={props.controls}
      action="replan"
      title={props.replan?.title ?? 'Re-plan this card?'}
      description={
        props.replan?.description ??
        (read.data === undefined
          ? replanConsequence()
          : 'The card goes back to planning with your comment. This is what changes.')
      }
      initialComment={props.replan?.comment}
      label="What should the new plan do differently?"
      sendLabel={`Re-plan ${props.ticketId}`}
      sendDisabled={read.isPending}
      focusCancel
      preview={<ConsequenceList read={read} cheaper={cheaper} />}
    />
  );
}

/** Merge anyway: lists the check it overrules and what the merge then does. */
export function MergeAnywayConfirm(
  props: ConfirmationBase & { onClose: () => void; onDone: () => void },
) {
  const read = useActionConsequences(props.ticketId, 'merge_anyway', props.open);

  return (
    <CommentDialog
      open={props.open}
      onClose={props.onClose}
      onDone={props.onDone}
      controls={props.controls}
      action="merge_anyway"
      title="Merge anyway?"
      description="This merges the change although a check found blocking problems. The merge cannot be undone from Forge."
      label="Why is it fine to merge?"
      sendLabel={`Merge ${props.ticketId} anyway`}
      sendDisabled={read.isPending}
      focusCancel
      footnote="Recorded on the card. Only you can do this. The gates still passed."
      preview={<ConsequenceList read={read} />}
    />
  );
}

/** Cancel ticket: lists what is stopped and deleted, and the tickets that wait on it. */
export function CancelConfirm(
  props: ConfirmationBase & {
    onOpenChange: (open: boolean) => void;
    /** The tickets that wait on this one, when the page already knows them (the header's cancel). */
    dependents?: readonly string[] | undefined;
  },
) {
  const read = useActionConsequences(props.ticketId, 'cancel', props.open);

  return (
    <CancelDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      controls={props.controls}
      ticketId={props.ticketId}
      read={read}
      dependents={props.dependents}
    />
  );
}
