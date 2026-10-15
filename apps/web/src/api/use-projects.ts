/**
 * `useProjects()`: the project list as a TanStack Query, plus the helpers the shell needs.
 *
 * Why: the project switcher, the root redirect and every project-scoped page need the same
 *   list, with the same loading, empty and error handling. One query key means one request,
 *   one cache and one place to refetch after the user creates a project. Archived projects are
 *   kept for history, take no new work, and are not offered to switch to (d-0104).
 *
 * Exports: useProjects(), PROJECTS_KEY, openProjects().
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

export function useProjects() {
  const api = useForgeApi();

  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: ({ signal }) => api.projects.list({ signal }),
    select: openProjects,
  });
}
