/**
 * LaneDiffList: the lane's stages in the order they would run after a change, each marked added, removed, moved or swapped.
 *
 * Why: accepting a proposal rewrites a lane, so the owner reads the result as the list itself
 *   with the changes marked, not as a description. Every mark is a word beside an icon (never
 *   colour alone); a removed stage stays in its old place, struck through, so it cannot vanish
 *   unnoticed; a stage that is unchanged is plain so the changes stand out.
 *
 * Exports: LaneDiffList.
 * Depends on: lucide-react, domain/lane-diff, @forge/core (types).
 */

import { ArrowUpDown, Minus, Plus, Repeat2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PipelineDefinition } from '@forge/core';
import { laneDiff } from '#/domain/lane-diff.js';
import type { LaneDiffRow } from '#/types/lane-diff.types.js';

const MARK: Readonly<
  Record<Exclude<LaneDiffRow['change'], 'same'>, { word: string; Icon: LucideIcon }>
> = {
  added: { word: 'Added', Icon: Plus },
  removed: { word: 'Removed', Icon: Minus },
  moved: { word: 'Moved', Icon: ArrowUpDown },
  swapped: { word: 'Agent changed', Icon: Repeat2 },
};

export function LaneDiffList(props: {
  current: PipelineDefinition;
  proposed: PipelineDefinition;
  label: string;
}) {
  const rows = laneDiff(props.current, props.proposed);

  return (
    <ol aria-label={props.label} className="grid gap-1 text-sm">
      {rows.map((row) => {
        const mark = row.change === 'same' ? null : MARK[row.change];

        return (
          <li
            key={row.id}
            className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-2.5 py-1.5 ${
              mark === null ? 'border-line' : 'border-signal bg-surface font-medium'
            } ${row.change === 'removed' ? 'text-muted' : ''}`}
          >
            <span
              className={`min-w-0 break-words ${row.change === 'removed' ? 'line-through' : ''}`}
            >
              {row.label}
            </span>
            {row.agent === undefined ? null : (
              <span className="font-data text-xs text-muted">{row.agent}</span>
            )}
            {mark === null ? null : (
              <span className="ml-auto inline-flex items-center gap-1 text-xs">
                <mark.Icon aria-hidden="true" className="size-3.5" />
                {mark.word}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
