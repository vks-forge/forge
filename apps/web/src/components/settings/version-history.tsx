/**
 * VersionSummary and VersionHistory: which version is live, and every earlier one.
 *
 * Why: settings are versioned so that "who changed the global cap, when, and why" always has
 *   an answer. The summary says which version is current and who made it; the history lists
 *   every version newest first with its author, time, reason and the settings it changed
 *   (computed by comparing each version's stored overrides with the one before). Version 0 is
 *   Forge's built-in defaults, shown honestly as "nothing saved yet".
 *
 * Exports: VersionSummary, VersionHistory.
 * Depends on: @forge/core (types), domain/format-time, domain/settings-patch.
 */

import type { ConfigVersion } from '@forge/core';
import { formatWhen } from '#/domain/format-time.js';
import { describeChanges } from '#/domain/settings-patch.js';

const docOf = (v: ConfigVersion | undefined): Record<string, unknown> =>
  v ? (v.doc as Record<string, unknown>) : {};

export function VersionSummary(props: {
  version: number;
  history: readonly ConfigVersion[];
}) {
  const current = props.history.find((v) => v.version === props.version);

  return (
    <p className="text-sm text-muted">
      <span className="rounded-md border border-line px-1.5 py-0.5 font-data text-xs text-fg">
        Version {props.version}
      </span>{' '}
      {current
        ? `saved by ${current.author}, ${formatWhen(current.created_at)}: ${current.reason}`
        : 'Forge’s built-in defaults. Nothing has been saved yet.'}
    </p>
  );
}

export function VersionHistory(props: { history: readonly ConfigVersion[] }) {
  const newestFirst = [...props.history].reverse();
  const before = new Map(props.history.map((v, i) => [v.version, props.history[i - 1]]));

  if (newestFirst.length === 0) {
    return <p className="text-sm text-muted">No version has been saved yet.</p>;
  }

  return (
    <ol aria-label="Settings history" className="grid">
      {newestFirst.map((v) => {
        const changes = describeChanges(docOf(before.get(v.version)), docOf(v));

        return (
          <li
            key={v.version}
            className="grid gap-1 border-b border-line py-3 last:border-b-0"
          >
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-data text-xs font-medium">Version {v.version}</span>
              <span className="text-muted">
                {v.author}, {formatWhen(v.created_at)}
              </span>
            </p>
            <p className="text-sm">{v.reason}</p>
            {changes.length > 0 ? (
              <ul className="grid gap-0.5">
                {changes.map((line) => (
                  <li key={line} className="font-data text-xs break-all text-muted">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
