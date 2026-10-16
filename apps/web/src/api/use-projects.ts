/**
 * `useProjects()`: the project list as a TanStack Query, plus the helpers the shell needs.
 *
 * Why: the project switcher, the root redirect and every project-scoped page need the same
 *   list, with the same loading, empty and error handling. One query key means one request,
 *   one cache and one place to refetch after the user creates a project. Archived projects are
 *   kept for history and take no new work: `useProjects()` is the open ones (what Home, the
 *   nav and the redirect use), `useAllProjects()` adds the archived ones for the switcher's
 *   Archived section and for screens that must still open an archived project (d-0157).
 *
 * Exports: useProjects(), useAllProjects(), PROJECTS_KEY, openProjects(), archivedProjects().
 * Depends on: @tanstack/react-query, api/api-provider, schemas/projects (type).
 */

import { useQuery } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import type { ProjectView } from '#/schemas/projects.js';

export const PROJECTS_KEY = ['projects'] as const;

/** Projects a user can switch to: everything except archived. */
export function openProjects(projects: readonly ProjectView[]): readonly ProjectView[] {
  return projects.filter((p) => p.status !== 'archived');
}

/** Archived projects: listed for history and unarchiving, never offered as a place to start work. */
export function archivedProjects(
  projects: readonly ProjectView[],
): readonly ProjectView[] {
  return projects.filter((p) => p.status === 'archived');
}

/** Every project including archived ones. */
export function useAllProjects() {
  const api = useForgeApi();

  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: ({ signal }) => api.projects.list({ signal }),
  });
}

export function useProjects() {
  const api = useForgeApi();

  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: ({ signal }) => api.projects.list({ signal }),
    select: openProjects,
  });
}
