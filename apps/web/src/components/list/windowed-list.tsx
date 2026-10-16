/**
 * WindowedList: a scrolling list that stays fast at any length.
 *
 * Why: a Board column can hold hundreds of tickets (a long-finished project's Done column).
 *   Drawing every card costs layout and memory the user never sees, so past a threshold only
 *   the cards in view are mounted (virtualised). Short lists draw everything and animate:
 *   a card changing column glides from its old place to its new one (shared layout spring,
 *   transform only). Virtualised rows are absolutely positioned and skip that glide: a
 *   windowed row has no old place to come from, and 100+ simultaneous layout measurements
 *   would break the 60 fps floor (d-0103). When the OS asks for reduced motion the glide is
 *   removed outright and a card simply appears in its new column (`data-motion="instant"`).
 *
 * Exports: WindowedList, WINDOW_THRESHOLD.
 * Depends on: react, motion/react, @tanstack/react-virtual, theme/motion.
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, useReducedMotionConfig } from 'motion/react';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { springs } from '#/theme/motion.js';

/** More rows than this and the list is virtualised. */
export const WINDOW_THRESHOLD = 100;

export function WindowedList<T>(props: {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Rough row height in px before a row is measured. */
  estimate?: number;
  label: string;
  className?: string;
}) {
  const { items, getKey, renderItem, estimate = 104, label, className = '' } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const windowed = items.length > WINDOW_THRESHOLD;
  // Under reduced motion a card swaps column instantly: no layout glide at all, not a slower one.
  const glide = useReducedMotionConfig() !== true;
  const virtualizer = useVirtualizer({
    count: windowed ? items.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => estimate,
    overscan: 8,
    getItemKey: (index) => getKey(items[index] as T),
  });

  return (
    <div ref={scroller} className={`overflow-y-auto ${className}`}>
      {windowed ? (
        <ul
          aria-label={label}
          className="relative"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((row) => (
            <li
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              className="absolute inset-x-0 top-0 pb-2"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              {renderItem(items[row.index] as T)}
            </li>
          ))}
        </ul>
      ) : (
        <ul
          aria-label={label}
          data-motion={glide ? 'glide' : 'instant'}
          className="grid gap-2"
        >
          {items.map((item) =>
            glide ? (
              <motion.li
                key={getKey(item)}
                layout="position"
                layoutId={`card-${getKey(item)}`}
                transition={springs.smooth}
              >
                {renderItem(item)}
              </motion.li>
            ) : (
              <li key={getKey(item)}>{renderItem(item)}</li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
