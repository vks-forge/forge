/**
 * MemoryTabs: Decisions, Rejected, Proposals and Outcomes, with a count on each.
 *
 * Why: the four kinds of record answer different questions ("what binds the Director?",
 *   "what did we refuse?", "what waits on me?", "what happened?"). The Proposals count is the
 *   one number that asks for action, so it is the only one set in the attention colour when
 *   above zero. Built to the ARIA tabs pattern: one tab stop, Left and Right (and Home and End)
 *   move between tabs, the active tab is marked by a line that slides with a spring using
 *   `transform` only.
 *
 * Exports: MemoryTabs, TAB_LABELS.
 * Depends on: react, motion/react, theme/motion, types/memory.types.
 */

import { motion } from 'motion/react';
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { springs } from '#/theme/motion.js';
import type { MemoryTab } from '#/types/memory.types.js';

export const TAB_LABELS: Readonly<Record<MemoryTab, string>> = {
  decisions: 'Decisions',
  rejected: 'Rejected',
  proposals: 'Proposals',
  outcomes: 'Outcomes',
};

const ORDER: readonly MemoryTab[] = ['decisions', 'rejected', 'proposals', 'outcomes'];

export function MemoryTabs(props: {
  tab: MemoryTab;
  counts: Readonly<Record<MemoryTab, number>>;
  onChange: (tab: MemoryTab) => void;
}) {
  const refs = useRef(new Map<MemoryTab, HTMLButtonElement>());

  function move(event: KeyboardEvent, from: number): void {
    const jump: Record<string, number> = {
      ArrowRight: (from + 1) % ORDER.length,
      ArrowLeft: (from + ORDER.length - 1) % ORDER.length,
      Home: 0,
      End: ORDER.length - 1,
    };

    const to = jump[event.key];
    if (to !== undefined) {
      event.preventDefault();
      const next = ORDER[to] as MemoryTab;
      props.onChange(next);
      refs.current.get(next)?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Memory"
      className="flex gap-1 scroll-area overflow-x-auto border-b border-line"
    >
      {ORDER.map((tab, index) => {
        const active = tab === props.tab;
        const waiting = tab === 'proposals' && props.counts.proposals > 0;

        return (
          <button
            key={tab}
            ref={(node) => {
              if (node) {
                refs.current.set(tab, node);
              }
            }}
            type="button"
            role="tab"
            id={`memory-tab-${tab}`}
            aria-selected={active}
            aria-controls="memory-panel"
            tabIndex={active ? 0 : -1}
            onClick={() => props.onChange(tab)}
            onKeyDown={(event) => move(event, index)}
            className={`relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors duration-150 ${
              active ? 'text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {TAB_LABELS[tab]}
            <span
              className={`rounded-md px-1.5 font-data text-xs ${
                waiting ? 'bg-attn-soft text-fg' : 'bg-hover text-muted'
              }`}
            >
              {props.counts[tab]}
            </span>
            {active ? (
              <motion.span
                layoutId="memory-tab-line"
                transition={springs.snappy}
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-signal"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
