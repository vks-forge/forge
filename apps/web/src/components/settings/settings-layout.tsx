/**
 * SettingsLayout: the two-column frame of every settings area, tabs on the left, one section
 * on the right.
 *
 * Why: Forge settings and project settings are both long lists of sections that an owner
 *   visits rarely and wants to find at a glance. One stacked page hides what exists; tabs show
 *   every section at once, and because each tab is a real link, a section can be bookmarked,
 *   shared and reached with the browser's back button. The list sticks while the section
 *   scrolls, moves with the arrow keys (one tab stop, like a toolbar) so a keyboard user does
 *   not tab through every entry, and on a phone folds into a picker so the content keeps the
 *   full width. The layout knows nothing about the section: edits held above it survive a tab
 *   switch; a tab flagged `dirty` shows a small dot (and carries the description "Unsaved changes" for
 *   assistive tech, so its name stays the section's name) so the owner sees which section holds edits before leaving it.
 *
 * Exports: SettingsLayout.
 * Depends on: react, react-router, components/ui/picker, state/use-media-query,
 *   types/settings-layout.types.
 */

import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { matchPath, NavLink, useLocation, useNavigate } from 'react-router';
import { Picker } from '#/components/ui/picker.js';
import { useMediaQuery } from '#/state/use-media-query.js';
import type { SettingsTab } from '#/types/settings-layout.types.js';

const NARROW = '(max-width: 767px)';

function stepIndex(key: string, from: number, count: number): number | null {
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (from + 1) % count;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (from - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

export function SettingsLayout(props: {
  /** Names the tab list for assistive tech, such as "Settings sections". */
  label: string;
  tabs: readonly SettingsTab[];
  children: ReactNode;
}) {
  const { tabs } = props;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const narrow = useMediaQuery(NARROW);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const activeIndex = tabs.findIndex((tab) =>
    matchPath({ path: tab.to, end: false }, pathname),
  );

  const onKeyDown = (event: KeyboardEvent): void => {
    const from = links.current.findIndex((el) => el === document.activeElement);
    const next = stepIndex(event.key, Math.max(from, 0), tabs.length);
    if (next === null) {
      return;
    }

    event.preventDefault();
    links.current[next]?.focus();
  };

  return (
    <div className="grid items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
      {narrow ? (
        <Picker
          label={props.label}
          value={tabs[activeIndex]?.to ?? ''}
          onChange={(to) => void navigate(to)}
          items={tabs.map((tab) => ({
            value: tab.to,
            label: tab.dirty ? `${tab.label} (unsaved)` : tab.label,
            icon: <tab.icon aria-hidden="true" />,
          }))}
        />
      ) : (
        <nav
          aria-label={props.label}
          className="sticky top-6 z-10 grid gap-0.5"
          onKeyDown={onKeyDown}
        >
          {tabs.map((tab, index) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              ref={(el) => {
                links.current[index] = el;
              }}
              tabIndex={index === Math.max(activeIndex, 0) ? 0 : -1}
              aria-description={tab.dirty ? 'Unsaved changes' : undefined}
              className="relative flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted transition-colors duration-150 hover:bg-hover hover:text-fg aria-[current=page]:bg-hover aria-[current=page]:font-medium aria-[current=page]:text-fg"
            >
              <tab.icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
              {tab.dirty ? (
                <span
                  aria-hidden="true"
                  className="ml-auto size-2 shrink-0 rounded-full bg-attn"
                />
              ) : null}
            </NavLink>
          ))}
        </nav>
      )}
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}
