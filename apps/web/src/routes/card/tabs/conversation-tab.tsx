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
 *   and each new day gets a separator. The planning flow lives in the same log: grill
 *   questions answered with one click (only the newest open one, only while grilling),
 *   finished steps, ready plans and system lines. A ticket that waits on the owner is drawn
 *   from the card's live escalations, so it shows as settled once acted on anywhere.
 *
 * Exports: ConversationTab.
 * Depends on: react, lucide-react, api/use-card, api/use-escalations, api/use-plan,
 *   api/describe-error, components/card/*, components/chat/chat-pane, domain/card-chat,
 *   domain/chat-groups, domain/director-flow, domain/flow-errors, domain/owner,
 *   state/message-draft, state/use-now, schemas/cards (types).
 */

import type { CardType } from '@forge/core';
import { MessageSquare } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useCardEvents, useLoadOlderEvents, useSendCardMessage } from '#/api/use-card.js';
import { useCardEscalations } from '#/api/use-escalations.js';
import { useAnswerGrill, useGrillShortcut } from '#/api/use-plan.js';
import { DirectorStatus } from '#/components/card/director-status.js';
import { ChatLineView } from '#/components/card/chat-line-view.js';
import { labelOfType } from '#/components/card/card-type-icon.js';
import { MessageComposer } from '#/components/card/message-composer.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { ChatPane } from '#/components/chat/chat-pane.js';
import { lineAuthor, transcriptOf } from '#/domain/card-chat.js';
import { groupChat } from '#/domain/chat-groups.js';
import { grillOf, pendingStep } from '#/domain/director-flow.js';
import { describeFlowError } from '#/domain/flow-errors.js';
import { OWNER } from '#/domain/owner.js';
import type { CardDetailReply } from '#/schemas/cards.js';
import { cardDraftKey } from '#/state/message-draft.js';
import { useNow } from '#/state/use-now.js';
import type { FlowHandlers } from '#/types/cards-ui.types.js';
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
  /** Opens the Plan tab (the "Review plan" button on a ready plan). */
  onReviewPlan: () => void;
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
  // The server takes an answer while the card is grilling or verifying (`isShaping`).
  const canAnswer =
    !closed &&
    (card.phase === undefined || card.phase === 'grilling' || card.phase === 'verifying');

  const answer = useAnswerGrill(card.id);
  const shortcut = useGrillShortcut(card.id);
  const flowError = answer.error ?? shortcut.error;

  const flow: FlowHandlers = {
    busy: answer.isPending || shortcut.isPending,
    error: flowError === null ? null : describeFlowError(flowError),
    onReviewPlan: props.onReviewPlan,
    onShortcut: (kind) => {
      answer.reset();
      shortcut.mutate(kind);
    },
    onAnswer: (questionId, choice) => {
      shortcut.reset();
      answer.mutate(
        'optionId' in choice
          ? { question_id: questionId, option_id: choice.optionId }
          : { question_id: questionId, text: choice.text },
      );
    },
  };

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

  const director = card.director;
  const step = events === undefined ? null : pendingStep(events);
  // While a question is open the server takes a typed message as its free-text answer.
  const questionOpen =
    canAnswer && events !== undefined && grillOf(events).question !== null;

  const thinking = director.state === 'thinking' || step !== null;
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
    return (
      <StatePanel
        kind="error"
        title={describeError(history.error).title}
        detail={describeError(history.error).detail}
        onRetry={() => void history.refetch()}
        retrying={history.isFetching}
      />
    );
  }

  const composer = (
    <MessageComposer
      id={`card-message-${card.id}`}
      label="Message the Director"
      draftKey={cardDraftKey(card.id)}
      sendLabel="Send message"
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
          lines.map((line, index) => (
            <ChatLineView
              key={line.key}
              line={line}
              slug={card.project}
              flow={flow}
              meta={metas[index] ?? { header: true, day: null }}
              first={index === 0}
              escalations={escalations.data?.items}
              onSuggestClose={closed ? undefined : props.onSuggestClose}
            />
          ))
        )}
        <div className="mt-3">
          <DirectorStatus
            state={director.state}
            step={step?.label ?? null}
            reading={reading}
            lastError={director.last_error}
          />
        </div>
      </ChatPane>
    </section>
  );
}
