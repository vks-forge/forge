/**
 * RecordPage: one memory record in full, with whose word it is and how it got here.
 *
 * Why: a list line shows a claim; trusting it means knowing who wrote it ("Your decision" or
 *   "Director's inference, approved by you on 12 Oct"), what it came from, what replaced it, what
 *   else in memory bears on it and every state it went through. This page is that answer, at an
 *   address that can be linked and shared (`/p/:slug/memory/:id`). A pending proposal can be
 *   answered here, with the records it may conflict with named above the buttons. Nothing on the
 *   page edits a record: it is append-only (d-0007), so there is no edit, delete or revert
 *   control, the only text box is the rejection reason, and a footnote says to supersede
 *   instead. Statement, body and source are shown as plain text, never HTML. A project still on
 *   files cannot show links, history or related records, and the page says that rather than
 *   showing them empty.
 *
 * Exports: RecordPage.
 * Depends on: react-router, lucide-react, api/use-memory, api/describe-error, components/*,
 *   domain/memory-record-copy, domain/memory-import-copy, routes/memory/*.
 */

import { ArrowLeft, Pin } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { MemoryRecordView } from '@forge/core';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useMemoryHistory, useMemoryImport, useMemoryRecord } from '#/api/use-memory.js';
import { StatusBadge } from '#/components/memory/status-badge.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { isFileBacked } from '#/domain/memory-import-copy.js';
import {
  KIND_LABEL,
  dayOf,
  importNote,
  provenanceLine,
} from '#/domain/memory-record-copy.js';
import { projectPath } from '#/domain/nav-entries.js';
import { ExportButton } from '#/routes/memory/export-button.js';
import {
  HistorySection,
  LinksSection,
  RelatedSection,
} from '#/routes/memory/record-sections.js';
import { useProposalAnswers } from '#/routes/memory/use-proposal-answers.js';
import { useOnline } from '#/state/use-online.js';

const AUTHOR = { user: 'Owner', director: 'Director (inferred)' } as const;

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted">{props.label}</dt>
      <dd className="min-w-0 break-words">{props.children}</dd>
    </div>
  );
}

function Facts(props: { record: MemoryRecordView }) {
  const { record } = props;

  return (
    <dl className="divide-y divide-line">
      <Row label="Written by">{AUTHOR[record.author]}</Row>
      <Row label="Origin">{record.origin}</Row>
      <Row label="Source">
        {record.source.type}: {record.source.ref}
      </Row>
      <Row label="Valid from">{dayOf(record.valid_from)}</Row>
      {record.valid_to ? <Row label="Valid until">{dayOf(record.valid_to)}</Row> : null}
      {record.confidence !== null ? (
        <Row label="Confidence">{Math.round(record.confidence * 100)}%</Row>
      ) : null}
      {record.approved_at ? (
        <Row label="Approved">
          {dayOf(record.approved_at)} by {record.approved_by ?? 'unknown'}
        </Row>
      ) : null}
      {record.rejected_at ? (
        <Row label="Rejected">
          {dayOf(record.rejected_at)} by {record.rejected_by ?? 'unknown'}
        </Row>
      ) : null}
      {record.rejected_reason ? <Row label="Reason">{record.rejected_reason}</Row> : null}
      {record.gist ? <Row label="Summary">{record.gist}</Row> : null}
      {record.aliases.length > 0 ? (
        <Row label="Also called">{record.aliases.join(', ')}</Row>
      ) : null}
      {record.tags.length > 0 ? (
        <Row label="Tags">
          <span className="font-data text-xs">{record.tags.join(' · ')}</span>
        </Row>
      ) : null}
    </dl>
  );
}

