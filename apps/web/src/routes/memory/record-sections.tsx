/**
 * The three context sections of a record page: Related, Links and History.
 *
 * Why: a statement alone cannot be trusted or acted on. The owner needs to see what else in
 *   memory bears on it (Related, each with the reason it was picked, so "similar text" and
 *   "amended by d-0007" are told apart), what it points at (Links: the decision it replaces, a
 *   card, a ticket) and how it got here (History: every state move with who and when, plus each
 *   change to its search aids). Each section loads on its own and has its own loading, empty and
 *   error state, so one slow call never blanks the page. A project still on files has none of
 *   this yet; the sections say that instead of showing an empty list that looks like "no
 *   relations". All text is plain text.
 *
 * Exports: RelatedSection, LinksSection, HistorySection, Section.
 * Depends on: react, react-router, api/use-memory, api/describe-error, components/*,
 *   domain/memory-record-copy, domain/format-time.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { MemoryRecordView } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useMemoryHistory, useMemoryRelated } from '#/api/use-memory.js';
import { StatusBadge } from '#/components/memory/status-badge.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { formatWhen } from '#/domain/format-time.js';
import {
  KIND_LABEL,
  aidVersionLine,
  eventLine,
  linkGroups,
  linkHref,
} from '#/domain/memory-record-copy.js';
import { projectPath } from '#/domain/nav-entries.js';

const UNAVAILABLE =
  'Not available until this project’s memory is stored in Forge’s database.';

export function Section(props: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={props.id} className="grid gap-2">
      <h2 id={props.id} className="text-sm font-semibold">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function Quiet(props: { children: ReactNode }) {
  return <p className="text-sm text-muted">{props.children}</p>;
}

export function RelatedSection(props: { slug: string; id: string; onFiles: boolean }) {
  const query = useMemoryRelated(props.slug, props.id);

  return (
    <Section title="Related" id="record-related">
      {props.onFiles ? (
        <Quiet>{UNAVAILABLE}</Quiet>
      ) : query.isPending ? (
        <StatePanel kind="loading" label="Loading related records" />
      ) : query.isError ? (
        <StatePanel
          kind="error"
          title={describeError(query.error).title}
          detail={describeError(query.error).detail}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.length === 0 ? (
        <Quiet>Nothing related yet.</Quiet>
      ) : (
        <ul className="grid gap-2">
          {query.data.map((item) => (
            <li key={item.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={projectPath(props.slug, `memory/${encodeURIComponent(item.id)}`)}
                  aria-label={`Open ${item.id}: ${item.line}`}
                  className="font-data text-xs text-signal underline-offset-2 hover:underline"
                >
                  {item.id}
                </Link>
                <span className="rounded-md bg-hover px-1.5 py-0.5 text-xs text-muted">
                  {KIND_LABEL[item.kind]}
                </span>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-1 text-sm">{item.line}</p>
              <ul aria-label="Why it is related" className="mt-2 flex flex-wrap gap-1.5">
                {item.reasons.map((reason) => (
                  <li
                    key={reason}
                    className="rounded-md border border-line px-1.5 py-0.5 text-xs text-muted"
                  >
                    {reason}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function LinksSection(props: {
  slug: string;
  record: Pick<MemoryRecordView, 'links' | 'supersedes' | 'superseded_by'>;
  onFiles: boolean;
}) {
  const groups = linkGroups(props.record);

  return (
    <Section title="Links" id="record-links">
      {props.onFiles ? (
        <Quiet>{UNAVAILABLE}</Quiet>
      ) : groups.length === 0 ? (
        <Quiet>This record links to nothing.</Quiet>
      ) : (
        <dl className="grid gap-2 text-sm">
          {groups.map((group) => (
            <div
              key={group.label}
              className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-3"
            >
              <dt className="text-muted">{group.label}</dt>
              <dd className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                {group.items.map((item) => (
                  <Link
                    key={`${item.kind}:${item.target}`}
                    to={linkHref(props.slug, item)}
                    className="break-all font-data text-xs text-signal underline-offset-2 hover:underline"
                  >
                    {item.target}
                  </Link>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );
}

export function HistorySection(props: { slug: string; id: string; onFiles: boolean }) {
  const query = useMemoryHistory(props.slug, props.id);

  return (
    <Section title="History" id="record-history">
      {props.onFiles ? (
        <Quiet>{UNAVAILABLE}</Quiet>
      ) : query.isPending ? (
        <StatePanel kind="loading" label="Loading history" />
      ) : query.isError ? (
        <StatePanel
          kind="error"
          title={describeError(query.error).title}
          detail={describeError(query.error).detail}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.events.length === 0 ? (
        <Quiet>No history recorded.</Quiet>
      ) : (
        <>
          <ol aria-label="State history" className="grid gap-2">
            {query.data.events.map((event) => (
              <li key={event.seq} className="grid gap-0.5 border-l-2 border-line pl-3">
                <p className="text-sm">{eventLine(event)}</p>
                <p className="text-xs text-muted">
                  <time dateTime={event.at}>{formatWhen(event.at)}</time> · {event.actor}
                </p>
                {event.reason ? <p className="text-xs">Reason: {event.reason}</p> : null}
              </li>
            ))}
          </ol>
          {query.data.versions.length > 0 ? (
            <div className="grid gap-1">
              <h3 className="mt-2 text-xs font-medium text-muted">Search aids</h3>
              <ol aria-label="Search aid versions" className="grid gap-1">
                {query.data.versions.map((version) => (
                  <li key={version.version} className="text-xs text-muted">
                    Version {version.version}: {aidVersionLine(version)} ·{' '}
                    <time dateTime={version.at}>{formatWhen(version.at)}</time> ·{' '}
                    {version.actor}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}
