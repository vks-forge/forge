/**
 * PlaceholderPage: the honest stand-in for a screen that a later batch builds.
 *
 * Why: the shell, routing and navigation ship first so every later batch plugs into a working
 *   frame; the screens themselves arrive one batch at a time (docs/design/web-build-plan.md).
 *   Until then the sidebar hides the destination; an old link still says what it will do, so a
 *   user who lands on it learns that it is planned rather than broken, and a builder replaces exactly
 *   one file. It is the shared EmptyState (centred, quiet, one title and one help line) like
 *   every other empty screen, with the page's own heading kept for assistive tech and the tab
 *   title; project screens also name the project, which proves the switcher changed the view.
 *
 * Exports: PlaceholderPage.
 * Depends on: react, react-router, lucide-react, components/ui/empty-state, types/nav.types.
 */

import { Hammer } from 'lucide-react';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { EmptyState } from '#/components/ui/empty-state.js';
import type { NavEntry } from '#/types/nav.types.js';

export function PlaceholderPage(props: { entry: NavEntry; inProject?: boolean }) {
  const { entry } = props;
  const { slug } = useParams();

  useEffect(() => {
    document.title = `${entry.label} · Forge`;
  }, [entry.label]);

  return (
    <section aria-label={entry.label} className="grid">
      <h1 className="sr-only">
        {props.inProject && slug ? `${slug}: ` : ''}
        {entry.label}
      </h1>
      <EmptyState icon={Hammer} title={`${entry.label} is not built yet`}>
        {entry.blurb} This screen is not built yet.
      </EmptyState>
    </section>
  );
}
