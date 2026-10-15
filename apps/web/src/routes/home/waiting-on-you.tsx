/**
 * WaitingOnYou: the few inbox items that need a decision, on Home.
 *
 * Why: Home must say "here is what is waiting on you" without sending the owner to the Inbox
 *   first. It shows the newest five items that need action, each linking to its source, and a
 *   link to the whole Inbox with the true count, so a long queue is visible as long and not
 *   cut off silently. An empty queue is a statement ("Nothing waits on you"), not blank space.
 *   It has its own loading and error states so a failing inbox never blanks the stats beside it.
 *
 * Exports: WaitingOnYou, WAITING_LIMIT.
 * Depends on: react-router, api/use-inbox, components/inbox/kind-chip, domain/inbox-links.
 */

import { Link } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useInboxCounts, useInboxPreview } from '#/api/use-inbox.js';
import { KindChip } from '#/components/inbox/kind-chip.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { inboxLink } from '#/domain/inbox-links.js';
import { projectPath } from '#/domain/nav-entries.js';

export const WAITING_LIMIT = 5;

export function WaitingOnYou(props: { slug: string }) {
  const preview = useInboxPreview(props.slug, WAITING_LIMIT);
  const counts = useInboxCounts(props.slug);
  const waiting = counts.data?.needs_action;

  return (
    <section aria-labelledby="home-waiting" className="grid content-start gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-waiting" className="text-base font-semibold">
          Waiting on you
        </h2>
        <Link
          to={projectPath(props.slug, 'inbox')}
          className="text-sm font-medium text-signal underline-offset-2 hover:underline"
        >
          Open Inbox{waiting === undefined ? '' : ` (${waiting})`}
        </Link>
      </div>

      {preview.isPending ? (
        <StatePanel kind="loading" label="Loading what waits on you" />
      ) : preview.isError ? (
        <StatePanel
          kind="error"
          title={describeError(preview.error).title}
          detail={describeError(preview.error).detail}
          onRetry={() => void preview.refetch()}
          retrying={preview.isFetching}
        />
      ) : preview.data.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          Nothing waits on you. Questions and reviews appear here.
        </p>
      ) : (
        <ul
          aria-label="Waiting on you"
          className="grid rounded-xl border border-line bg-surface px-3"
        >
          {preview.data.items.map((item) => {
            const link = inboxLink(props.slug, item);

            return (
              <li
                key={item.id}
                className="flex min-w-0 items-center gap-2 border-b border-line py-2.5 last:border-b-0"
              >
                <KindChip item={item} />
                <Link
                  to={link.to}
                  aria-label={`${link.label}: ${item.title}`}
                  className="min-w-0 truncate text-sm hover:underline"
                >
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
