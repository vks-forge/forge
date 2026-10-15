/**
 * NavLinkItem: one sidebar destination with icon, label and the gliding highlight.
 *
 * Why: the sidebar is the user's map. Each entry shows where it goes, which one is current
 *   (`aria-current="page"` for assistive tech, the shared highlight for sighted users), and
 *   stays on one line so a long label never breaks the column. Hover, press and focus are
 *   distinct, and the icon is paired with its label because an icon alone does not say
 *   "Memory" or "Runs".
 *
 * Exports: NavLinkItem.
 * Depends on: react-router, lucide-react, components/motion/active-indicator.
 */

import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { ActiveIndicator } from '#/components/motion/active-indicator.js';

export function NavLinkItem(props: {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match only this exact path (Home), not its children. */
  exact?: boolean;
  /** A count shown after the label, such as unread inbox items; hidden at 0 or when unknown. */
  badge?: { count: number; label: string; attention: boolean } | undefined;
}) {
  const Icon = props.icon;

  return (
    <NavLink
      to={props.to}
      end={props.exact ?? false}
      className="relative flex min-h-9 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 text-sm text-muted transition-[color,transform] duration-150 hover:text-fg active:translate-y-px aria-[current=page]:font-medium aria-[current=page]:text-fg"
    >
      {({ isActive }) => (
        <>
          {isActive ? <ActiveIndicator /> : null}
          <Icon aria-hidden="true" className="relative size-4 shrink-0" />
          <span className="relative flex-1 truncate">{props.label}</span>
          {props.badge && props.badge.count > 0 ? (
            <span
              role="status"
              aria-label={props.badge.label}
              className={`relative rounded-md px-1.5 font-data text-xs ${
                props.badge.attention ? 'bg-attn-soft text-fg' : 'bg-hover text-muted'
              }`}
            >
              {props.badge.count}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}
