/**
 * SettingsBox, SettingsRow and BoxEmpty: the bordered list container every settings list uses.
 *
 * Why: connections and harnesses are collections the owner scans, adds to and opens one by
 *   one. One bordered, rounded box with a header row (what the list is, how many, and the
 *   action that adds to it) and hairline-separated rows reads as a single object, so the
 *   list, its count and its add button can never drift apart. An empty list keeps the box
 *   and puts the message and the first action inside it instead of leaving a hole.
 *
 * Exports: SettingsBox, SettingsRow, BoxEmpty.
 * Depends on: react, lucide-react.
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function SettingsBox(props: {
  title: string;
  /** Shown beside the title once the list has loaded. */
  count?: number | undefined;
  /** The button that adds to this list; leave out while loading, failed or empty. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line bg-rail px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {props.title}
          {props.count === undefined ? null : (
            <span className="rounded-full bg-hover px-2 font-data text-xs font-medium text-muted">
              {props.count}
            </span>
          )}
        </h2>
        {props.action}
      </div>
      {props.children}
    </div>
  );
}

/** The inside of one row: icon tile, name line, muted mono metadata line, trailing slot. */
export function SettingsRow(props: {
  icon: LucideIcon | string;
  name: ReactNode;
  meta: ReactNode;
  note?: ReactNode;
  trailing?: ReactNode;
}) {
  const Icon = typeof props.icon === 'string' ? null : props.icon;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-bg font-data text-sm font-medium text-muted"
      >
        {Icon ? (
          <Icon className="size-5" />
        ) : (
          String(props.icon).slice(0, 1).toUpperCase()
        )}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          {props.name}
        </div>
        <p className="font-data text-xs break-words text-muted">{props.meta}</p>
        {props.note ? <p className="text-xs text-faint">{props.note}</p> : null}
      </div>
      {props.trailing}
    </div>
  );
}

export function BoxEmpty(props: { title: string; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 px-4 py-12 text-center">
      <p className="text-base font-semibold">{props.title}</p>
      {props.children ? (
        <div className="max-w-prose text-sm text-muted">{props.children}</div>
      ) : null}
    </div>
  );
}
