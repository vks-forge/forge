/**
 * The ForgeApi port: what the screens can ask the Forge server, independent of where answers
 * come from.
 *
 * Why: the app talks only to the real Forge server (d-0123). Screens are written once
 *   against this one interface; the `http` adapter is its only implementation, and the
 *   interface exists so a screen reads the API from context (and a test can hand it a
 *   different one) instead of importing the adapter. Which endpoint a method hits is the
 *   adapter's business, never the screen's.
 *
 * Exports: TicketsApi, InteractionsApi, RunEventsApi, ProjectEventsApi, IntakeApi, TicketListParams, ChatIntake,
 *   ForgeApi, ResourceApis, ProjectsApi, ResourceName, RequestOptions, HttpClientOptions,
 *   JsonRequest, ApiErrorKind.
 * Depends on: @forge/core, schemas/projects, schemas/tickets, types/sse.types (types only).
 */

import type { TicketListPage, TicketStatus } from '@forge/core';
import type { ProjectView } from '#/schemas/projects.js';
import type { GithubApi, HarnessesApi, SettingsApi } from '#/types/settings-api.types.js';
import type { MemoryApi } from '#/types/memory.types.js';
import type { OnboardingApi } from '#/types/onboarding.types.js';
import type { ProjectSettingsApi } from '#/types/project-settings.types.js';
import type { AnswerReply, IngestReply, TicketDetail } from '#/schemas/tickets.js';
import type { CardsApi } from '#/types/cards-api.types.js';
import type { CostApi, InboxApi, RunsApi, StatsApi } from '#/types/work-api.types.js';
import type {
  ProjectEventsWatch,
  ProjectEventsWatchOptions,
  RunEventWatch,
  RunEventWatchOptions,
} from '#/types/sse.types.js';

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

export interface ProjectEventsApi {
  /** Follows one project's change feed live; see `watchProjectEvents()`. */
  watch(options: Omit<ProjectEventsWatchOptions, 'baseUrl'>): ProjectEventsWatch;
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

/** One entry per resource the UI reads. Add a resource here first, then to the http adapter. */
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
  readonly projectEvents: ProjectEventsApi;
  readonly intake: IntakeApi;
  readonly stats: StatsApi;
  readonly cost: CostApi;
  readonly inbox: InboxApi;
  readonly runs: RunsApi;
  readonly onboarding: OnboardingApi;
  readonly cards: CardsApi;
}

export type ResourceName = keyof ResourceApis;

/** The complete API a screen sees. */
export type ForgeApi = Readonly<ResourceApis>;

/** How the http adapter reaches the server; `fetch` is injectable for tests. */
export interface HttpClientOptions {
  /** Path prefix of the proxy or server, such as `/api`; no trailing slash. */
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
}

/** One JSON call to the server. */
export interface JsonRequest extends RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
}

/** `network`: no answer; `http`: the server said no; `payload`: the answer did not match its schema. */
export type ApiErrorKind = 'network' | 'http' | 'payload';
