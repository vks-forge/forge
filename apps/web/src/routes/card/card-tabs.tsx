/**
 * CardTabs: Chat, Tickets and Details of the Card page.
 *
 * Why: the three views answer different questions ("what are we saying?", "what was built?",
 *   "where did it come from?"). The Tickets count is the one number that matters at a glance,
 *   and it turns amber only when a ticket waits on the user. Built to the ARIA tabs pattern like
 *   the Memory tabs: one tab stop, Left and Right (and Home and End) move between tabs, and the
 *   active tab is marked by a line that slides with a spring using `transform` only.
 *
 * Exports: CardTabs, CARD_TABS.
 * Depends on: react, motion/react, theme/motion, types/cards-ui.types.
 */

import { motion } from 'motion/react';
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { springs } from '#/theme/motion.js';
import type { CardTab } from '#/types/cards-ui.types.js';

export const CARD_TABS: readonly { id: CardTab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'details', label: 'Details' },
];

export function CardTabs(props: {
  tab: CardTab;
  ticketCount: number;
  needsYou: boolean;
  onChange: (tab: CardTab) => void;
}) {
  const refs = useRef(new Map<CardTab, HTMLButtonElement>());

  function move(event: KeyboardEvent, from: number): void {
    const last = CARD_TABS.length - 1;
    const jump: Record<string, number> = {
      ArrowRight: from === last ? 0 : from + 1,
      ArrowLeft: from === 0 ? last : from - 1,
      Home: 0,
      End: last,
    };

    const to = jump[event.key];
    if (to !== undefined) {
      event.preventDefault();
      const next = CARD_TABS[to]?.id ?? 'chat';
      props.onChange(next);
      refs.current.get(next)?.focus();
    }
  }

  return (
    <div role="tablist" aria-label="Card" className="flex gap-1 border-b border-line">
      {CARD_TABS.map((tab, index) => {
        const active = tab.id === props.tab;

        return (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) {
                refs.current.set(tab.id, node);
              }
            }}
            type="button"
            role="tab"
            id={`card-tab-${tab.id}`}
            aria-selected={active}
            aria-controls="card-panel"
            tabIndex={active ? 0 : -1}
            onClick={() => props.onChange(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={`relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors duration-150 ${
              active ? 'text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {tab.label}
            {tab.id === 'tickets' ? (
              <span
                className={`rounded-md px-1.5 font-data text-xs ${
                  props.needsYou ? 'bg-attn-soft text-fg' : 'bg-hover text-muted'
                }`}
              >
                {props.ticketCount}
              </span>
            ) : null}
            {active ? (
              <motion.span
                layoutId="card-tab-line"
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
