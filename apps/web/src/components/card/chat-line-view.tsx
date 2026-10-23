/**
 * ChatLineView: draws one line of a card's chat.
 *
 * Why: the transcript mixes speech and events. The user's words sit to the right and the
 *   Director's to the left in narrow, quiet bubbles; the speaker and time show once per group of
 *   consecutive messages (components/chat/chat-row) so a screen reader and a skimming eye get
 *   the same turn-taking without the noise of a label on every line; what the Director did
 *   ("actions taken") sits under its message as compact lines; everything else (a ticket
 *   created, a state change, a type change, an event kind this UI does not know) is one quiet
 *   line that links to its ticket when it has one. The Director's words are drawn through the
 *   safe markdown subset (never HTML, links only http/https) because they are untrusted model
 *   output; the owner's own words stay plain text. An unsent line says so and is dimmed. The planning flow's
 *   lines are blocks: a grill question with its answer buttons, a finished Director step that
 *   expands to the files it read, a finished research run, and a ready plan with a link to open
 *   it; an answer given by the Director's recommendation says so, so the owner can tell whose
 *   choice it was. Nothing in the transcript is a decision button: questions, plans and waiting
 *   tickets are one-line records and the decision is made once, in the needs-you dock (d-0172).
 *
 * Exports: ChatLineView.
 * Depends on: react, react-router, lucide-react, components/chat/*, components/thread/markdown-text,
 *   components/ticket/ticket-link,
 *   components/card/question-record, step-line, research-line, plan-ready-record, components/escalation/escalation-line,
 *   domain/relative-time, schemas/escalation (type), types/cards-ui.types.
 */

import { Check, Dot, X } from 'lucide-react';
import { PlanReadyRecord } from '#/components/card/plan-ready-record.js';
import { ChatBubble } from '#/components/chat/chat-bubble.js';
import { ChatRow } from '#/components/chat/chat-row.js';
import { MarkdownText } from '#/components/thread/markdown-text.js';
import { EscalationLine } from '#/components/escalation/escalation-line.js';
import { QuestionRecord } from '#/components/card/question-record.js';
import { ResearchLine } from '#/components/card/research-line.js';
import { StepLine } from '#/components/card/step-line.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { clockTime } from '#/domain/relative-time.js';
import type { EscalationView } from '#/schemas/escalation.js';
import { Button } from '#/components/ui/button.js';
import type { ChatRowMeta } from '#/types/chat.types.js';
import type { ChatAction, ChatLine } from '#/types/cards-ui.types.js';

/** "Done" or "Refused" in words with an icon, so the outcome is never only a colour. */
function ActionText(props: { action: ChatAction }) {
  const { action } = props;
  const Icon = action.result === 'refused' ? X : Check;

  return (
    <>
      {action.result ? (
        <>
          <Icon aria-hidden="true" className="mr-1 inline size-3.5 align-text-bottom" />
          <span
            className={
              action.result === 'refused' ? 'font-medium text-danger' : 'font-medium'
            }
          >
            {action.result === 'refused' ? 'Refused' : 'Done'}
          </span>{' '}
        </>
      ) : null}
      {action.text}
    </>
  );
}

export function ChatLineView(props: {
  line: ChatLine;
  slug: string;
  /** Opens the plan (the rail tab, the Plan tab or the sheet, whichever the screen has). */
  onReviewPlan: () => void;
  /** How grouping places this line: its author header and day separator. */
  meta: ChatRowMeta;
  first: boolean;
  /** The card's live escalations, for the block of a raised one; absent until they load. */
  escalations?: readonly EscalationView[] | undefined;
  /** Opens the close dialog with the reason; absent when the card is already closed. */
  onSuggestClose?: ((reason: string) => void) | undefined;
}) {
  const { line, meta, first } = props;
  const row = { meta, first, at: line.at, align: 'start' } as const;

  if (line.block?.kind === 'escalation') {
    const { interactionId } = line.block;

    return (
      <ChatRow {...row}>
        <EscalationLine
          title={line.block.title}
          ticketId={line.block.ticketId}
          slug={props.slug}
          view={props.escalations?.find((item) => item.id === interactionId)}
          loading={props.escalations === undefined}
        />
      </ChatRow>
    );
  }

  if (line.block?.kind === 'research') {
    return (
      <ChatRow {...row}>
        <ResearchLine research={line.block.research} slug={props.slug} at={line.at} />
      </ChatRow>
    );
  }

  if (line.block?.kind === 'step') {
    return (
      <ChatRow {...row}>
        <StepLine
          label={line.block.label}
          summary={line.block.summary}
          files={line.block.files}
          at={line.at}
        />
      </ChatRow>
    );
  }

  if (line.tone === 'note') {
    return (
      <ChatRow {...row}>
        <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1.5 text-xs leading-4 text-muted">
          <Dot aria-hidden="true" className="size-4" />
          <p className="min-w-0 break-words">
            {line.ticketId ? (
              <>
                <TicketLink id={line.ticketId} slug={props.slug} />{' '}
              </>
            ) : null}
            {line.action ? <ActionText action={line.action} /> : line.text}{' '}
            <time dateTime={line.at} className="font-data">
              {clockTime(line.at)}
            </time>
            {line.closeReason !== undefined && props.onSuggestClose ? (
              <>
                {' '}
                <Button onClick={() => props.onSuggestClose?.(line.closeReason ?? '')}>
                  Close card
                </Button>
              </>
            ) : null}
          </p>
        </div>
      </ChatRow>
    );
  }

  const mine = line.tone === 'you';

  return (
    <ChatRow
      {...row}
      align={mine ? 'end' : 'start'}
      author={mine ? 'You' : 'Director'}
      badges={
        <>
          {line.pending ? <span>Sending…</span> : null}
          {line.byRecommendation ? (
            <span className="rounded-md bg-hover px-1.5 py-0.5">Recommendation used</span>
          ) : null}
        </>
      }
    >
      {line.block?.kind === 'question' ? (
        <QuestionRecord question={line.block.question} state={line.block.state} />
      ) : line.block?.kind === 'plan_ready' ? (
        <PlanReadyRecord
          text={line.text}
          ticketCount={line.block.ticketCount}
          autoApprove={line.block.autoApprove}
          onOpen={props.onReviewPlan}
        />
      ) : (
        <ChatBubble mine={mine} pending={line.pending}>
          {mine ? (
            <p className="whitespace-pre-wrap">{line.text}</p>
          ) : (
            <MarkdownText text={line.text} />
          )}
        </ChatBubble>
      )}
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
    </ChatRow>
  );
}
