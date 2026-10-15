/**
 * RecordDrawer: one memory record in full, with the chain of decisions it belongs to.
 *
 * Why: the list shows a statement; trusting it means knowing who wrote it, what it came from
 *   and what replaced it. The drawer shows author (owner or Director), origin, source,
 *   validity dates, the Director's confidence for a proposal, and the rejection reason. A
 *   decision that was superseded names its successor, and a decision that replaced another
 *   names its predecessor; each is a link that opens that record, so the owner can follow
 *   the chain without going back to the list. A pending proposal can be answered from here.
 *
 * Exports: RecordDrawer.
 * Depends on: @forge/core (type), api/use-memory, api/describe-error, components/*.
 */

import { ArrowRight, Pin } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MemoryRecordWithBody } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useMemoryRecord } from '#/api/use-memory.js';
import { StatusBadge } from '#/components/memory/status-badge.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { SideDrawer } from '#/components/ui/side-drawer.js';

const AUTHOR = { user: 'Owner', director: 'Director (inferred)' } as const;

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted">{props.label}</dt>
      <dd className="min-w-0 break-words">{props.children}</dd>
    </div>
  );
}

function ChainLink(props: {
  slug: string;
  id: string;
  label: string;
  onOpen: (id: string) => void;
}) {
  const linked = useMemoryRecord(props.slug, props.id);

  return (
    <button
      type="button"
      onClick={() => props.onOpen(props.id)}
      className="grid w-full gap-0.5 rounded-lg border border-line p-3 text-left transition-colors duration-150 hover:bg-hover"
    >
      <span className="flex items-center gap-1.5 text-xs text-muted">
        {props.label}
        <ArrowRight aria-hidden="true" className="size-3" />
        <span className="font-data">{props.id}</span>
      </span>
      <span className="line-clamp-2 text-sm">
        {linked.data ? linked.data.statement : 'Loading the linked record'}
      </span>
    </button>
  );
}

function Details(props: {
  slug: string;
  record: MemoryRecordWithBody;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  answersDisabled: boolean;
}) {
  const { record } = props;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={record.status} />
        {record.pinned ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Pin aria-hidden="true" className="size-3" />
            Pinned
          </span>
        ) : null}
      </div>
      <p
        className={`text-base leading-6 ${record.status === 'superseded' ? 'text-muted' : ''}`}
      >
        {record.statement}
      </p>

      {record.status === 'pending' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={props.answersDisabled}
            onClick={() => props.onApprove(record.id)}
          >
            Approve
          </Button>
          <Button
            variant="quiet"
            disabled={props.answersDisabled}
            onClick={() => props.onReject(record.id)}
          >
            Reject
          </Button>
        </div>
      ) : null}

      {record.superseded_by ? (
        <ChainLink
          slug={props.slug}
          id={record.superseded_by}
          label="Replaced by"
          onOpen={props.onOpen}
        />
      ) : null}
      {record.supersedes ? (
        <ChainLink
          slug={props.slug}
          id={record.supersedes}
          label="Replaces"
          onOpen={props.onOpen}
        />
      ) : null}

      <dl className="divide-y divide-line">
        <Row label="Written by">{AUTHOR[record.author]}</Row>
        <Row label="Origin">{record.origin}</Row>
        <Row label="Source">
          {record.source.type}: {record.source.ref}
        </Row>
        <Row label="Valid from">{record.valid_from}</Row>
        {record.valid_to ? <Row label="Valid until">{record.valid_to}</Row> : null}
        {record.confidence !== undefined ? (
          <Row label="Confidence">{Math.round(record.confidence * 100)}%</Row>
        ) : null}
        {record.approved_at ? (
          <Row label="Approved">
            {record.approved_at} by {record.approved_by ?? 'unknown'}
          </Row>
        ) : null}
        {record.rejected_at ? (
          <Row label="Rejected">
            {record.rejected_at} by {record.rejected_by ?? 'unknown'}
          </Row>
        ) : null}
        {record.rejected_reason ? (
          <Row label="Reason">{record.rejected_reason}</Row>
        ) : null}
        {record.tags.length > 0 ? (
          <Row label="Tags">
            <span className="font-data text-xs">{record.tags.join(' · ')}</span>
          </Row>
        ) : null}
      </dl>

      {record.body.trim() !== '' ? (
        <section aria-label="Notes" className="whitespace-pre-wrap text-sm text-muted">
          {record.body}
        </section>
      ) : null}
    </div>
  );
}

export function RecordDrawer(props: {
  slug: string;
  id: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  answersDisabled: boolean;
}) {
  const query = useMemoryRecord(props.slug, props.id);

  return (
    <SideDrawer
      open={props.id !== null}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
      title="Memory record"
      {...(props.id ? { eyebrow: props.id } : {})}
    >
      {query.isPending ? (
        <StatePanel kind="loading" label="Loading record" />
      ) : query.isError ? (
        <StatePanel
          kind="error"
          title={describeError(query.error).title}
          detail={describeError(query.error).detail}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <Details
          slug={props.slug}
          record={query.data}
          onOpen={props.onOpen}
          onApprove={props.onApprove}
          onReject={props.onReject}
          answersDisabled={props.answersDisabled}
        />
      )}
    </SideDrawer>
  );
}
