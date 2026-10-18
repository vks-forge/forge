/**
 * What the route handlers are given.
 *
 * Why: routes hold no logic of their own beyond parsing a request and calling the engine or
 *   storage (apps are composition only, code.md rule 1). Handing them one dependency bag,
 *   built once by the assembly, keeps them testable with a fake engine and keeps them from
 *   reaching for globals such as the clock or the process.
 *
 * Exports: RouteDeps.
 * Depends on: @forge/core (StorageAdapter, SecretStore), types/agent-store, types/research, @forge/drivers (types), @forge/engine (Engine),
 *   @forge/hooks (HookHandler), types/auth, types/settings. Types only.
 */

import type {
  ConfigSource,
  DataHomeLayout,
  MemoryIndex,
  ProjectMemory,
  SecretStore,
  StorageAdapter,
} from '@forge/core';
import type { HarnessSetup, HarnessTestResult } from '@forge/drivers';
import type { Engine } from '@forge/engine';
import type { HookHandler } from '@forge/hooks';
import type { CatalogueStore } from '@forge/tools';
import type { AgentPorts } from '#/types/agent-store.types.js';
import type { SessionStore, SseTicketIssuer, TokenProver } from '#/types/auth.types.js';
import type { FolderPicker, FolderRevealer } from '#/types/folder-picker.types.js';
import type { HarnessCompat } from '#/types/harness-compat.types.js';
import type { MemoryAdmin } from '#/types/memory-admin.types.js';
import type { ProjectEvents } from '#/types/project-events.types.js';
import type { ProjectRegistry } from '#/types/project-registry.types.js';
import type { ResearchRoutePort } from '#/types/research.types.js';
import type { HttpTuning } from '#/types/settings.types.js';
import type { TriggerRegistry } from '#/types/trigger.types.js';

export interface RouteDeps {
  readonly engine: Engine;
  readonly storage: StorageAdapter;
  /** Versioned settings behind `/settings/*`. */
  readonly config: ConfigSource;
  /** Versioned tool catalogue behind `/settings/catalogue`. */
  readonly catalogue: CatalogueStore;
  /** Tests a research provider and refreshes the live one after a save (`POST /settings/research/test`); absent (route tests) that answers 503 `not_available`. */
  readonly research?: ResearchRoutePort | undefined;
  /** Harness build checks and tool approvals behind `/harnesses/:id/compat` and `/tools`. */
  readonly compat: HarnessCompat;
  /** The drivers and the Director model behind `/agents/runs-on`, `/agents/test` and `/agents/draft`; absent (route tests) those answer 503 `not_available`. */
  readonly agentPorts?: AgentPorts | undefined;
  /** Projects being served; the projects API adds to it and archives from it. */
  readonly projects: ProjectRegistry;
  /** Each project's memory repository: the memory API reads it and applies approvals and rejections. */
  readonly memory: ProjectMemory;
  /** Search, records with provenance, related records and history for the memory API; absent (route tests) those answer 503 `not_available`. */
  readonly memoryIndex?: MemoryIndex | undefined;
  /** Import status and retry, markdown export and the access log; absent (route tests) those answer 503 `not_available`. */
  readonly memoryAdmin?: MemoryAdmin | undefined;
  /** The ticket sources `POST /intake` accepts events from. */
  readonly triggers: TriggerRegistry;
  readonly hooks: HookHandler;
  /** Holds harness API keys and OAuth tokens (`PUT /harnesses/:id/secret`) and GitHub App keys (`github/<connection>/key`); values are never read back out. */
  readonly secrets: SecretStore;
  /** Runs the harness environment test; `live` allows the one paid hello call. */
  readonly harnessTest: (
    setup: HarnessSetup,
    live: boolean,
  ) => Promise<HarnessTestResult>;
  /** Where writes announce stale queries and the project streams listen (`GET /projects/:slug/events`). */
  readonly projectEvents: ProjectEvents;
  /** Mints the short-lived tickets that let `EventSource` open a run's or a project's event stream. */
  readonly tickets: SseTicketIssuer;
  /** Browser sessions and the one-time codes that start them (`/auth/open-code`, `/auth/open`). */
  readonly sessions: SessionStore;
  /** Answers a caller's challenge to show this server knows the install token (`POST /auth/proof`). */
  readonly prover: TokenProver;
  /** True once graceful shutdown began; new Worker messages are refused then (`server_draining`). Absent reads as never draining (route tests). */
  readonly isDraining?: () => boolean;
  /** Opens the system folder window behind `POST /fs/pick-folder`; absent (route tests) reads as unavailable. */
  readonly folderPicker?: FolderPicker;
  /** Shows a folder in the file manager behind `POST /fs/reveal`; absent (route tests) reads as unavailable. */
  readonly folderRevealer?: FolderRevealer;
  /** Starts the graceful shutdown (`POST /admin/shutdown`); returns at once. */
  readonly requestShutdown: () => void;
  /** Where Forge keeps its own files; a project clone may not be inside them. */
  readonly dataHome: Pick<DataHomeLayout, 'home' | 'memoryDir' | 'worktreesDir'>;
  readonly owner: string;
  /** Epoch ms when the server started, for `/health` uptime. */
  readonly startedAt: number;
  readonly now: () => number;
  readonly http: HttpTuning;
  /** Aborted at shutdown so open event streams end and the port can close. */
  readonly shutdown: AbortSignal;
}
