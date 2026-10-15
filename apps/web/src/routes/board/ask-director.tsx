/**
 * AskDirector: a one-box composer on the Board that files a request with the Director.
 *
 * Why: the fastest way to start work is to say what you want where you watch work happen.
 *   The text goes to `POST /intake` as a chat request and becomes an inbox ticket on the
 *   Director's next tick, so the box confirms with a link to the new ticket (d-0116) rather
 *   than pretending it appeared instantly. The same dedupe key is kept until the request
 *   succeeds, so a double click or a retry after a dropped connection never files two tickets.
 *   Ctrl or Cmd + Enter sends.
 *
 * Exports: AskDirector.
 * Depends on: react, api/use-tickets, api/describe-error, components/ui/button,
 *   components/ticket/ticket-link, schemas/projects (type).
 */

import { useState } from 'react';
import { Link } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useChatIntake } from '#/api/use-tickets.js';
import { Button } from '#/components/ui/button.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { cardPath } from '#/domain/card-paths.js';
import type { ProjectView } from '#/schemas/projects.js';

export function AskDirector(props: { project: ProjectView }) {
  const [text, setText] = useState('');
  // Reused for retries of the same message; replaced after it succeeds.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const intake = useChatIntake();
  const blocked = props.project.status === 'archived';

  const send = (): void => {
    const trimmed = text.trim();
    if (trimmed === '' || intake.isPending) {
      return;
    }

    intake.mutate(
      { projectId: props.project.id, text: trimmed, dedupeKey: key },
      {
        onSuccess: (reply) => {
          if (reply.status !== 'ignored') {
            setText('');
            setKey(crypto.randomUUID());
          }
        },
      },
    );
  };

  const reply = intake.data;
  const failure = intake.isError ? describeError(intake.error) : null;

  return (
    <form
      className="grid gap-2 rounded-2xl border border-line bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <label htmlFor="ask-director" className="text-sm font-medium">
        Ask the Director
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <textarea
          id="ask-director"
          rows={2}
          value={text}
          disabled={blocked}
          placeholder="Describe what you want done, in your own words"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              send();
            }
          }}
          className="min-h-16 min-w-0 flex-1 resize-y rounded-lg border border-line bg-bg p-2 text-sm"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={blocked || text.trim() === ''}
          status={intake.isPending ? 'loading' : 'idle'}
        >
          Send to Director
        </Button>
      </div>
      <p className="text-xs text-muted">
        {blocked
          ? 'This project is archived and takes no new work.'
          : 'Becomes a ticket on the Director’s next pass. Ctrl+Enter sends.'}
      </p>
      {failure ? (
        <p role="alert" className="text-sm text-danger">
          {failure.title}. {failure.detail} Your text is kept; press Send to retry.
        </p>
      ) : null}
      {reply && !intake.isPending && !intake.isError ? (
        <p role="status" className="text-sm">
          {reply.status === 'ticket_created' ? (
            <>
              Filed as <TicketLink id={reply.ticketId} slug={props.project.slug} />. It
              appears in Inbox shortly.
            </>
          ) : null}
          {reply.status === 'card_created' ? (
            <>
              Started a card.{' '}
              <Link
                to={cardPath(props.project.slug, reply.cardId)}
                className="font-medium text-signal underline-offset-2 hover:underline"
              >
                Open <span className="font-data">{reply.cardId}</span>
              </Link>{' '}
              to talk it through with the Director.
            </>
          ) : null}
          {reply.status === 'duplicate'
            ? 'Already received; nothing new was filed.'
            : null}
          {reply.status === 'ignored'
            ? `The Director ignored it: ${reply.reason}. Edit and send again.`
            : null}
          {reply.status === 'reply_queued' || reply.status === 'answered'
            ? 'Delivered to the Worker.'
            : null}
        </p>
      ) : null}
    </form>
  );
}
