/**
 * ChatLineView: draws one line of a card's chat.
 *
 * Why: the transcript mixes speech and events. The user's words sit to the right and the
 *   Director's to the left, each with a speaker label and a time so a screen reader and a
 *   skimming eye get the same turn-taking; what the Director did ("actions taken") sits under
 *   its message as compact lines; everything else (a ticket created, a state change, a type
 *   change, an event kind this UI does not know) is one quiet line that links to its ticket
 *   when it has one. Text is rendered as text, never HTML or markdown, because the Director's
 *   words are untrusted model output. An unsent line says so and is dimmed.
 *
 * Exports: ChatLineView.
 * Depends on: react, react-router, lucide-react, components/ticket/ticket-link,
 *   domain/relative-time, types/cards-ui.types.
 */

import { Check, Dot, X } from 'lucide-react';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { clockTime } from '#/domain/relative-time.js';
import { Button } from '#/components/ui/button.js';
import type { ChatAction, ChatLine } from '#/types/cards-ui.types.js';

/** "Done" or "Refused" in words with an icon, so the outcome is never only a colour. */
function ActionText(props: { action: ChatAction }) {
  const { action } = props;
  const Icon = action.result === 'refused' ? X : Check;

  return (
    <>
      {action.result ? (
        <>
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span
            className={
              action.result === 'refused' ? 'font-medium text-danger' : 'font-medium'
            }
          >
            {action.result === 'refused' ? 'Refused' : 'Done'}
          </span>
        </>
      ) : null}
      <span className="min-w-0 break-words">{action.text}</span>
    </>
  );
}

export function ChatLineView(props: {
  line: ChatLine;
  slug: string;
  /** Opens the close dialog with the reason; absent when the card is already closed. */
  onSuggestClose?: ((reason: string) => void) | undefined;
}) {
  const { line } = props;

  if (line.tone === 'note') {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        <Dot aria-hidden="true" className="size-4 shrink-0" />
        {line.ticketId ? <TicketLink id={line.ticketId} slug={props.slug} /> : null}
        {line.action ? (
          <ActionText action={line.action} />
        ) : (
          <span className="min-w-0 break-words">{line.text}</span>
        )}
        <time dateTime={line.at} className="font-data">
          {clockTime(line.at)}
        </time>
        {line.closeReason !== undefined && props.onSuggestClose ? (
          <Button onClick={() => props.onSuggestClose?.(line.closeReason ?? '')}>
            Close card
          </Button>
        ) : null}
      </p>
    );
  }

  const mine = line.tone === 'you';

  return (
    <div className={`grid gap-1 ${mine ? 'justify-items-end' : 'justify-items-start'}`}>
      <p className="flex items-center gap-2 text-xs text-muted">
        <span className="font-medium text-fg">{mine ? 'You' : 'Director'}</span>
        <time dateTime={line.at} className="font-data">
          {clockTime(line.at)}
        </time>
        {line.pending ? <span>Sending…</span> : null}
      </p>
      <p
        className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
          mine ? 'bg-signal-soft' : 'border border-line bg-surface'
        } ${line.pending ? 'opacity-70' : ''}`}
      >
        {line.text}
      </p>
      {line.actions.length > 0 ? (
        <ul
          aria-label="What the Director did"
          className="grid gap-0.5 text-xs text-muted"
        >
          {line.actions.map((action, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <ActionText action={action} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
