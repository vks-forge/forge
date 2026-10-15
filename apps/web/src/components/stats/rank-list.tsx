/**
 * RankList: a short ranked list (top tickets, top runs, harnesses, models) with a value each.
 *
 * Why: the Cost screen ranks things by what they cost. A table with five columns cannot fit a
 *   375 px phone without sideways scrolling, so each entry is two lines instead: the name and
 *   its value on the first, the detail on the second. The same shape works at every width, the
 *   value is right-aligned in the data font so figures line up, and an entry can be a link.
 *
 * Exports: RankList.
 * Depends on: react, react-router.
 */

import { Link } from 'react-router';
import type { RankEntry } from '#/types/chart.types.js';

export function RankList(props: { label: string; entries: readonly RankEntry[] }) {
  return (
    <ol aria-label={props.label} className="grid">
      {props.entries.map((entry) => (
        <li
          key={entry.key}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-line py-2 last:border-b-0"
        >
          <span className="min-w-0 truncate text-sm">
            {entry.to ? (
              <Link
                to={entry.to}
                className="font-medium text-signal underline-offset-2 hover:underline"
              >
                {entry.title}
              </Link>
            ) : (
              entry.title
            )}
          </span>
          <span className="text-right font-data text-sm tabular-nums">{entry.value}</span>
          <span className="col-span-2 min-w-0 truncate text-xs text-muted">
            {entry.detail}
          </span>
        </li>
      ))}
    </ol>
  );
}
