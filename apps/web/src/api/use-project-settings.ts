/**
 * Project settings as TanStack Query: one read, one versioned save, one archive, one delete.
 *
 * Why: the settings screen, its history list and its conflict banner must all describe the
 *   same server state. One query key holds the snapshot (settings, versions, company
 *   inheritance); a successful save or a 409 refetches it, so the screen always compares the
 *   user's draft with what the server holds now. Archiving also refreshes the project list
 *   so the switcher stops offering the project; deleting does the same.
 *
 * Exports: useProjectSettings(), useSaveSettings(), useArchiveProject(), useDeleteProject(), settingsKey().
 * Depends on: @tanstack/react-query, api/api-provider, api/use-projects, types/*.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { PROJECTS_KEY } from '#/api/use-projects.js';
import type { SettingsSaveRequest } from '#/types/project-settings.types.js';

export const settingsKey = (slug: string) => ['project-settings', slug] as const;

export function useProjectSettings(slug: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: settingsKey(slug),
    queryFn: ({ signal }) => api.projectSettings.get(slug, { signal }),
  });
}

/** Saves a new version. Success refreshes the snapshot; a failure (409 included) leaves the draft alone. */
export function useSaveSettings(slug: string) {
  const api = useForgeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: Omit<SettingsSaveRequest, 'slug'>) =>
      api.projectSettings.save({ ...request, slug }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKey(slug) }),
  });
}

export function useArchiveProject(slug: string) {
  const api = useForgeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.projectSettings.archive(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

/** Deletes the project from Forge; `confirm` is the typed slug. Success refreshes the project list. */
export function useDeleteProject(slug: string) {
  const api = useForgeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (confirm: string) => api.projectSettings.remove(slug, confirm),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}
