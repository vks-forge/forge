/**
 * SettingsCard, FormFooter and SettingsSkeleton: the card every settings section sits in.
 *
 * Why: sections that share one frame (title and description on top, fields in the middle, a
 *   tinted footer bar with the help text on the left and the section's one button on the
 *   right) tell the owner where to look: the button that saves a section is always at the
 *   bottom-right of that section, never lost between fields. While a page loads, the skeleton
 *   has the shape of the real hero and cards, so nothing jumps when data arrives.
 *
 * Exports: SettingsCard, FormFooter, SettingsSkeleton.
 * Depends on: react.
 */

import type { ReactNode } from 'react';

export function SettingsCard(props: {
  title: string;
  description?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  const headingId = props.id ? `${props.id}-heading` : undefined;

  return (
    <section
      id={props.id}
      aria-labelledby={headingId}
      className="scroll-mt-[calc(var(--settings-nav-offset,0px)+1rem)] overflow-hidden rounded-xl border border-line bg-surface"
    >
      <div className="grid gap-5 p-5 md:p-6">
        <div className="grid gap-1">
          <h2 id={headingId} className="text-base font-semibold tracking-tight">
            {props.title}
          </h2>
          {props.description ? (
            <p className="max-w-prose text-sm text-muted">{props.description}</p>
          ) : null}
        </div>
        {props.children}
      </div>
    </section>
  );
}

/**
 * The tinted bar at the foot of a card. It pulls out to the card's edges, so place it as the
 * last child of the card's body.
 */
export function FormFooter(props: { help?: ReactNode; children: ReactNode }) {
  return (
    <div className="-mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-rail px-5 py-3 md:-mx-6 md:-mb-6 md:px-6">
      <div className="min-w-0 max-w-prose text-sm text-muted">{props.help}</div>
      <div className="flex flex-wrap items-center gap-2">{props.children}</div>
    </div>
  );
}

export function SettingsSkeleton(props: { label: string; cards?: number }) {
  return (
    <div role="status" aria-label={props.label} className="grid gap-8">
      <div className="grid gap-5">
        <div className="h-4 w-48 animate-pulse rounded bg-hover" />
        <div className="flex items-start gap-4">
          <div className="size-12 animate-pulse rounded-xl bg-hover" />
          <div className="grid gap-2">
            <div className="h-7 w-56 animate-pulse rounded-md bg-hover" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded bg-hover" />
          </div>
        </div>
        <div className="h-16 animate-pulse rounded-xl bg-hover" />
      </div>
      {Array.from({ length: props.cards ?? 2 }, (_, index) => (
        <div key={index} className="h-40 animate-pulse rounded-xl bg-hover" />
      ))}
    </div>
  );
}
