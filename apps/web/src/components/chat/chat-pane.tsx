/**
 * ChatPane: the frame of a conversation, a message list that scrolls above a docked composer.
 *
 * Why: in a chat the box you type in must not move. The page gives this pane a fixed height
 *   (the tab panel below the header and tabs), the list takes whatever is left and scrolls on
 *   its own, and the composer sits under it with room for a phone's home bar
 *   (`safe-area-inset-bottom`); heights come from `dvh`, so the on-screen keyboard shrinks the
 *   list, not the box. Content is centred in a reading column (48rem) so bubbles are not
 *   stretched across a wide screen. The list follows the newest line only while the reader is
 *   at the bottom; scrolled up, a quiet "Jump to latest" pill (with a count of what arrived)
 *   brings them back. New lines announce politely to screen readers through the log role. If
 *   the reader left it scrolled up, the offset is parked in the page's scroll memory.
 *
 * Exports: ChatPane.
 * Depends on: react, lucide-react, components/ui/scroll-area, components/thread/use-stick-to-bottom,
 *   types/route-tabs.types.
 */

import { ArrowDown } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import {
  NEAR_BOTTOM_PX,
  useStickToBottom,
} from '#/components/thread/use-stick-to-bottom.js';
import { ScrollArea } from '#/components/ui/scroll-area.js';
import type { ScrollMemory } from '#/types/route-tabs.types.js';

export function ChatPane(props: {
  /** Accessible name of the message list. */
  label: string;
  /** The list's scroll element, for a caller that needs it (a virtualizer). */
  ref?: Ref<HTMLDivElement>;
  /** Number of lines; growth triggers following. */
  count: number;
  /** Extra height changes (a virtualised list's total size). */
  size?: number;
  follow: boolean;
  /** Where this pane parks its scroll position, if the page keeps one. */
  memory?: ScrollMemory;
  memoryKey?: string;
  /** A strip above the list (connection state, toggles). */
  toolbar?: ReactNode;
  /** The docked box under the list; absent when nothing can be sent. */
  composer?: ReactNode;
  children: ReactNode;
}) {
  const { memory, memoryKey, ref } = props;
  const scroller = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      scroller.current = node;

      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  // Read once when the pane opens: -1 means "was following the newest line".
  const [initialTop] = useState(() => {
    const saved = memory && memoryKey ? memory.get(memoryKey) : undefined;

    return saved !== undefined && saved >= 0 ? saved : undefined;
  });

  const { stuck, unread, onScroll, jumpToLatest } = useStickToBottom(
    scroller,
    props.count,
    props.size ?? 0,
    props.follow,
    initialTop,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {props.toolbar ? <div className="shrink-0 pb-2">{props.toolbar}</div> : null}
      <div className="relative min-h-0 flex-1">
        <ScrollArea
          ref={setRef}
          onScroll={() => {
            onScroll();
            const el = scroller.current;
            if (el && memory && memoryKey) {
              const near =
                el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;

              memory.set(memoryKey, near ? -1 : el.scrollTop);
            }
          }}
          role="log"
          aria-live="polite"
          aria-label={props.label}
          tabIndex={0}
          className="h-full"
        >
          <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col px-1 py-3">
            {props.children}
          </div>
        </ScrollArea>
        {!stuck ? (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium text-fg shadow-float transition-colors duration-150 hover:bg-hover"
          >
            <ArrowDown aria-hidden="true" className="size-4" />
            Jump to latest
            {unread > 0 ? (
              <span className="font-data text-xs text-muted">({unread} new)</span>
            ) : null}
          </button>
        ) : null}
      </div>
      {props.composer ? (
        <div className="shrink-0 border-t border-line bg-bg pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mx-auto w-full max-w-3xl px-1">{props.composer}</div>
        </div>
      ) : null}
    </div>
  );
}
