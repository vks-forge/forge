/**
 * TanStack Query hooks for first run and new project.
 *
 * Why: `/` decides from `GET /system` whether to open the wizard, the wizard's first step
 *   shows the data folder from the same answer, and creating a project changes both the
 *   project list and whether setup is finished. One key for the system answer means one
 *   request and one place to refresh after a project is created. Inspect and create are
 *   mutations held in component state, not cached, because they are the user's explicit
 *   actions on a typed folder.
 *
 * Exports: SYSTEM_KEY, useSystem(), useInspectFolder(), useCreateProject().
 * Depends on: @tanstack/react-query, api/api-provider, api/use-projects, types/onboarding.types.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { PROJECTS_KEY } from '#/api/use-projects.js';
import type { ProjectCreateRequest } from '#/types/onboarding.types.js';

export const SYSTEM_KEY = ['system'] as const;

export function useSystem() {
  const api = useForgeApi();

  return useQuery({
    queryKey: SYSTEM_KEY,
    queryFn: ({ signal }) => api.onboarding.system({ signal }),
  });
}

export function useInspectFolder() {
  const api = useForgeApi();

  return useMutation({
    mutationFn: (body: { local_path: string; base_branch?: string }) =>
      api.onboarding.inspect(body),
  });
}

export function useCreateProject() {
  const api = useForgeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ProjectCreateRequest) => api.onboarding.createProject(body),
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
        queryClient.invalidateQueries({ queryKey: SYSTEM_KEY }),
      ]);
    },
  });
}
