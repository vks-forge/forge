/**
 * Which project the user is working in, including when the URL does not say.
 *
 * Why: Home and every project screen live under `/p/<slug>`, but Forge settings do not, and the
 *   sidebar must still show the project nav and the switcher must still name a project there.
 *   The URL wins; otherwise the last project visited this session (so "Forge settings" and back
 *   returns to the same project); otherwise the first open project, which is what a fresh
 *   visit to `/` opens (d-0104).
 *
 * Exports: rememberProject(), recalledProject(), useCurrentSlug().
 * Depends on: react-router, schemas/projects (type). IO: sessionStorage.
 */

import { useMatch } from 'react-router';
import type { ProjectView } from '#/schemas/projects.js';

const KEY = 'forge.project';

export function rememberProject(slug: string): void {
  try {
    sessionStorage.setItem(KEY, slug);
  } catch {
    // Remembering is a convenience; a blocked store only means "first project" next time.
  }
}

export function recalledProject(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** The slug in the URL, else the remembered one if it still exists, else the first open project. */
export function useCurrentSlug(
  projects: readonly ProjectView[] | undefined,
): string | undefined {
  const match = useMatch({ path: '/p/:slug', end: false });
  const fromUrl = match?.params.slug;
  if (fromUrl !== undefined) {
    return fromUrl;
  }

  const recalled = recalledProject();

  return projects?.find((p) => p.slug === recalled)?.slug ?? projects?.[0]?.slug;
}
