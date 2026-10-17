/**
 * RouteTabs: a tab strip whose tabs are real links, so each view of a page has its own URL.
 *
 * Why: the Card and Ticket pages hold several views (conversation, plan, runs, details) that a
 *   person wants to link to, reload and step back through. Each tab is a link, so a middle
 *   click opens it in a new tab and Back returns to the previous view. It follows the ARIA tabs
 *   pattern: one tab stop, Left and Right (and Home and End) move between tabs and open them,
 *   and the active tab carries a line that slides with a spring using `transform` only. A count
 *   or mark may follow the label; it turns amber only when the thing it counts waits on the
 *   owner. The strip never scrolls the page: it sits above the panel, which scrolls on its own.
 *
 * Exports: RouteTabs.
 * Depends on: react, react-router, motion/react, theme/motion, types/route-tabs.types.
 */

import { motion } from 'motion/react';
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { springs } from '#/theme/motion.js';
import type { RouteTab } from '#/types/route-tabs.types.js';

export function RouteTabs(props: {
  /** Accessible name of the strip. */
  label: string;
  /** Makes the tab ids and the sliding line unique when two strips exist. */
  idPrefix: string;
  tabs: readonly RouteTab[];
  active: string;
}) {
  const { idPrefix, tabs } = props;
  const navigate = useNavigate();
  const refs = useRef(new Map<string, HTMLAnchorElement>());

  function move(event: KeyboardEvent, from: number): void {
    const last = tabs.length - 1;
    const jump: Record<string, number> = {
      ArrowRight: from === last ? 0 : from + 1,
      ArrowLeft: from === 0 ? last : from - 1,
      Home: 0,
      End: last,
    };

    const to = jump[event.key];
    const next = to === undefined ? undefined : tabs[to];
    if (next === undefined) {
      return;
    }

    event.preventDefault();
    void navigate(next.to);
    refs.current.get(next.id)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={props.label}
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {tabs.map((tab, index) => {
        const active = tab.id === props.active;

        return (
          <Link
            key={tab.id}
            ref={(node) => {
              if (node) {
                refs.current.set(tab.id, node);
              }
            }}
            to={tab.to}
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-label={tab.ariaLabel}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => move(event, index)}
            className={`relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium no-underline transition-colors duration-150 ${
              active ? 'text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {tab.label}
            {tab.mark}
            {tab.count === undefined ? null : (
              <span
                className={`rounded-md px-1.5 font-data text-xs ${
                  tab.attention ? 'bg-attn-soft text-fg' : 'bg-hover text-muted'
                }`}
              >
                {tab.count}
              </span>
            )}
            {active ? (
              <motion.span
                layoutId={`${idPrefix}-tab-line`}
                transition={springs.snappy}
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-signal"
              />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
