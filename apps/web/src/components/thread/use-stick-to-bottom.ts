/**
 * `useStickToBottom()`: keeps a growing list scrolled to its newest line until the user
 * scrolls away.
 *
 * Why: a live thread that does not follow forces the user to scroll for every line; one that
 *   always follows snatches the page away while they read an earlier tool call. So it
 *   follows only while the user is within a few pixels of the bottom, stops the moment they
 *   scroll up, counts what arrived meanwhile, and offers "Jump to latest" to resume. Users
 *   who never want following can turn it off (thread prefs).
 *
 * Exports: useStickToBottom(), NEAR_BOTTOM_PX.
 * Depends on: react.
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
) {
  const [stuck, setStuck] = useState(true);
  const [anchor, setAnchor] = useState(count);
  const stuckRef = useRef(true);

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

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && enabled && stuckRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [ref, count, size, enabled]);

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
