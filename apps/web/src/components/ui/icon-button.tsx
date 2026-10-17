/**
 * IconButton: a square icon-only button that always has a name and, when it cannot act, says why.
 *
 * Why: reordering and removing rows is done with small icon buttons, and an icon alone tells a
 *   screen reader nothing and a sighted user little. This one needs a label (its accessible name,
 *   also its tooltip) and, when disabled, a reason that replaces the tooltip, so "move up" on the
 *   first row explains itself instead of silently doing nothing. It stays 36 px square so it is
 *   reachable by touch and keyboard.
 *
 * Exports: IconButton.
 * Depends on: react, components/ui/tooltip.
 */

import type { ReactNode } from 'react';
import { Tooltip } from '#/components/ui/tooltip.js';

export function IconButton(props: {
  label: string;
  /** Why the button cannot be used right now; makes it disabled. */
  blockedReason?: string | undefined;
  onClick: () => void;
  children: ReactNode;
}) {
  const blocked = props.blockedReason !== undefined;

  return (
    <Tooltip content={props.blockedReason ?? props.label}>
      <span className="inline-flex">
        <button
          type="button"
          aria-label={props.label}
          disabled={blocked}
          onClick={props.onClick}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-fg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface"
        >
          {props.children}
        </button>
      </span>
    </Tooltip>
  );
}
