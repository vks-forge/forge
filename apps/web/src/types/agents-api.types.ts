/**
 * The agents resource of the ForgeApi port.
 *
 * Why: agents are read and written from two screens (Forge settings and a project's settings)
 *   over three kinds of write (a company agent, a project's own agent, a project's override of
 *   a company one). Naming the calls once, by scope, lets the http adapter, the hooks and the
 *   tests agree on them and keeps every path in the adapter. Every write names the scope
 *   version the editor saw and a reason; a stale version is refused with 409 `version_conflict`
 *   and an error keeps the server's `code` so the screen can say why in words.
 *
 * Exports: AgentsApi, SaveBody, WriteMeta, UpdateRequest, DuplicateRequest, DraftRequest,
 *   TestRequest.
 * Depends on: schemas/agents, types/agent-ui.types, types/api.types (types only).
 */

import type {
  AgentFields,
  AgentHistoryEntry,
  AgentTemplate,
  AgentTestResult,
  DraftAgentOutput,
  RunsOn,
  RunsOnHarness,
} from '#/schemas/agents.js';
import type {
  AgentAction,
  AgentList,
  AgentScope,
  AgentWriteResult,
} from '#/types/agent-ui.types.js';
import type { RequestOptions } from '#/types/api.types.js';

/** What every write carries: the scope version the editor saw, and why. */
export interface WriteMeta {
  readonly expected_version: number;
  readonly reason: string;
}

export interface SaveBody extends WriteMeta {
  readonly agent: AgentFields;
  readonly origin: string;
}

/** Saving an agent, or (project screens only) a project's override of a company agent. */
export type UpdateRequest =
  | (WriteMeta & { readonly kind: 'agent'; readonly agent: AgentFields })
  | (WriteMeta & {
      readonly kind: 'override';
      readonly override: { readonly instructions?: string; readonly runs_on?: RunsOn };
    });

export interface DuplicateRequest extends WriteMeta {
  readonly name: string;
  /** Where the copy goes; its `expected_version` is that scope's. */
  readonly target: AgentScope;
}

export interface DraftRequest {
  readonly description: string;
  readonly scope: AgentScope;
}

export interface TestRequest {
  readonly agent: AgentFields;
  readonly project?: string;
}

export interface AgentsApi {
  list(scope: AgentScope, options?: RequestOptions): Promise<AgentList>;
  create(scope: AgentScope, body: SaveBody): Promise<AgentWriteResult>;
  update(scope: AgentScope, id: string, body: UpdateRequest): Promise<AgentWriteResult>;
  act(
    scope: AgentScope,
    id: string,
    action: AgentAction,
    meta: WriteMeta,
  ): Promise<AgentWriteResult>;
  duplicate(
    source: AgentScope,
    id: string,
    body: DuplicateRequest,
  ): Promise<AgentWriteResult>;
  history(
    scope: AgentScope,
    id: string,
    options?: RequestOptions,
  ): Promise<readonly AgentHistoryEntry[]>;
  templates(options?: RequestOptions): Promise<readonly AgentTemplate[]>;
  runsOn(options?: RequestOptions): Promise<readonly RunsOnHarness[]>;
  /** The tool ids and risk classes an agent may be given. */
  tools(options?: RequestOptions): Promise<readonly { id: string; risk: string }[]>;
  draft(body: DraftRequest, options?: RequestOptions): Promise<DraftAgentOutput>;
  test(body: TestRequest): Promise<AgentTestResult>;
}
