/**
 * PlaceholderPage: the honest stand-in for a screen that a later batch builds.
 *
 * Why: the shell, routing and navigation ship first so every later batch plugs into a working
 *   frame; the screens themselves arrive one batch at a time (docs/design/web-build-plan.md).
 *   Until then each destination shows what it will do and which batch delivers it, so a user
 *   who clicks it learns that it is planned rather than broken, and a builder replaces exactly
 *   one file. Project screens also name the project, which proves the switcher changed the view.
 *
 * Exports: PlaceholderPage.
 * Depends on: react, react-router, types/nav.types.
 */

import { useEffect } from 'react';
import { useParams } from 'react-router';
import type { NavEntry } from '#/types/nav.types.js';

export function PlaceholderPage(props: { entry: NavEntry; inProject?: boolean }) {
  const { entry } = props;
  const { slug } = useParams();

  useEffect(() => {
    document.title = `${entry.label} · Forge`;
  }, [entry.label]);

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        {props.inProject && slug ? (
          <p className="font-data text-xs text-muted">{slug}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{entry.label}</h1>
      </div>
      <p className="max-w-prose text-muted">{entry.blurb}</p>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="rounded-md border border-line px-1.5 font-data text-xs">
          {entry.batch}
        </span>
        <span>Coming in {entry.batch} of the web build plan.</span>
      </p>
    </section>
  );
}
