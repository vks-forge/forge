/**
 * PagesRead: every page the Director read for a card, cited or not.
 *
 * Why: a claim's own source list shows what it rests on, but the owner also wants to know
 *   what else was read and from where (a page that was read and then not used is part of how
 *   the Director reached its answer). Each row gives the reference, the domain and title, when
 *   it was read and whether the stored text was cut short, and opens the stored page. Titles
 *   and addresses are page-supplied and are shown as plain text.
 *
 * Exports: PagesRead.
 * Depends on: domain/format-time, domain/research-evidence, @forge/core (types).
 */

import type { ResearchSource } from '@forge/core';
import { formatWhen } from '#/domain/format-time.js';
import { domainOf } from '#/domain/research-evidence.js';

export function PagesRead(props: {
  sources: readonly ResearchSource[];
  onOpen: (ref: string) => void;
}) {
  const rows = props.sources.filter((s) => s.ref !== undefined);

  if (rows.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="pages-read-heading" className="grid gap-2">
      <h3 id="pages-read-heading" className="text-sm font-semibold">
        Pages read
      </h3>
      <ul className="grid">
        {rows.map((source) => {
          const ref = source.ref ?? '';
          const title = source.title === '' ? domainOf(source.final_url) : source.title;

          return (
            <li
              key={source.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 text-sm last:border-b-0"
            >
              <span className="font-data text-xs text-muted">{ref}</span>
              <span className="min-w-0 flex-1 break-words">
                <span className="font-medium">{domainOf(source.final_url)}</span>{' '}
                <span className="text-muted">{title}</span>
              </span>
              <span className="text-xs text-muted">
                {formatWhen(source.retrieved_at)}
                {source.truncated ? ' · cut short' : ''}
              </span>
              <button
                type="button"
                aria-label={`Open source ${ref}: ${title}`}
                onClick={() => props.onOpen(ref)}
                className="inline-flex min-h-9 items-center rounded-md px-1 text-xs font-medium text-signal hover:bg-hover"
              >
                Open source
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
