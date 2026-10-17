/**
 * ChatRow: one transcript item with the day separator and author header it may need.
 *
 * Why: grouping decides which items open a group or a day (domain/chat-groups); this wrapper
 *   draws that decision the same way for the card chat and the Worker thread, so both read
 *   alike: a quiet centred day label, then (for speech that starts a group) the author and
 *   the time once, then the content. Items inside a group sit close together; a new group
 *   gets air above it, so turn-taking is visible without a coloured fill.
 *
 * Exports: ChatRow, DaySeparator.
 * Depends on: react, domain/relative-time, types/chat.types.
 */

import type { ReactNode } from 'react';
import { shortTime } from '#/domain/relative-time.js';
import type { ChatRowMeta } from '#/types/chat.types.js';

export function DaySeparator(props: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3 text-xs text-muted" role="separator">
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      <span>{props.label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}

export function ChatRow(props: {
  meta: ChatRowMeta;
  /** The first row of the list has nothing above it to space from. */
  first: boolean;
  /** Who is speaking, shown when this row opens a group. */
  author?: string;
  at: string;
  /** Owner lines align right, everything else left. */
  align: 'start' | 'end';
  /** Small marks after the time ("Sending…", "Recommendation used"). */
  badges?: ReactNode;
  children: ReactNode;
}) {
  const { meta } = props;
  const end = props.align === 'end';

  return (
    <div className="min-w-0">
      {meta.day === null ? null : <DaySeparator label={meta.day} />}
      <div
        className={`grid min-w-0 gap-1 ${end ? 'justify-items-end' : 'justify-items-start'} ${
          meta.header && !props.first && meta.day === null ? 'mt-4' : 'mt-1'
        }`}
      >
        {meta.header && props.author !== undefined ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <span className="font-medium text-fg">{props.author}</span>
            <time dateTime={props.at} className="font-data">
              {shortTime(props.at)}
            </time>
            {props.badges}
          </p>
        ) : null}
        {props.children}
      </div>
    </div>
  );
}
