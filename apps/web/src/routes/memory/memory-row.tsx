/**
 * MemoryRow: one record in the list, with the answer buttons for a pending proposal.
 *
 * Why: the list is where the owner decides, so a proposal must show what it claims and
 *   the two ways to answer without opening anything. The statement is the row's link (opens
 *   the record page); Approve and Reject are separate buttons beside it rather than nested
 *   inside it, so keyboard and screen-reader users get two clear targets. A pinned decision
 *   shows its pin, because pinned decisions are always put in front of the Director.
 *   A superseded decision is struck through and says it was replaced. Rows have one fixed
 *   height so the list can be windowed.
 *
 * Exports: MemoryRow, MEMORY_ROW_HEIGHT.
 * Depends on: react-router, lucide-react, @forge/core (type), components/memory/status-badge,
 *   components/ui/button, domain/nav-entries.
 */

import { Pin } from 'lucide-react';
import { Link } from 'react-router';
import type { MemoryListEntry } from '@forge/core';
import { StatusBadge } from '#/components/memory/status-badge.js';
import { Button } from '#/components/ui/button.js';
import { projectPath } from '#/domain/nav-entries.js';

export const MEMORY_ROW_HEIGHT = 112;

export function MemoryRow(props: {
  slug: string;
  entry: MemoryListEntry;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  /** Hold the answer buttons, for example while offline. */
  answersDisabled: boolean;
}) {
  const { entry } = props;
  const superseded = entry.status === 'superseded';

  return (
    <div className="flex h-full flex-col justify-center gap-1.5 border-b border-line px-1 py-2 hover:bg-hover/50">
      <Link
        to={projectPath(props.slug, `memory/${encodeURIComponent(entry.id)}`)}
        aria-label={`Open ${entry.id}: ${entry.statement}`}
        className="grid min-w-0 gap-1 rounded-md text-left"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-data text-xs text-muted">{entry.id}</span>
          <StatusBadge status={entry.status} />
          {entry.pinned ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Pin aria-hidden="true" className="size-3" />
              Pinned
            </span>
          ) : null}
        </span>
        <span
          className={`line-clamp-2 text-sm leading-5 ${superseded ? 'text-muted line-through' : ''}`}
        >
          {entry.statement}
        </span>
      </Link>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="min-w-0 truncate font-data text-xs text-muted">
          {entry.tags.length > 0 ? entry.tags.join(' · ') : 'no tags'}
        </p>
        {entry.status === 'pending' ? (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="quiet"
              className="min-h-8"
              disabled={props.answersDisabled}
              onClick={() => props.onReject(entry.id)}
              aria-label={`Reject ${entry.id}`}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              className="min-h-8"
              disabled={props.answersDisabled}
              onClick={() => props.onApprove(entry.id)}
              aria-label={`Approve ${entry.id}`}
            >
              Approve
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
