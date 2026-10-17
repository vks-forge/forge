/**
 * MessageComposer: the box under a card chat and under a live Worker thread.
 *
 * Why: both places do the same thing, say something to an agent that may answer later, and
 *   share the same risks: the send can be refused and the words must not be lost. The draft
 *   therefore lives outside the form in the persisted drafts store (state/message-draft), the
 *   text stays in the box until the parent says the send worked (`clear`), and a refusal is
 *   shown right under the box in plain words with the way forward. While a send is in flight
 *   the button is busy and a second send is blocked. Ctrl or Cmd + Enter sends. When messages
 *   cannot be sent at all (a closed card, an archived project) the box is disabled and says why,
 *   never just greyed. It is docked at the bottom of the chat pane (components/chat/chat-pane):
 *   a short box with the Send button beside it, so on a phone the keyboard leaves room for the
 *   conversation above it; the hint and refusal sit under the box.
 *
 * Exports: MessageComposer.
 * Depends on: react, components/ui/button, state/message-draft, state/project-archived.
 */

import type { ReactNode } from 'react';
import { Button } from '#/components/ui/button.js';
import { useMessageDraft } from '#/state/message-draft.js';
import { useProjectArchived } from '#/state/project-archived.js';

const ARCHIVED_REASON = 'This project is archived. Unarchive it to send messages.';

export function MessageComposer(props: {
  id: string;
  label: string;
  draftKey: string;
  sendLabel: string;
  placeholder?: string;
  hint?: ReactNode;
  /** When set, the box is disabled and this says why. */
  disabledReason?: string | undefined;
  sending: boolean;
  /** A plain-words refusal to show under the box; the draft is still in it. */
  error?: string | null | undefined;
  onSend: (text: string, clear: () => void) => void;
}) {
  const { draft, setDraft, clearDraft } = useMessageDraft(props.draftKey);
  const archived = useProjectArchived();
  const disabledReason = props.disabledReason ?? (archived ? ARCHIVED_REASON : undefined);
  const blocked = disabledReason !== undefined;
  const send = (): void => {
    const text = draft.trim();
    if (text !== '' && !props.sending && !blocked) {
      props.onSend(text, clearDraft);
    }
  };

  return (
    <form
      className="grid gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <label htmlFor={props.id} className="sr-only">
        {props.label}
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={props.id}
          rows={2}
          value={draft}
          disabled={blocked}
          placeholder={props.placeholder}
          aria-describedby={`${props.id}-help`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              send();
            }
          }}
          className="max-h-40 min-h-12 min-w-0 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-hover disabled:text-muted"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={blocked || draft.trim() === ''}
          status={props.sending ? 'loading' : 'idle'}
        >
          {props.sendLabel}
        </Button>
      </div>
      <p id={`${props.id}-help`} className="text-xs text-muted">
        {disabledReason ?? props.hint}
      </p>
      {props.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-2 text-sm">
          {props.error}
        </p>
      ) : null}
    </form>
  );
}
