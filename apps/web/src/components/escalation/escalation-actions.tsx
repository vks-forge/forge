/**
 * EscalationActions: one button per action the server offered, in the order it listed them.
 *
 * Why: a ticket that waits on the owner must always show at least one working way forward
 *   (d-0135), and the same set of buttons must read the same in the card chat, on the Ticket
 *   page and in the Inbox. The server decides which actions apply (`view.actions`); this draws
 *   them in the owner's words and wires each to its call: Retry takes an optional note for the
 *   Worker, Re-plan, Send back for rework, Merge anyway and Continue open a dialog that asks for a comment (and Re-plan
 *   says what happens to the tickets; Merge anyway says it merges despite held findings and cannot
 *   be undone), Approve and merge / Sign off and merge ask before they merge
 *   (a merge cannot be undone), Cancel asks before it acts, Run as Express and "I fixed
 *   it, check again" act at once. The first action is the primary one (never Merge anyway, which
 *   overrules a hold); Cancel is the only danger-styled button. `answer` has its own form and is skipped here, as are the engine-only `pipeline_ready` and `substitute`. An action this UI has no
 *   button for never reaches this component (the schema drops it).
 *
 * Exports: EscalationActions.
 * Depends on: react, components/escalation/escalation-dialogs, components/ui/button,
 *   components/ui/field, domain/escalation-copy, schemas/escalation (types),
 *   types/escalation-ui.types.
 */

import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CancelDialog,
  CommentDialog,
  MergeDialog,
} from '#/components/escalation/escalation-dialogs.js';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { ACTION_LABEL, replanConsequence } from '#/domain/escalation-copy.js';
import type { EscalationAction } from '#/schemas/escalation.js';
import type { EscalationControls } from '#/types/escalation-ui.types.js';

