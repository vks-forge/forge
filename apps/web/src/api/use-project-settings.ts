/**
 * Project settings as TanStack Query: one read, one versioned save, one archive, one unarchive, one delete.
 *
 * Why: the settings screen, its history list and its conflict banner must all describe the
 *   same server state. One query key holds the snapshot (settings, versions, company
 *   inheritance); a successful save or a 409 refetches it, so the screen always compares the
 *   user's draft with what the server holds now. Archiving also refreshes the project list
 *   so the switcher moves the project between open and Archived; deleting does the same.
 *
 * Exports: useProjectSettings(), useSaveSettings(), useArchiveProject(), useUnarchiveProject(), useDeleteProject(), settingsKey().
 * Depends on: @tanstack/react-query, api/api-provider, api/describe-error, api/use-projects,
 *   state/notify, types/*.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from '#/api/describe-error.js';
import { useForgeApi } from '#/api/api-provider.js';
import { PROJECTS_KEY } from '#/api/use-projects.js';
import { useNotify } from '#/state/notify/notify-context.js';
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

/**
 * Unarchives the project; success refreshes the project list so it moves back to the open
 * section and says so in a notification. The notifications live here, not in the caller's
 * `mutate` callbacks, because the switcher's menu closes (and unmounts) on select, which
 * would drop per-call callbacks. `errorToast` is for callers with no inline place for the
 * refusal (the menu); the banner and the settings section show it themselves.
 */
export function useUnarchiveProject(
  slug: string,
  options: { errorToast?: boolean } = {},
) {
  const api = useForgeApi();
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: () => api.projectSettings.unarchive(slug),
    onSuccess: () => {
      notify.success('Project unarchived', { description: slug });

      return queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
    onError: (error) => {
      if (options.errorToast) {
        notify.error(`Could not unarchive ${slug}`, {
          description: describeError(error).detail,
        });
      }
    },
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
