/**
 * Which project the user is working in, including when the URL does not say.
 *
 * Why: Home and every project screen live under `/p/<slug>`, but Forge settings do not, and the
 *   sidebar must still show the project nav and the switcher must still name a project there.
 *   The URL wins; otherwise the last project visited (so "Forge settings" and back returns to
 *   the same project, and so does reopening the app tomorrow); otherwise the first open
 *   project, which is what a first visit to `/` opens (d-0104). The slug is kept in
 *   `localStorage` (`forge.ui.project`, d-0122); a slug that no longer exists is ignored.
 *
 * Exports: rememberProject(), recalledProject(), useCurrentSlug(), projectPrefsStore.
 * Depends on: react-router, state/create-persisted-store, schemas/projects (type),
 *   schemas/ui-state, types/ui-state.types.
 */

import { useMatch } from 'react-router';
import type { ProjectView } from '#/schemas/projects.js';
import { ProjectPrefsSchema } from '#/schemas/ui-state.js';
import { createPersistedStore } from '#/state/create-persisted-store.js';
import type { ProjectPrefs } from '#/types/ui-state.types.js';

export const projectPrefsStore = createPersistedStore<ProjectPrefs>({
  name: 'project',
  version: 1,
  initial: { slug: null },
  schema: ProjectPrefsSchema,
});

export function rememberProject(slug: string): void {
  projectPrefsStore.setState({ slug });
}

export function recalledProject(): string | undefined {
  return projectPrefsStore.getState().slug ?? undefined;
}

/** The slug in the URL, else the remembered one if it still exists, else the first open project. */
export function useCurrentSlug(
  projects: readonly ProjectView[] | undefined,
): string | undefined {
  const match = useMatch({ path: '/p/:slug', end: false });
  const recalled = projectPrefsStore((p) => p.slug);
  const fromUrl = match?.params.slug;
  if (fromUrl !== undefined) {
    return fromUrl;
  }

  return projects?.find((p) => p.slug === recalled)?.slug ?? projects?.[0]?.slug;
}
