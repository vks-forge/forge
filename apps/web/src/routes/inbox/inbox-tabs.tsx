/**
 * InboxTabs: Needs action, Unread, All and Archived, with a count on each.
 *
 * Why: the four views answer different questions ("what waits on me?", "what is new?", "what
 *   is there?", "what did I put away?"). "Needs action" is the one that asks the user to do
 *   something, so its count alone takes the attention colour when above zero. Built to the
 *   ARIA tabs pattern: one tab stop, Left and Right (and Home and End) move between tabs, and
 *   the active tab's line glides with a spring on `transform` only.
 *
 * Exports: InboxTabs, INBOX_VIEW_LABEL.
 * Depends on: react, motion/react, theme/motion, @forge/core (types).
 */

import { motion } from 'motion/react';
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { InboxCounts, InboxView } from '@forge/core';
import { springs } from '#/theme/motion.js';

export const INBOX_VIEW_LABEL: Readonly<Record<InboxView, string>> = {
  needs_action: 'Needs action',
  unread: 'Unread',
  all: 'All',
  archived: 'Archived',
};

const ORDER: readonly InboxView[] = ['needs_action', 'unread', 'all', 'archived'];

export function InboxTabs(props: {
  view: InboxView;
  /** Undefined while the counts are loading or unavailable: tabs then show no number. */
  counts: InboxCounts | undefined;
  onChange: (view: InboxView) => void;
}) {
  const refs = useRef(new Map<InboxView, HTMLButtonElement>());

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
      const next = ORDER[to] as InboxView;
      props.onChange(next);
      refs.current.get(next)?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Inbox views"
      className="flex gap-1 scroll-area overflow-x-auto border-b border-line"
    >
      {ORDER.map((view, index) => {
        const active = view === props.view;
        const count = props.counts?.[view];
        const waiting = view === 'needs_action' && (count ?? 0) > 0;

        return (
          <button
            key={view}
            ref={(node) => {
              if (node) {
                refs.current.set(view, node);
              }
            }}
            type="button"
            role="tab"
            id={`inbox-tab-${view}`}
            aria-selected={active}
            aria-controls="inbox-panel"
            tabIndex={active ? 0 : -1}
            onClick={() => props.onChange(view)}
            onKeyDown={(event) => move(event, index)}
            className={`relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors duration-150 ${
              active ? 'text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {INBOX_VIEW_LABEL[view]}
            {count === undefined ? null : (
              <span
                className={`rounded-md px-1.5 font-data text-xs ${
                  waiting ? 'bg-attn-soft text-fg' : 'bg-hover text-muted'
                }`}
              >
                {count}
              </span>
            )}
            {active ? (
              <motion.span
                layoutId="inbox-tab-line"
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
