/**
 * ChatFoldLine: a run of ticket log lines drawn as one quiet line that opens to the originals.
 *
 * Why: ten ticket updates between two Director messages bury the conversation. The fold says in
 *   words what happened and where tickets stand ("3 tickets moved · 2 created: FR-15 Done"),
 *   and one button shows or hides the full list, so nothing is lost and the owner decides how
 *   much to read. It is not speech, so it carries no author header; it does carry the day
 *   separator when its first line opens a new day.
 *
 * Exports: ChatFoldLine.
 * Depends on: react, lucide-react, components/card/chat-line-view, components/chat/chat-row,
 *   types/cards-ui.types, types/chat.types.
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { ChatLineView } from '#/components/card/chat-line-view.js';
import { ChatRow } from '#/components/chat/chat-row.js';
import type { ChatFold } from '#/types/cards-ui.types.js';
import type { ChatRowMeta } from '#/types/chat.types.js';

const NO_HEADER: ChatRowMeta = { header: false, day: null };

export function ChatFoldLine(props: {
  fold: ChatFold;
  slug: string;
  /** How grouping places the fold's first line: its day separator. */
  meta: ChatRowMeta;
  first: boolean;
  onReviewPlan: () => void;
}) {
  const { fold } = props;
  const [open, setOpen] = useState(false);
  const listId = useId();
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <ChatRow
      meta={{ header: false, day: props.meta.day }}
      first={props.first}
      at={fold.lines[0]?.at ?? ''}
      align="start"
    >
      <div className="grid min-w-0 max-w-full gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-9 min-w-0 items-start gap-1.5 rounded-md py-1 text-left text-xs text-muted hover:text-fg"
        >
          <Icon aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span className="min-w-0 break-words">
            <span className="font-medium text-fg">
              {open ? 'Hide' : 'Show'} {fold.lines.length} updates
            </span>
            {' · '}
            {fold.summary}
          </span>
        </button>
        <div id={listId} hidden={!open} className="grid min-w-0 gap-0.5 pl-5">
          {open
            ? fold.lines.map((line) => (
                <ChatLineView
                  key={line.key}
                  line={line}
                  slug={props.slug}
                  onReviewPlan={props.onReviewPlan}
                  meta={NO_HEADER}
                  first={false}
                />
              ))
            : null}
        </div>
      </div>
    </ChatRow>
  );
}
