/**
 * `useStickToBottom()`: keeps a growing list scrolled to its newest line until the user
 * scrolls away.
 *
 * Why: a live thread that does not follow forces the user to scroll for every line; one that
 *   always follows snatches the page away while they read an earlier tool call. So it
 *   follows only while the user is within a few pixels of the bottom, stops the moment they
 *   scroll up, counts what arrived meanwhile, and offers "Jump to latest" to resume. Users
 *   who never want following can turn it off (thread prefs). A list that opens at a saved
 *   offset (the owner scrolled up, switched tab and came back) starts un-stuck at that offset
 *   instead of jumping to the newest line. When the list itself is resized (the needs-you dock
 *   above the message box opening or folding) a reader at the bottom stays at the bottom.
 *
 * Exports: useStickToBottom(), NEAR_BOTTOM_PX.
 * Depends on: react.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** Within this many px of the bottom still counts as "at the bottom". */
export const NEAR_BOTTOM_PX = 48;

export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  /** Number of lines; growth is what triggers following. */
  count: number,
  /** Anything else that changes the content height (virtualised total size). */
  size: number,
  enabled: boolean,
  /** A saved offset to open at instead of the newest line. */
  initialTop?: number,
) {
  const restored = initialTop !== undefined;
  const [stuck, setStuck] = useState(!restored);
  const [anchor, setAnchor] = useState(count);
  const stuckRef = useRef(!restored);
  const openAt = useRef(initialTop);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    if (near !== stuckRef.current) {
      stuckRef.current = near;
      setStuck(near);
      if (!near) {
        setAnchor(count);
      }
    }
  }, [ref, count]);

  // Only on mount: later growth follows the newest line or leaves the reader alone.
  useLayoutEffect(() => {
    if (ref.current && openAt.current !== undefined) {
      ref.current.scrollTop = openAt.current;
    }
  }, [ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && enabled && stuckRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [ref, count, size, enabled]);

  // The list's own height changes when the dock above the message box opens, folds or changes
  // item: a reader who was at the bottom must still be at the bottom, or the newest line hides.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    let height = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (el.clientHeight !== height) {
        height = el.clientHeight;
        if (stuckRef.current) {
          el.scrollTop = el.scrollHeight;
        }
      }
    });

    observer.observe(el);

    return () => observer.disconnect();
  }, [ref]);

  const jumpToLatest = useCallback(() => {
    const el = ref.current;
    stuckRef.current = true;
    setStuck(true);
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [ref]);

  return {
    /** True while following the newest line. */
    stuck,
    /** Lines that arrived since the user scrolled away. */
    unread: stuck ? 0 : Math.max(0, count - anchor),
    onScroll,
    jumpToLatest,
  };
}
