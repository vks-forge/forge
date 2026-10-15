/**
 * WindowedList: renders only the rows in view, so a list of thousands scrolls at 60 fps.
 *
 * Why: the memory outcomes tab grows with every ticket Forge finishes; mounting every row
 *   makes scrolling and filtering stutter (motion floor: lists past ~100 rows are
 *   virtualised, d-0103). Rows have one fixed height, so the visible range is arithmetic on
 *   the scroll offset and rows are placed with a `transform`, never `top`. Short lists render
 *   plainly with no scroll box, so the common case has no extra machinery. Each row carries
 *   its position (`aria-posinset` of `aria-setsize`) so assistive tech still hears "item 40 of
 *   130" although only a few rows exist in the DOM.
 *
 * Exports: WindowedList, WINDOW_THRESHOLD.
 * Depends on: react.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Below this many rows everything is rendered. */
export const WINDOW_THRESHOLD = 100;

const OVERSCAN = 6;
const FALLBACK_HEIGHT = 640;

export function WindowedList<T>(props: {
  items: readonly T[];
  rowHeight: number;
  label: string;
  keyOf: (item: T) => string;
  renderRow: (item: T) => ReactNode;
}) {
  const { items, rowHeight } = props;
  const box = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(FALLBACK_HEIGHT);
  const windowed = items.length > WINDOW_THRESHOLD;

  const measure = useCallback(() => {
    const measured = box.current?.clientHeight ?? 0;
    setHeight(measured > 0 ? measured : FALLBACK_HEIGHT);
  }, []);

  useEffect(() => {
    if (!windowed || !box.current) {
      return undefined;
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box.current);

    return () => observer.disconnect();
  }, [windowed, measure]);

  if (!windowed) {
    return (
      <ul aria-label={props.label} className="grid">
        {items.map((item) => (
          <li key={props.keyOf(item)} style={{ height: rowHeight }}>
            {props.renderRow(item)}
          </li>
        ))}
      </ul>
    );
  }

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const last = Math.min(
    items.length,
    Math.ceil((scrollTop + height) / rowHeight) + OVERSCAN,
  );

  return (
    <div
      ref={box}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="h-[min(70vh,48rem)] overflow-y-auto overscroll-contain"
    >
      <ul
        aria-label={props.label}
        className="relative"
        style={{ height: items.length * rowHeight }}
      >
        {items.slice(first, last).map((item, offset) => (
          <li
            key={props.keyOf(item)}
            aria-posinset={first + offset + 1}
            aria-setsize={items.length}
            className="absolute inset-x-0 top-0"
            style={{
              height: rowHeight,
              transform: `translateY(${(first + offset) * rowHeight}px)`,
            }}
          >
            {props.renderRow(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}
