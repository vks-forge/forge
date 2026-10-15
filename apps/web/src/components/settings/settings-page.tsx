/**
 * SettingsPage and SettingsSection: the frame every Forge settings screen shares.
 *
 * Why: Harnesses, GitHub, Limits and General are used for rare, careful changes, so they must
 *   read the same way: a title and one line on what the screen is for, then sections where
 *   the left column says what a group of settings does and the right column holds the
 *   controls. Hairlines and whitespace separate sections instead of a box around everything,
 *   which keeps a long form calm, and on a phone the two columns stack. The page also sets
 *   the browser tab title so a user with several tabs can tell them apart.
 *
 * Exports: SettingsPage, SettingsSection.
 * Depends on: react, react-router, lucide-react.
 */

import { ChevronLeft } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function SettingsPage(props: {
  title: string;
  intro: string;
  back?: { to: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { title } = props;

  useEffect(() => {
    document.title = `${title} · Forge settings · Forge`;
  }, [title]);

  return (
    <section className="grid max-w-4xl gap-8 pb-16">
      <header className="grid gap-2">
        {props.back ? (
          <Link
            to={props.back.to}
            className="inline-flex min-h-9 w-fit items-center gap-1 text-sm text-muted hover:text-fg"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            {props.back.label}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {props.actions}
        </div>
        <p className="max-w-prose text-muted">{props.intro}</p>
      </header>
      {props.children}
    </section>
  );
}

export function SettingsSection(props: {
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
      className="grid gap-4 border-t border-line pt-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8"
    >
      <div className="grid content-start gap-1">
        <h2 id={headingId} className="text-base font-semibold">
          {props.title}
        </h2>
        {props.description ? (
          <p className="text-sm text-muted">{props.description}</p>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-4">{props.children}</div>
    </section>
  );
}
