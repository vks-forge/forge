/**
 * OverviewAttention: the newest things waiting on the owner, across every project.
 *
 * Why: "Waiting on you" is a number until you can act on it. This lists the latest items that
 *   need a decision (a Worker's question, a ticket to review or sign off, a failed gate, a
 *   tool to approve) each tagged with its project, and each row opens the item itself through
 *   the same link rule as Home and the Inbox, so there is one place that knows where an item
 *   leads. It shows the newest few only: the Inbox of each project holds the rest, and the
 *   section says so when there are more than shown.
 *
 * Exports: OverviewAttention.
 * Depends on: react-router, lucide-react, @forge/core (OverviewStats type),
 *   domain/{inbox-links,relative-time}, state/use-now.
 */

import type { OverviewStats } from '@forge/core';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { inboxLink, INBOX_KIND_LABEL } from '#/domain/inbox-links.js';
import { timeAgo } from '#/domain/relative-time.js';
import { useNow } from '#/state/use-now.js';

const EPOCH = '1970-01-01T00:00:00.000Z';

export function OverviewAttention(props: { stats: OverviewStats }) {
  const now = useNow();
  const { attention, kpis } = props.stats;
  const more = kpis.waiting_on_you - attention.length;

  return (
    <section aria-labelledby="overview-attention" className="grid grid-cols-1 gap-3">
      <h2 id="overview-attention" className="text-base font-semibold">
        Needs attention
      </h2>

      {attention.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          Nothing is waiting on you.
        </p>
      ) : (
        <>
          <ul
            aria-label="Needs attention"
            className="divide-y divide-line rounded-xl border border-line bg-surface"
          >
            {attention.map((item) => {
              const link = inboxLink(item.project, item);

              return (
                <li key={`${item.project}:${item.id}`}>
                  <Link
                    to={link.to}
                    className="group grid min-h-11 gap-1 px-4 py-3 transition-colors duration-150 hover:bg-hover sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4"
                  >
                    <span className="w-fit rounded-md bg-hover px-1.5 py-0.5 font-data text-xs text-muted group-hover:bg-surface">
                      {item.project}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.title}
                      </span>
                      <span className="block text-xs text-muted">
                        {INBOX_KIND_LABEL[item.kind]}
                        {item.updated_at === EPOCH
                          ? ''
                          : ` · ${timeAgo(item.updated_at, now)}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium text-signal">
                      {link.label}
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {more > 0 ? (
            <p className="text-xs text-muted">
              {more} more waiting. Open a project&apos;s Inbox to see them all.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
