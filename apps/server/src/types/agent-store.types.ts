/**
 * Types for the agent services: the store, readiness and the ports the draft and test need.
 *
 * Why: the agent routes are thin and the logic lives in four services (store, readiness, test,
 *   draft). Their shared shapes (a scope, a listing with its version, the readiness lookup the
 *   store asks, the ports the app hands in) are named once so the routes and the services agree,
 *   and so a route test can hand the services fakes.
 *
 * Exports: PipelineUse, AgentScope, AgentListing, ScopeState, AgentWriteMeta, AgentState, AgentReadiness, AgentPorts,
 *   AgentStore, AgentDeps, AddAgent, AgentServices.
 * Depends on: @forge/core, @forge/tools (CatalogueStore), schemas/agent-api. Types only.
 */

import type {
  AgentDefinition,
  AgentHistoryEntry,
  AgentInput,
  AgentTestResult,
  AgentView,
  CompanyOverride,
  ConfigSource,
  ForgeConfig,
  Lane,
  ProjectAgents,
  ProjectOverride,
  DirectorLLM,
  DraftAgentOutput,
  DriverRegistry,
  ReadinessLookup,
  RunsOnHarness,
  StorageAdapter,
} from '@forge/core';
import type { CatalogueStore } from '@forge/tools';
import type {
  AgentActionBody,
  AgentCreateBody,
  AgentDraftBody,
  AgentDuplicateBody,
  AgentOverride,
  AgentSaveBody,
  AgentTestBody,
} from '#/schemas/agent-api.js';
import type { HarnessCompat } from '#/types/harness-compat.types.js';

/** The scope an agent list or write is about. */
export type AgentScope =
  { readonly scope: 'company' } | { readonly scope: 'project'; readonly slug: string };

/** An agent list with the version of its scope (company: one number; project: both counters). */
export interface AgentListing {
  readonly agents: AgentView[];
  readonly version: number | { readonly company: number; readonly project: number };
}

/** One scope read once: the roster, the stored document and the facts a write needs to judge it. */
export interface ScopeState {
  readonly scope: AgentScope;
  readonly views: AgentView[];
  readonly listing: AgentListing;
  /** This scope's own latest version (the one `expected_version` is compared with). */
  readonly own: number;
  /** The latest stored document of this scope. */
  readonly doc: CompanyOverride | ProjectOverride;
  readonly company: Readonly<Record<string, AgentDefinition>>;
  readonly project: ProjectAgents | undefined;
  readonly forge: ForgeConfig;
}

/** What a write carries besides the document: the version the editor saw and why. */
export interface AgentWriteMeta {
  readonly expected_version: number;
  readonly reason: string;
}

/** Reads a scope and writes its next version; the only code that appends agent config. */
export interface AgentState {
  read(scope: AgentScope): Promise<ScopeState>;
  /** 409 `version_conflict` before any work when the editor saw an older version. */
  assertFresh(state: ScopeState, meta: AgentWriteMeta): void;
  /** Validates the merged result, appends it as the next version and reads the scope back. */
  commit(
    state: ScopeState,
    doc: CompanyOverride | ProjectOverride,
    meta: AgentWriteMeta,
  ): Promise<ScopeState>;
}

/** What the app hands the agent routes beyond the settings: the drivers (models, probes) and the Director model. */
export interface AgentPorts {
  readonly drivers: DriverRegistry;
  readonly llm: DirectorLLM;
}

/** Facts about the harnesses an agent can name, and the lookup the roster builder asks. */
export interface AgentReadiness {
  /** Every configured harness, ready or not. */
  harnesses(): Promise<RunsOnHarness[]>;
  /** Readiness of a `runs_on`, with `project_default` resolved to `projectDefault`. */
  lookup(projectDefault: string): Promise<ReadinessLookup>;
}

export interface AgentDeps {
  readonly config: ConfigSource;
  readonly storage: StorageAdapter;
  readonly catalogue: CatalogueStore;
  readonly compat: Pick<HarnessCompat, 'installedVersion'>;
  readonly now: () => number;
  readonly ports?: AgentPorts | undefined;
}

/** Every agent read and write; each write is one `ConfigSource.append` (the one door for agent config). */
export interface AgentStore {
  list(scope: AgentScope): Promise<AgentListing>;
  create(
    scope: AgentScope,
    body: AgentCreateBody,
  ): Promise<AgentListing & { id: string }>;
  save(scope: AgentScope, id: string, body: AgentSaveBody): Promise<AgentListing>;
  saveOverride(
    slug: string,
    id: string,
    override: AgentOverride,
    body: AgentActionBody,
  ): Promise<AgentListing>;
  reset(id: string, body: AgentActionBody): Promise<AgentListing>;
  resetOverride(slug: string, id: string, body: AgentActionBody): Promise<AgentListing>;
  archive(
    scope: AgentScope,
    id: string,
    archived: boolean,
    body: AgentActionBody,
  ): Promise<AgentListing>;
  disable(
    slug: string,
    id: string,
    disabled: boolean,
    body: AgentActionBody,
  ): Promise<AgentListing>;
  duplicate(
    from: AgentScope,
    id: string,
    body: AgentDuplicateBody,
  ): Promise<AgentListing & { id: string }>;
  history(scope: AgentScope, id: string): Promise<AgentHistoryEntry[]>;
  /** The tool ids of the current catalogue; the draft and the editor offer these. */
  toolIds(): Promise<string[]>;
}

/** Adds `def` to `scope` as a new agent; supplied by the store so a copy takes the same path as a create. */
export type AddAgent = (
  scope: AgentScope,
  meta: AgentWriteMeta,
  def: AgentInput,
  origin: `duplicate:${string}`,
) => Promise<{ id: string; at: ScopeState }>;

/** The agent services of one server, built once and shared by the company and project routes. */
export interface AgentServices {
  readonly store: AgentStore;
  readonly readiness: AgentReadiness;
  readonly test: (body: AgentTestBody) => Promise<AgentTestResult>;
  readonly draft: (body: AgentDraftBody) => Promise<DraftAgentOutput>;
}

/** What names an agent: the lanes whose pipeline has a stage for it and the routing rules that add it. */
export interface PipelineUse {
  readonly lanes: Lane[];
  readonly rules: string[];
}
