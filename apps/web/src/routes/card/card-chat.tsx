/**
 * CardChat: the conversation with the card's Director.
 *
 * Why: a card is where the user and the Director talk a request through before and while
 *   Workers build it, so the page must make that exchange easy and never lose words. It shows
 *   the history (newest at the bottom, earlier messages behind "Show earlier messages", never
 *   a wall of everything), appends the user's message at once as "Sending…" and swaps it for
 *   the server's copy, shows "The Director is thinking" while the card says so (or while a
 *   reply is plainly awaited), and shows the Director's failure in words. A refusal removes the
 *   unsent line and keeps the draft in the box. A closed card keeps its history readable but
 *   takes no message, and the box says why. New lines announce politely through a log region and
 *   the view follows the newest line only while the user is at the bottom.
 *
 * Exports: CardChat.
 * Depends on: react, motion/react, lucide-react, api/use-card, api/describe-error,
 *   components/card/*, components/thread/use-stick-to-bottom, domain/card-chat, domain/owner,
 *   state/message-draft, schemas/cards (types).
 */

import type { CardType } from '@forge/core';
import { ArrowDown } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useCardEvents, useSendCardMessage } from '#/api/use-card.js';
import { ChatLineView } from '#/components/card/chat-line-view.js';
import { labelOfType } from '#/components/card/card-type-icon.js';
import { MessageComposer } from '#/components/card/message-composer.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { useStickToBottom } from '#/components/thread/use-stick-to-bottom.js';
import { transcriptOf } from '#/domain/card-chat.js';
import { OWNER } from '#/domain/owner.js';
import type { CardDetailReply } from '#/schemas/cards.js';
import { cardDraftKey } from '#/state/message-draft.js';

const SHOWN_STEP = 50;

function refusalText(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.code === 'card_closed') {
      return 'This card was closed, so the message was not sent. Your text is still in the box.';
    }

    if (error.code === 'server_draining') {
      return 'Forge is shutting down and is not taking messages. Your text is still in the box; send it after Forge restarts.';
    }
  }

  const { title, detail } = describeError(error);

  return `Your message was not sent. ${title}. ${detail} It is still in the box; press Send to try again.`;
}

export function CardChat(props: {
  card: CardDetailReply;
  types: readonly CardType[] | undefined;
}) {
  const { card } = props;
  const history = useCardEvents(card.id);
  const send = useSendCardMessage(card.id);
  const [unsent, setUnsent] = useState<{ id: string; text: string; at: string }[]>([]);
  const [shown, setShown] = useState(SHOWN_STEP);
  const scroller = useRef<HTMLDivElement>(null);
  // A closed card with a question still pending sits in Needs you (d-0107) but is closed.
  const closed = card.closed_reason !== undefined;
  const events = history.data?.events;

  const lines = useMemo(
    () => transcriptOf(events ?? [], unsent, (name) => labelOfType(props.types, name)),
    [events, unsent, props.types],
  );

  const visible = lines.slice(Math.max(0, lines.length - shown));
  const hidden = lines.length - visible.length;
  const { stuck, unread, onScroll, jumpToLatest } = useStickToBottom(
    scroller,
    lines.length,
    0,
    true,
  );

  const director = card.director;
  const thinking = director?.state === 'thinking';

  const submit = (text: string, clear: () => void): void => {
    const pending = { id: crypto.randomUUID(), text, at: new Date().toISOString() };
    setUnsent((list) => [...list, pending]);
    send.mutate(
      { text, author: OWNER },
      {
        onSuccess: clear,
        onSettled: () => setUnsent((list) => list.filter((m) => m.id !== pending.id)),
      },
    );
  };

  return (
    <section aria-label="Chat with the Director" className="grid gap-4">
      {history.isPending ? (
        <StatePanel kind="loading" label="Loading the conversation" />
      ) : history.isError && !events ? (
        <StatePanel
          kind="error"
          title={describeError(history.error).title}
          detail={describeError(history.error).detail}
          onRetry={() => void history.refetch()}
          retrying={history.isFetching}
        />
      ) : (
        <div className="relative">
          <div
            ref={scroller}
            onScroll={onScroll}
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            tabIndex={0}
            className="grid h-[52dvh] content-start gap-3 overflow-y-auto rounded-xl border border-line bg-bg p-3"
          >
            {hidden > 0 ? (
              <button
                type="button"
                onClick={() => setShown((n) => n + SHOWN_STEP)}
                className="min-h-9 justify-self-center rounded-lg px-3 text-sm text-signal hover:bg-hover"
              >
                Show earlier messages ({hidden})
              </button>
            ) : null}
            {history.data?.truncated ? (
              <p className="text-center text-xs text-muted">
                This card has a very long history; the newest events may not be shown yet.
              </p>
            ) : null}
            {lines.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing has been said yet. Tell the Director what you want from this card.
              </p>
            ) : (
              visible.map((line) => (
                <ChatLineView key={line.key} line={line} slug={card.project} />
              ))
            )}
            {thinking ? (
              <p role="status" className="flex items-center gap-2 text-sm text-muted">
                <span
                  aria-hidden="true"
                  className="size-2 animate-pulse rounded-full bg-signal"
                />
                The Director is thinking…
              </p>
            ) : null}
            {director?.state === 'error' ? (
              <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
                The Director hit a problem
                {director.last_error ? `: ${director.last_error}` : '.'} Send another
                message to try again.
              </p>
            ) : null}
          </div>
          {!stuck ? (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-3 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-signal px-3 text-sm font-medium text-on-signal shadow-float hover:bg-signal-hi"
            >
              <ArrowDown aria-hidden="true" className="size-4" />
              Jump to latest
              {unread > 0 ? (
                <span className="font-data text-xs">({unread} new)</span>
              ) : null}
            </button>
          ) : null}
        </div>
      )}

      <MessageComposer
        id={`card-message-${card.id}`}
        label="Message the Director"
        draftKey={cardDraftKey(card.id)}
        sendLabel="Send message"
        placeholder="Ask, refine, or tell it what to do with this card"
        hint="The Director replies here. Ctrl+Enter sends."
        disabledReason={
          closed
            ? `This card is closed (${card.closed_reason}). The Director takes no more messages on it; its history stays readable.`
            : undefined
        }
        sending={send.isPending}
        error={send.isError ? refusalText(send.error) : null}
        onSend={submit}
      />
    </section>
  );
}
