/**
 * SearchHitRow: one search result, with the matched words highlighted as plain text.
 *
 * Why: a result must say what it is (id, kind, status), what it claims, where the words
 *   matched and, when the match was an older decision that has since been replaced, which
 *   newer decision now binds the Director (the server returns the active successor once and
 *   names the old id). The snippet is text a Worker or a web page once wrote, so it is drawn
 *   as text nodes and `<mark>` elements from index ranges, never as HTML. The row is one link to
 *   the record page.
 *
 * Exports: SearchHitRow.
 * Depends on: react-router, @forge/core (type), components/memory/status-badge,
 *   domain/memory-snippet, domain/memory-record-copy, domain/nav-entries.
 */

import { Link } from 'react-router';
import type { MemoryHit } from '@forge/core';
import { StatusBadge } from '#/components/memory/status-badge.js';
import { KIND_LABEL } from '#/domain/memory-record-copy.js';
import { snippetParts } from '#/domain/memory-snippet.js';
import { projectPath } from '#/domain/nav-entries.js';

const WHY: Readonly<Record<MemoryHit['why'], string>> = {
  statement: 'matched the statement',
  gist: 'matched the summary',
  tag: 'matched a tag',
  text: 'matched the notes',
  link: 'linked to a match',
  pinned: 'pinned',
};

const recordPath = (slug: string, id: string): string =>
  projectPath(slug, `memory/${encodeURIComponent(id)}`);

export function SearchHitRow(props: { slug: string; hit: MemoryHit }) {
  const { hit, slug } = props;
  const parts = hit.snippet ? snippetParts(hit.snippet.text, hit.snippet.marks) : [];

  return (
    <li className="grid gap-1.5 border-b border-line px-1 py-3 hover:bg-hover/50">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-data text-xs text-muted">{hit.id}</span>
        <span className="rounded-md bg-hover px-1.5 py-0.5 text-xs text-muted">
          {KIND_LABEL[hit.kind]}
        </span>
        <StatusBadge status={hit.status} />
        <span className="text-xs text-faint">{WHY[hit.why]}</span>
      </span>
      <Link
        to={recordPath(slug, hit.id)}
        aria-label={`Open ${hit.id}: ${hit.line}`}
        className="rounded-md text-sm leading-5 underline-offset-2 hover:underline"
      >
        {hit.line}
      </Link>
      {parts.length > 0 ? (
        <p className="break-words text-xs leading-5 text-muted">
          {parts.map((part, index) =>
            part.marked ? (
              <mark
                key={index}
                className="rounded-sm bg-signal-soft px-0.5 font-medium text-fg"
              >
                {part.text}
              </mark>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {hit.tags.length > 0 ? (
          <span className="font-data">{hit.tags.join(' · ')}</span>
        ) : null}
        {hit.replaced_by ? (
          <span>
            Replaces{' '}
            <Link
              to={recordPath(slug, hit.replaced_by)}
              className="font-data text-signal underline-offset-2 hover:underline"
            >
              {hit.replaced_by}
            </Link>
            , which matched your search
          </span>
        ) : null}
      </div>
    </li>
  );
}
