/**
 * ConversationTab: the conversation with the card's Director, the card page's first tab.
 *
 * Why: a card is where the user and the Director talk a request through before and while
 *   Workers build it, so the page must make that exchange easy and never lose words. The
 *   message list scrolls above a composer docked at the bottom of the tab (components/chat/
 *   chat-pane), newest at the bottom, earlier messages behind "Show earlier messages" (fetched
 *   a window at a time). The user's message appends at once as "Sending…" and swaps for the
 *   server's copy; "The Director is thinking" shows while the card says so (or a reply is
 *   plainly awaited), "Director is reading the project…" on a new card until the Director's
 *   first message arrives, and the Director's failure in words. A refusal removes the unsent
 *   line and keeps the draft in the box. A closed card keeps its history readable but takes no
 *   message, and the box says why. Consecutive messages of one author share a header and time,
 *   and each new day gets a separator. The planning flow lives in the same log as one-line
 *   records: a question asked (open, answered or passed), finished steps, runs of three or more
 *   ticket log lines folded into one line that opens to them, a ready plan with a
 *   link to open it, what waits on the owner and system lines. The decisions themselves are made
 *   in the needs-you modal the alert under the page title opens; a ticket that
 *   waited on the owner is a record read from the card's live escalations, so it shows as settled
 *   once acted on anywhere.
 *
 * Exports: ConversationTab.
 * Depends on: react, lucide-react, api/use-card, api/use-escalations,
 *   api/describe-error, components/card/*, components/chat/chat-pane, domain/card-chat,
 *   domain/chat-folds, domain/chat-groups, domain/director-flow, domain/owner,
 *   state/message-draft, state/use-now, schemas/cards (types).
 */

import { CARD_MESSAGE_MAX_CHARS } from '@forge/core';
import type { CardType } from '@forge/core';
import { MessageSquare } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useCardEvents, useLoadOlderEvents, useSendCardMessage } from '#/api/use-card.js';
import { useCardEscalations } from '#/api/use-escalations.js';
import { DirectorStatus } from '#/components/card/director-status.js';
import { ChatFoldLine } from '#/components/card/chat-fold-line.js';
import { ChatLineView } from '#/components/card/chat-line-view.js';
import { labelOfType } from '#/components/card/card-type-icon.js';
import { MessageComposer } from '#/components/card/message-composer.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { ChatPane } from '#/components/chat/chat-pane.js';
import { lineAuthor, transcriptOf } from '#/domain/card-chat.js';
import { foldTicketRuns } from '#/domain/chat-folds.js';
import { groupChat } from '#/domain/chat-groups.js';
import {
  canAnswerGrill,
  grillOf,
  isThinking,
  lastStepOutcome,
  pendingStep,
} from '#/domain/director-flow.js';
import { OWNER } from '#/domain/owner.js';
import type { CardDetailReply } from '#/schemas/cards.js';
import { cardDraftKey } from '#/state/message-draft.js';
import { useNow } from '#/state/use-now.js';
import type { ScrollMemory } from '#/types/route-tabs.types.js';
import { EmptyState } from '#/components/ui/empty-state.js';

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

