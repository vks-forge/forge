/**
 * TanStack Query hooks for agents: the lists, the helper reads, every write, the draft and the test.
 *
 * Why: the company screen and each project's screen show the same agents through two lists,
 *   and a write to either bumps a version counter shared with that scope's settings (a company
 *   agent change is a new company settings version, a project one a new project settings
 *   version). One key per scope means one request and one cache, and every write does three
 *   things: it puts the server's fresh list straight into the cache (the answer is
 *   authoritative, so tags and hashes are never re-derived), it invalidates the settings
 *   query that shares the counter so the Limits, Director and project pages do not hold a
 *   stale version, and on a company change it also refreshes every project list (a project
 *   shows the company agents under its overrides). The compat run on the harness page
 *   invalidates the `runs-on` key through `RUNS_ON_KEY`.
 *
 * Exports: agentsKey(), agentHistoryKey(), AGENT_TEMPLATES_KEY, RUNS_ON_KEY, AGENT_TOOLS_KEY,
 *   useAgents(), useAgentHistory(), useAgentTemplates(), useRunsOn(), useAgentTools(),
 *   useCreateAgent(), useUpdateAgent(), useAgentAction(), useDuplicateAgent(),
 *   useDraftAgent(), useTestAgent().
 * Depends on: @tanstack/react-query, api/api-provider, api/use-project-settings,
 *   api/use-settings-data, types/agents-api.types, types/agent-ui.types.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { settingsKey } from '#/api/use-project-settings.js';
import { COMPANY_KEY } from '#/api/use-settings-data.js';
import type {
  AgentAction,
  AgentScope,
  AgentWriteResult,
} from '#/types/agent-ui.types.js';
import type {
  DraftRequest,
  DuplicateRequest,
  SaveBody,
  TestRequest,
  UpdateRequest,
  WriteMeta,
} from '#/types/agents-api.types.js';

export const agentsKey = (scope: AgentScope) =>
  scope.kind === 'company'
    ? (['agents', 'company'] as const)
    : (['agents', 'project', scope.slug] as const);

export const agentHistoryKey = (scope: AgentScope, id: string) =>
  ['agents', 'history', scope.kind === 'company' ? 'company' : scope.slug, id] as const;

export const AGENT_TEMPLATES_KEY = ['agents', 'templates'] as const;
export const RUNS_ON_KEY = ['agents', 'runs-on'] as const;
export const AGENT_TOOLS_KEY = ['agents', 'tools'] as const;

export function useAgents(scope: AgentScope) {
  const api = useForgeApi();

  return useQuery({
    queryKey: agentsKey(scope),
    queryFn: ({ signal }) => api.agents.list(scope, { signal }),
  });
}

export function useAgentHistory(scope: AgentScope, id: string, enabled: boolean) {
  const api = useForgeApi();

  return useQuery({
    queryKey: agentHistoryKey(scope, id),
    queryFn: ({ signal }) => api.agents.history(scope, id, { signal }),
    enabled,
  });
}

export function useAgentTemplates(enabled: boolean) {
  const api = useForgeApi();

  return useQuery({
    queryKey: AGENT_TEMPLATES_KEY,
    queryFn: ({ signal }) => api.agents.templates({ signal }),
    enabled,
  });
}

export function useRunsOn() {
  const api = useForgeApi();

  return useQuery({
    queryKey: RUNS_ON_KEY,
    queryFn: ({ signal }) => api.agents.runsOn({ signal }),
  });
}

export function useAgentTools() {
  const api = useForgeApi();

  return useQuery({
    queryKey: AGENT_TOOLS_KEY,
    queryFn: ({ signal }) => api.agents.tools({ signal }),
    staleTime: 60_000,
  });
}

/** What a write changed: the scope's own settings version counter, and the lists that read it. */
function refresh(client: QueryClient, scope: AgentScope): Promise<unknown> {
  const own =
    scope.kind === 'company'
      ? client.invalidateQueries({ queryKey: COMPANY_KEY })
      : client.invalidateQueries({ queryKey: settingsKey(scope.slug) });

  const lists = [
    client.invalidateQueries({ queryKey: agentsKey(scope) }),
    ...(scope.kind === 'company'
      ? [client.invalidateQueries({ queryKey: ['agents', 'project'] })]
      : []),
    client.invalidateQueries({ queryKey: ['agents', 'history'] }),
  ];

  return Promise.all([own, ...lists]);
}

/** One write: the answer replaces the cache of the scope it wrote, then the version readers refresh. */
function useWrite<V>(
  source: AgentScope,
  run: (variables: V) => Promise<AgentWriteResult>,
  target: (variables: V) => AgentScope = () => source,
) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: run,
    onSuccess: (result, variables) => {
      client.setQueryData(agentsKey(target(variables)), {
        agents: result.agents,
        version: result.version,
        companyVersion: result.companyVersion,
      });
    },
    onSettled: (_result, _error, variables) =>
      Promise.all([refresh(client, source), refresh(client, target(variables))]),
  });
}

export function useCreateAgent(scope: AgentScope) {
  const api = useForgeApi();

  return useWrite(scope, (body: SaveBody) => api.agents.create(scope, body));
}

export function useUpdateAgent(scope: AgentScope) {
  const api = useForgeApi();

  return useWrite(scope, (v: { id: string; body: UpdateRequest }) =>
    api.agents.update(scope, v.id, v.body),
  );
}

export function useAgentAction(scope: AgentScope) {
  const api = useForgeApi();

  return useWrite(scope, (v: { id: string; action: AgentAction; meta: WriteMeta }) =>
    api.agents.act(scope, v.id, v.action, v.meta),
  );
}

/** A copy can land in another scope; that scope's list is the one the answer belongs to. */
export function useDuplicateAgent(scope: AgentScope) {
  const api = useForgeApi();

  return useWrite(
    scope,
    (v: { id: string; body: DuplicateRequest }) =>
      api.agents.duplicate(scope, v.id, v.body),
    (v) => v.body.target,
  );
}

/** Asks the Director for a draft. Nothing is saved; `signal` lets the owner cancel. */
export function useDraftAgent() {
  const api = useForgeApi();

  return useMutation({
    mutationFn: (v: { body: DraftRequest; signal?: AbortSignal }) =>
      api.agents.draft(v.body, v.signal ? { signal: v.signal } : {}),
  });
}

/** One short model call on the agent as typed; the answer is not stored. */
export function useTestAgent() {
  const api = useForgeApi();

  return useMutation({ mutationFn: (body: TestRequest) => api.agents.test(body) });
}