function Conflicts(props: {
  slug: string;
  items: NonNullable<MemoryRecordView['possible_conflicts']>;
}) {
  return (
    <div role="note" className="grid gap-1 rounded-lg bg-attn-soft px-3 py-2 text-sm">
      <p className="font-medium">May conflict with</p>
      <ul className="grid gap-1">
        {props.items.map((item) => (
          <li key={item.id}>
            <Link
              to={projectPath(props.slug, `memory/${encodeURIComponent(item.id)}`)}
              className="font-data text-xs underline"
            >
              {item.id}
            </Link>{' '}
            {item.line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecordBody(props: {
  slug: string;
  record: MemoryRecordView;
  online: boolean;
  onFiles: boolean;
  importedAt: string | undefined;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { record } = props;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-data text-xs text-muted">{record.id}</span>
          <span className="rounded-md bg-hover px-1.5 py-0.5 text-xs text-muted">
            {KIND_LABEL[record.kind]}
          </span>
          <StatusBadge status={record.status} />
          {record.pinned ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Pin aria-hidden="true" className="size-3" />
              Pinned
            </span>
          ) : null}
        </div>
        <h1
          className={`text-xl font-semibold leading-7 tracking-tight ${
            record.status === 'superseded' ? 'text-muted' : ''
          }`}
        >
          {record.statement}
        </h1>
        <p className="text-sm text-muted">{provenanceLine(record)}</p>
      </div>

      {record.status === 'pending' ? (
        <div className="grid gap-3">
          {record.possible_conflicts && record.possible_conflicts.length > 0 ? (
            <Conflicts slug={props.slug} items={record.possible_conflicts} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!props.online}
              onClick={() => props.onApprove(record.id)}
            >
              Approve
            </Button>
            <Button
              variant="quiet"
              disabled={!props.online}
              onClick={() => props.onReject(record.id)}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : null}

      {record.imported ? (
        <p role="note" className="rounded-lg bg-hover px-3 py-2 text-sm">
          {importNote(record.imported, props.importedAt)}
        </p>
      ) : null}

      <Facts record={record} />

      {record.body.trim() !== '' ? (
        <section aria-label="Notes" className="grid gap-1">
          <p className="whitespace-pre-wrap break-words text-sm text-muted">
            {record.body}
          </p>
          {record.body_truncated ? (
            <p className="text-xs text-muted">
              Only the first part of the notes is shown.
            </p>
          ) : null}
        </section>
      ) : null}

      <RelatedSection slug={props.slug} id={record.id} onFiles={props.onFiles} />
      <LinksSection slug={props.slug} record={record} onFiles={props.onFiles} />
      <HistorySection slug={props.slug} id={record.id} onFiles={props.onFiles} />

      <p className="border-t border-line pt-3 text-xs text-muted">
        Records are never edited or deleted. To change one, supersede it with a new
        decision.
      </p>
    </div>
  );
}

export function RecordPage() {
  const { slug = '', id = '' } = useParams();
  const online = useOnline();
  const query = useMemoryRecord(slug, id);
  const onFiles = isFileBacked(useMemoryImport(slug).data);
  const history = useMemoryHistory(slug, id);
  const answers = useProposalAnswers(slug, (answered) =>
    answered === id ? (query.data?.statement ?? null) : null,
  );

  useEffect(() => {
    document.title = `${id} · Memory · Forge`;
  }, [id]);

  const importedAt = history.data?.events.find((event) => event.event === 'imported')?.at;
  const missing = query.error instanceof ApiError && query.error.status === 404;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={projectPath(slug, 'memory')}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Memory
        </Link>
        <ExportButton slug={slug} online={online} />
      </div>

      {answers.banner}

      {query.isPending ? (
        <StatePanel kind="loading" label="Loading record" />
      ) : query.isError ? (
        missing ? (
          <StatePanel kind="empty" title={`No record ${id}`}>
            This project has no memory record with that id. It may belong to another
            project.
          </StatePanel>
        ) : (
          <StatePanel
            kind="error"
            title={describeError(query.error).title}
            detail={describeError(query.error).detail}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )
      ) : (
        <RecordBody
          slug={slug}
          record={query.data}
          online={online}
          onFiles={onFiles}
          importedAt={importedAt}
          onApprove={answers.askApprove}
          onReject={answers.askReject}
        />
      )}

      {answers.dialogs}
    </section>
  );
}
