/**
 * ScrollArea: a scrolling box with a thin, themed scrollbar that wakes on hover or scroll.
 *
 * Why: the platform scrollbar is wide, grey and always on, which is loud next to quiet
 *   panels (thread, drawers, tables, pickers). The native scroll element is kept (wheel,
 *   touch, keyboard, find-in-page and virtualizers all keep working, and the ref is that
 *   element) and only its colours change: the thumb is transparent until the box is hovered,
 *   focused or has just scrolled, so nothing shifts when it appears.
 *
 * Exports: ScrollArea.
 * Depends on: react, types/empty-state.types, theme/app.css (scroll-area).
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ScrollAreaProps } from '#/types/empty-state.types.js';

const AXIS = {
  vertical: 'overflow-y-auto overflow-x-hidden',
  horizontal: 'overflow-x-auto overflow-y-hidden',
  both: 'overflow-auto',
} as const;

const AWAKE_MS = 900;

export function ScrollArea(props: ScrollAreaProps) {
  const {
    orientation = 'vertical',
    className = '',
    onScroll,
    ref,
    children,
    ...rest
  } = props;

  const element = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;

      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div
      {...rest}
      ref={setRef}
      data-scroll-area=""
      onScroll={(event) => {
        const node = event.currentTarget;

        node.dataset.scrolling = '';
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          delete node.dataset.scrolling;
        }, AWAKE_MS);

        onScroll?.(event);
      }}
      className={`scroll-area overscroll-contain ${AXIS[orientation]} ${className}`}
    >
      {children}
    </div>
  );
}