export function EscalationActions(props: {
  id: string;
  actions: readonly EscalationAction[];
  controls: EscalationControls;
  /** Rendered before the buttons, such as the "Fix in settings" link. */
  lead?: ReactNode;
  /** One line under a Retry that does something other than it says (the rework-cap case). */
  retryHint?: string | undefined;
}) {
  const { controls } = props;
  const [dialog, setDialog] = useState<
    | 'replan'
    | 'rework'
    | 'merge_anyway'
    | 'continue'
    | 'cancel'
    | 'approve'
    | 'sign_off'
    | null
  >(null);

  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  // `pipeline_ready` (a held lane went live) and `substitute` (the Director swapped the agent)
  // are engine-only and never offered to the owner.
  const actions = props.actions.filter(
    (
      action,
    ): action is Exclude<EscalationAction, 'answer' | 'pipeline_ready' | 'substitute'> =>
      action !== 'answer' && action !== 'pipeline_ready' && action !== 'substitute',
  );

  const busy = controls.pending !== null;
  const open = (which: NonNullable<typeof dialog>): void => {
    controls.reset();
    setDialog(which);
  };

  const close = (): void => {
    controls.reset();
    setDialog(null);
  };

  // An accepted comment closes its dialog but keeps the answer the card is about to show.
  const done = (): void => setDialog(null);

  const style = (
    action: EscalationAction,
    index: number,
  ): 'primary' | 'quiet' | 'danger' => {
    if (action === 'cancel') {
      return 'danger';
    }

    // Merge anyway overrules a hold, so it is never the highlighted choice.
    const first = actions[0] === 'merge_anyway' ? 1 : 0;

    return index === first && props.lead === undefined ? 'primary' : 'quiet';
  };

  const button = (action: (typeof actions)[number], index: number): ReactNode => {
    const common = {
      variant: style(action, index),
      disabled: busy && controls.pending !== action,
      status: controls.pending === action ? ('loading' as const) : ('idle' as const),
    };

    switch (action) {
      case 'retry':
        return (
          <Button
            {...common}
            onClick={() =>
              controls.act({
                action: 'retry',
                ...(note.trim() === '' ? {} : { note: note.trim() }),
              })
            }
          >
            {ACTION_LABEL.retry}
          </Button>
        );
      case 'replan':
      case 'rework':
      case 'merge_anyway':
      case 'continue':
        return (
          <Button {...common} onClick={() => open(action)}>
            {ACTION_LABEL[action]}
          </Button>
        );
      case 'approve':
      case 'sign_off':
        return (
          <Button {...common} onClick={() => open(action)}>
            {ACTION_LABEL[action]}
          </Button>
        );
      case 'cancel':
        return (
          <Button {...common} onClick={() => open('cancel')}>
            {ACTION_LABEL.cancel}
          </Button>
        );
      default:
        return (
          <Button {...common} onClick={() => controls.act({ action })}>
            {ACTION_LABEL[action]}
          </Button>
        );
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {props.lead}
        {actions.map((action, index) => (
          <Fragment key={action}>{button(action, index)}</Fragment>
        ))}
        {actions.includes('retry') ? (
          <button
            type="button"
            aria-expanded={noting}
            onClick={() => setNoting((value) => !value)}
            className="min-h-9 rounded-lg px-2 text-sm text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            {noting ? 'Hide note' : 'Add a note for the retry'}
          </button>
        ) : null}
      </div>
      {actions.includes('retry') && props.retryHint !== undefined ? (
        <p className="text-xs text-muted">{props.retryHint}</p>
      ) : null}
      {noting && actions.includes('retry') ? (
        <div className="grid gap-1">
          <label htmlFor={`${props.id}-note`} className="text-sm font-medium">
            Note for the Worker (optional)
          </label>
          <textarea
            id={`${props.id}-note`}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      ) : null}
      {actions.includes('replan') ? (
        <CommentDialog
          open={dialog === 'replan'}
          onClose={close}
          onDone={done}
          controls={controls}
          action="replan"
          title="Re-plan this card?"
          description={replanConsequence()}
          label="What should the new plan do differently?"
          sendLabel="Send to the Director"
        />
      ) : null}
      {actions.includes('rework') ? (
        <CommentDialog
          open={dialog === 'rework'}
          onClose={close}
          onDone={done}
          controls={controls}
          action="rework"
          title="Send back for rework"
          description="A Worker starts again on this ticket with your comment."
          label="What needs to change?"
          sendLabel="Send back"
        />
      ) : null}
      {actions.includes('merge_anyway') ? (
        <CommentDialog
          open={dialog === 'merge_anyway'}
          onClose={close}
          onDone={done}
          controls={controls}
          action="merge_anyway"
          title="Merge anyway?"
          description="This merges the change although a check found blocking problems. The merge cannot be undone from Forge."
          label="Why is it fine to merge?"
          sendLabel="Merge anyway"
          footnote="Recorded on the card. Only you can do this. The gates still passed."
        />
      ) : null}
      {actions.includes('continue') ? (
        <CommentDialog
          open={dialog === 'continue'}
          onClose={close}
          onDone={done}
          controls={controls}
          action="continue"
          title="Continue as is?"
          description="The work touched files the plan did not name. It carries on to its checks and sign-off as it is."
          label="Why is it fine to go on?"
          sendLabel="Continue"
          footnote="Recorded on the card. Only you can do this."
        />
      ) : null}
      {actions.includes('approve') || actions.includes('sign_off') ? (
        <MergeDialog
          open={dialog === 'approve' || dialog === 'sign_off'}
          onOpenChange={(next) =>
            next
              ? setDialog(actions.includes('approve') ? 'approve' : 'sign_off')
              : close()
          }
          controls={controls}
          action={actions.includes('sign_off') ? 'sign_off' : 'approve'}
        />
      ) : null}
      {actions.includes('cancel') ? (
        <CancelDialog
          open={dialog === 'cancel'}
          onOpenChange={(next) => (next ? setDialog('cancel') : close())}
          controls={controls}
        />
      ) : null}
    </div>
  );
}
