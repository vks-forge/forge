/**
 * TanStack Query hooks for lane pipelines: the lists, every write, and the save-time check.
 *
 * Why: Forge settings and each project's settings show the same three lanes through two lists,
 *   and a write to either bumps the version counter shared with that scope's settings (a company
 *   pipeline change is a new company settings version, a project one a new project version). One
 *   key per scope means one request and one cache, and every write does three things: it puts the
 *   server's fresh list straight into the cache (the answer is authoritative, so tags and hashes
 *   are never re-derived), it invalidates the settings query that shares the counter so the
 *   Limits, Director and project pages do not hold a stale version, and a company change also
 *   refreshes every project list (a project inherits the lanes it has not changed). The
 *   validation call writes nothing; it asks the server to judge an unsaved list against the
 *   scope's roster while the owner is still editing.
 *
 * Exports: pipelinesKey(), usePipelines(), useSavePipeline(), useResetPipeline(),
 *   useSaveRouting(), useValidatePipeline().
 * Depends on: @tanstack/react-query, api/api-provider, api/use-project-settings,
 *   api/use-settings-data, types/pipeline-api.types.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { Lane, PipelineDefinition } from '@forge/core';
import { useForgeApi } from '#/api/api-provider.js';
import { settingsKey } from '#/api/use-project-settings.js';
import { COMPANY_KEY } from '#/api/use-settings-data.js';
import type {
  PipelineList,
  PipelineScope,
  PipelineWriteMeta,
  SavePipelineBody,
  SaveRoutingBody,
} from '#/types/pipeline-api.types.js';

export const pipelinesKey = (scope: PipelineScope) =>
  scope.kind === 'company'
    ? (['pipelines', 'company'] as const)
    : (['pipelines', 'project', scope.slug] as const);

export function usePipelines(scope: PipelineScope) {
  const api = useForgeApi();

  return useQuery({
    queryKey: pipelinesKey(scope),
    queryFn: ({ signal }) => api.pipelines.list(scope, { signal }),
  });
}

/** What a write changed: the scope's own settings counter, and the lists that read it. */
function refresh(client: QueryClient, scope: PipelineScope): Promise<unknown> {
  const own =
    scope.kind === 'company'
      ? client.invalidateQueries({ queryKey: COMPANY_KEY })
      : client.invalidateQueries({ queryKey: settingsKey(scope.slug) });

  return Promise.all([
    own,
    client.invalidateQueries({ queryKey: pipelinesKey(scope) }),
    ...(scope.kind === 'company'
      ? [client.invalidateQueries({ queryKey: ['pipelines', 'project'] })]
      : []),
  ]);
}

/** One write: the answer replaces the cache of the scope it wrote, then the version readers refresh. */
function useWrite<V>(scope: PipelineScope, run: (variables: V) => Promise<PipelineList>) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: run,
    onSuccess: (list) => client.setQueryData(pipelinesKey(scope), list),
    onSettled: () => refresh(client, scope),
  });
}

export function useSavePipeline(scope: PipelineScope, lane: Lane) {
  const api = useForgeApi();

  return useWrite(scope, (body: SavePipelineBody) =>
    api.pipelines.save(scope, lane, body),
  );
}

export function useResetPipeline(scope: PipelineScope, lane: Lane) {
  const api = useForgeApi();

  return useWrite(scope, (meta: PipelineWriteMeta) =>
    api.pipelines.reset(scope, lane, meta),
  );
}

export function useSaveRouting(slug: string) {
  const api = useForgeApi();

  return useWrite({ kind: 'project', slug }, (body: SaveRoutingBody) =>
    api.pipelines.saveRouting(slug, body),
  );
}

/**
 * The server's verdict on an unsaved list. Keyed by the list itself, so the answer for the text
 * on screen is cached and an older answer keeps showing until the newer one lands.
 */
export function useValidatePipeline(
  scope: PipelineScope,
  lane: Lane,
  pipeline: PipelineDefinition,
  enabled: boolean,
) {
  const api = useForgeApi();
  const project = scope.kind === 'project' ? scope.slug : undefined;

  return useQuery({
    queryKey: [
      'pipelines-validate',
      scope.kind === 'company' ? 'company' : scope.slug,
      lane,
      JSON.stringify(pipeline),
    ],
    queryFn: ({ signal }) =>
      api.pipelines.validate({ lane, pipeline, project }, { signal }),
    enabled,
    retry: false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