export function ConversationTab(props: {
  card: CardDetailReply;
  types: readonly CardType[] | undefined;
  /** Opens the close dialog with the Director's reason prefilled. */
  onSuggestClose: (reason: string) => void;
  /** Opens the plan (the "Open plan" link on a ready plan). */
  onReviewPlan: () => void;
  /** True while the server lists an open Director question (typing then answers it). */
  questionOpen: boolean;
  memory: ScrollMemory;
}) {
  const { card } = props;
  const history = useCardEvents(card.id);
  const escalations = useCardEscalations(card.id);
  const send = useSendCardMessage(card.id);
  const [unsent, setUnsent] = useState<{ id: string; text: string; at: string }[]>([]);
  const older = useLoadOlderEvents(card.id);
  const scroller = useRef<HTMLDivElement>(null);
  // A closed card with a question still pending sits in Needs you (d-0107) but is closed.
  const closed = card.closed_reason !== undefined;
  const events = history.data?.events;

  // Only a card that is still grilling has a question the server will accept an answer to.
  const canAnswer = canAnswerGrill(card);

  const lines = useMemo(
    () =>
      transcriptOf(
        events ?? [],
        unsent,
        (name) => labelOfType(props.types, name),
        canAnswer,
      ),
    [events, unsent, props.types, canAnswer],
  );

  const now = useNow();
  const metas = useMemo(
    () =>
      groupChat(
        lines.map((line) => ({ at: line.at, author: lineAuthor(line) })),
        now,
      ),
    [lines, now],
  );

  const items = useMemo(() => foldTicketRuns(lines, metas), [lines, metas]);

  const director = card.director;
  const rawStep = events === undefined ? null : pendingStep(events);
  // A Director that stopped to ask the owner is not thinking, even if an older step never wrote its end.
  const waitingOnOwner = !closed && card.needs_you_detail.length > 0;
  const stepRunning = rawStep !== null;
  const step = rawStep !== null && !waitingOnOwner ? rawStep : null;
  const lastOutcome = events === undefined ? null : lastStepOutcome(events);
  // While a question is open the server takes a typed message as its free-text answer.
  const questionOpen =
    props.questionOpen ||
    (canAnswer && events !== undefined && grillOf(events).question !== null);

  const thinking = isThinking({
    serverState: director.state,
    stepRunning,
    waitingOnOwner,
  });

  // A new card is `grilling` with no Director message yet: the Director is reading the project.
  const reading =
    !thinking &&
    !closed &&
    card.phase === 'grilling' &&
    events !== undefined &&
    !events.some((event) => event.kind === 'director_message');

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

  if (history.isPending) {
    return <StatePanel kind="loading" label="Loading the conversation" />;
  }

  if (history.isError && !events) {
    // A raise stays in the alert even when the history will not load.
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <StatePanel
          kind="error"
          title={describeError(history.error).title}
          detail={describeError(history.error).detail}
          onRetry={() => void history.refetch()}
          retrying={history.isFetching}
        />
      </div>
    );
  }

  const composer = (
    <>
      <MessageComposer
        id={`card-message-${card.id}`}
        label="Message the Director"
        draftKey={cardDraftKey(card.id)}
        sendLabel="Send message"
        maxChars={CARD_MESSAGE_MAX_CHARS}
        placeholder={
          questionOpen
            ? 'Type your answer to the open question, or pick an option above'
            : 'Ask, refine, or tell it what to do with this card'
        }
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
    </>
  );

  return (
    <section aria-label="Chat with the Director" className="flex min-h-0 flex-1 flex-col">
      <ChatPane
        label="Conversation"
        ref={scroller}
        count={lines.length}
        follow
        memory={props.memory}
        memoryKey={`chat:${card.id}`}
        composer={composer}
      >
        {history.data?.hasOlder ? (
          <button
            type="button"
            onClick={() => older.mutate()}
            disabled={older.isPending}
            className="min-h-9 justify-self-center self-center rounded-lg px-3 text-sm text-signal hover:bg-hover disabled:text-muted"
          >
            {older.isPending ? 'Loading earlier messages…' : 'Show earlier messages'}
          </button>
        ) : null}
        {older.isError ? (
          <p role="alert" className="text-center text-xs text-danger">
            {describeError(older.error).title}. Earlier messages did not load; try again.
          </p>
        ) : null}
        {lines.length === 0 ? (
          <EmptyState variant="compact" icon={MessageSquare} title="Nothing said yet">
            Tell the Director what you want from this card.
          </EmptyState>
        ) : (
          items.map((item) => {
            const meta = metas[item.index] ?? { header: true, day: null };

            return item.kind === 'fold' ? (
              <ChatFoldLine
                key={item.fold.key}
                fold={item.fold}
                slug={card.project}
                meta={meta}
                first={item.index === 0}
                onReviewPlan={props.onReviewPlan}
              />
            ) : (
              <ChatLineView
                key={item.line.key}
                line={item.line}
                slug={card.project}
                onReviewPlan={props.onReviewPlan}
                meta={meta}
                first={item.index === 0}
                escalations={escalations.data?.items}
                onSuggestClose={closed ? undefined : props.onSuggestClose}
              />
            );
          })
        )}
        <div className="mt-3">
          <DirectorStatus
            state={director.state}
            thinking={thinking}
            stepFailed={lastOutcome === 'failed'}
            step={step?.label ?? null}
            reading={reading}
            lastError={director.last_error}
          />
        </div>
      </ChatPane>
    </section>
  );
}
