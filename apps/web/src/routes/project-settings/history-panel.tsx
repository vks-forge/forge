/**
 * HistoryPanel: every saved version of this project's settings, who saved it and why.
 *
 * Why: settings drive what Workers do, so "who changed this, and when did it start
 *   failing?" must be answerable from the screen. Versions are immutable and numbered
 *   (d-0085); this lists them newest first with author, reason and time (exact time on hover)
 *   and opens a plain-words diff against the version before. History is read-only: going
 *   back means editing the current settings and saving a new version, which keeps the trail
 *   honest.
 *
 * Exports: HistoryPanel.
 * Depends on: react, lucide-react, domain/{doc-diff,format-time}, routes/project-settings/change-list.
 */

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { ConfigVersion } from '@forge/core';
import { diffDocs } from '#/domain/doc-diff.js';
import { formatWhen } from '#/domain/format-time.js';
import { ChangeList } from '#/routes/project-settings/change-list.js';

function Row(props: {
  version: ConfigVersion;
  previous: ConfigVersion | undefined;
  current: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { version } = props;
  const id = `history-${version.version}`;

  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex w-full items-start justify-between gap-3 rounded-lg text-left"
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-data font-medium">v{version.version}</span>
            {props.current ? (
              <span className="rounded-md bg-signal-soft px-1.5 text-xs font-medium text-signal">
                Current
              </span>
            ) : null}
            <span className="text-muted">
              {version.author} ·{' '}
              <time dateTime={new Date(version.created_at).toISOString()}>
                {formatWhen(version.created_at)}
              </time>
            </span>
          </span>
          <span className="break-words text-sm text-muted">{version.reason}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`mt-1 size-4 shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div id={id} className="mt-3 rounded-lg bg-hover p-3">
          <p className="mb-2 text-xs text-muted">
            {props.previous
              ? `Compared with v${props.previous.version}`
              : 'First version'}
          </p>
          <ChangeList
            changes={diffDocs(
              (props.previous?.doc ?? {}) as Record<string, unknown>,
              version.doc as Record<string, unknown>,
            )}
          />
        </div>
      ) : null}
    </li>
  );
}

export function HistoryPanel(props: { versions: readonly ConfigVersion[] }) {
  const newestFirst = [...props.versions].reverse();

  return (
    <section aria-labelledby="history-heading" className="grid gap-3">
      <h2 id="history-heading" className="text-base font-semibold">
        History
      </h2>
      {newestFirst.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted sm:p-5">
          Nothing saved yet. This project uses Forge and company defaults. Your first save
          creates version 1.
        </p>
      ) : (
        <ol
          aria-label="Saved versions"
          className="rounded-xl border border-line bg-surface px-4 sm:px-5"
        >
          {newestFirst.map((version, index) => (
            <Row
              key={version.version}
              version={version}
              previous={newestFirst[index + 1]}
              current={index === 0}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
