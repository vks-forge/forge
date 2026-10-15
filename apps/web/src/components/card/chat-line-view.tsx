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

import { Check, Dot } from 'lucide-react';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { clockTime } from '#/domain/relative-time.js';
import type { ChatLine } from '#/types/cards-ui.types.js';

export function ChatLineView(props: { line: ChatLine; slug: string }) {
  const { line } = props;

  if (line.tone === 'note') {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        <Dot aria-hidden="true" className="size-4 shrink-0" />
        {line.ticketId ? <TicketLink id={line.ticketId} slug={props.slug} /> : null}
        <span className="min-w-0 break-words">{line.text}</span>
        <time dateTime={line.at} className="font-data">
          {clockTime(line.at)}
        </time>
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
              <Check aria-hidden="true" className="size-3.5 shrink-0" />
              {action}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
