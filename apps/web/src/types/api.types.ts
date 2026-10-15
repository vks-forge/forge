/**
 * The ForgeApi port: what the screens can ask the Forge server, independent of where answers
 * come from.
 *
 * Why: some endpoints exist today and some are still being built on the server (build plan
 *   W3b to W8). Screens are written once against this port; each resource is served by the
 *   `http` adapter (the real server) or the `mock` adapter (typed fixtures) as chosen in
 *   one table, and moves to `http` the day its endpoint lands, with no screen edit.
 *
 * Exports: TicketsApi, InteractionsApi, RunEventsApi, IntakeApi, TicketListParams, ChatIntake,
 *   ForgeApi, ForgeApiAdapter, ResourceApis, ProjectsApi, ResourceName, AdapterKind,
 *   AdapterTable, RequestOptions, HttpClientOptions, MockScenario, MockOptions, ComposeOptions,
 *   JsonRequest, ApiContextValue, ApiErrorKind.
 * Depends on: @forge/core, schemas/projects, schemas/tickets, types/sse.types (types only).
 */

import type { TicketListPage, TicketStatus } from '@forge/core';
import type { ProjectView } from '#/schemas/projects.js';
import type { GithubApi, HarnessesApi, SettingsApi } from '#/types/settings-api.types.js';
import type { MemoryApi } from '#/types/memory.types.js';
import type { ProjectSettingsApi } from '#/types/project-settings.types.js';
import type { AnswerReply, IngestReply, TicketDetail } from '#/schemas/tickets.js';
import type { RunEventWatch, RunEventWatchOptions } from '#/types/sse.types.js';

/** Per-call options every method accepts so TanStack Query can cancel in-flight work. */
export interface RequestOptions {
  readonly signal?: AbortSignal;
}

export interface ProjectsApi {
  /** Every project the server knows, archived ones included; callers filter. */
  list(options?: RequestOptions): Promise<readonly ProjectView[]>;
}

export interface TicketListParams {
  readonly slug: string;
  /** Only these states; all when absent. */
  readonly state?: readonly TicketStatus[];
  /** Opaque cursor from the previous page. */
  readonly cursor?: string;
  readonly limit?: number;
}

export interface TicketsApi {
  /** One page of a project's tickets, newest change first. */
  list(params: TicketListParams, options?: RequestOptions): Promise<TicketListPage>;
  /** One ticket with its runs, gate results and pending questions. */
  get(id: string, options?: RequestOptions): Promise<TicketDetail>;
}

export interface InteractionsApi {
  /** Answers a pending question once; a second answer is refused with 409. */
  answer(id: string, answer: unknown, options?: RequestOptions): Promise<AnswerReply>;
}

export interface RunEventsApi {
  /** Follows one run's events live; see `watchRunEvents()`. */
  watch(options: Omit<RunEventWatchOptions, 'baseUrl'>): RunEventWatch;
}

export interface ChatIntake {
  /** The project's id (not its slug): intake is keyed by id. */
  readonly projectId: string;
  readonly text: string;
  /** Same key on a retry, so a double click never files two tickets. */
  readonly dedupeKey: string;
}

export interface IntakeApi {
  /** Hands the Director a chat request; it becomes a ticket on the next tick. */
  chat(input: ChatIntake, options?: RequestOptions): Promise<IngestReply>;
}

/** One entry per resource the UI reads. Add a resource here first, then to the adapters and the table. */
export interface ResourceApis {
  readonly projects: ProjectsApi;
  readonly harnesses: HarnessesApi;
  readonly github: GithubApi;
  readonly settings: SettingsApi;
  readonly projectSettings: ProjectSettingsApi;
  readonly memory: MemoryApi;
  readonly tickets: TicketsApi;
  readonly interactions: InteractionsApi;
  readonly runEvents: RunEventsApi;
  readonly intake: IntakeApi;
}

export type ResourceName = keyof ResourceApis;

/** The complete API a screen sees. */
export type ForgeApi = Readonly<ResourceApis>;

/** What one adapter can serve; it need not cover every resource. */
export type ForgeApiAdapter = Partial<ResourceApis>;

export type AdapterKind = 'http' | 'mock';

/** Which adapter serves each resource. */
export type AdapterTable = Readonly<Record<ResourceName, AdapterKind>>;

/** How the http adapter reaches the server; `fetch` is injectable for tests. */
export interface HttpClientOptions {
  /** Path prefix of the proxy or server, such as `/api`; no trailing slash. */
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
}

/** What the mock adapter pretends the server holds. */
export type MockScenario = 'ok' | 'empty' | 'error';

export interface MockOptions {
  readonly scenario?: MockScenario;
  /** Inclusive latency range in ms; `[0, 0]` makes tests instant. */
  readonly latencyMs?: readonly [number, number];
  /** Injectable for deterministic tests. */
  readonly random?: () => number;
}

/** Inputs of `composeApi()`; all come from dev/test build flags, none from the user. */
export interface ComposeOptions {
  /** `'mock'` forces every resource to fixtures; anything else keeps the table. */
  readonly forceApi?: string | undefined;
  readonly mockScenario?: string | undefined;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly latencyMs?: readonly [number, number];
}

/** One JSON call to the server. */
export interface JsonRequest extends RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  readonly body?: unknown;
}

export interface ApiContextValue {
  readonly api: ForgeApi;
  readonly usesFixtures: boolean;
}

/** `network`: no answer; `http`: the server said no; `payload`: the answer did not match its schema. */
export type ApiErrorKind = 'network' | 'http' | 'payload';
