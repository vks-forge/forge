/**
 * What Forge detects in a project's folder, as TanStack Query: one read, one "Detect again".
 *
 * Why: the "Before each ticket" editor must show the steps Forge would run when the settings say
 *   nothing, and the Project tab must list the ecosystems Forge found; both answer from the
 *   project's folder as it is now. A project registered before ecosystems were recorded, or one
 *   whose lockfile was added later, needs a way to look again, so the refresh both stores the
 *   ecosystems on the project row (the project list is refreshed to match) and replaces the cached
 *   answer, and a failure leaves the old answer on screen with its reason.
 *
 * Exports: useDetected(), useRefreshDetected(), detectedKey().
 * Depends on: @tanstack/react-query, api/api-provider, api/use-projects.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { PROJECTS_KEY } from '#/api/use-projects.js';
import type { DetectedReply } from '#/schemas/project-settings.js';

export const detectedKey = (slug: string) => ['project-detected', slug] as const;

export function useDetected(slug: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: detectedKey(slug),
    queryFn: ({ signal }) => api.projectSettings.detected(slug, { signal }),
  });
}

/** Detects again and records the ecosystems; success replaces the cached answer and refreshes the project list. */
export function useRefreshDetected(slug: string) {
  const api = useForgeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.projectSettings.refreshDetected(slug),
    onSuccess: (reply: DetectedReply) => {
      queryClient.setQueryData(detectedKey(slug), reply);

      return queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });
}
