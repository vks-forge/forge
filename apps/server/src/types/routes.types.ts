/**
 * What the route handlers are given.
 *
 * Why: routes hold no logic of their own beyond parsing a request and calling the engine or
 *   storage (apps are composition only, code.md rule 1). Handing them one dependency bag,
 *   built once by the assembly, keeps them testable with a fake engine and keeps them from
 *   reaching for globals such as the clock or the process.
 *
 * Exports: RouteDeps.
 * Depends on: @forge/core (StorageAdapter, SecretStore), @forge/drivers (types), @forge/engine (Engine),
 *   @forge/hooks (HookHandler), types/auth, types/settings. Types only.
 */

import type {
  ConfigSource,
  ProjectMemory,
  SecretStore,
  StorageAdapter,
} from '@forge/core';
import type { HarnessSetup, HarnessTestResult } from '@forge/drivers';
import type { Engine } from '@forge/engine';
import type { HookHandler } from '@forge/hooks';
import type { CatalogueStore } from '@forge/tools';
import type { SseTicketIssuer } from '#/types/auth.types.js';
import type { HarnessCompat } from '#/types/harness-compat.types.js';
import type { ProjectRegistry } from '#/types/project-registry.types.js';
import type { HttpTuning } from '#/types/settings.types.js';
import type { TriggerRegistry } from '#/types/trigger.types.js';

export interface RouteDeps {
  readonly engine: Engine;
  readonly storage: StorageAdapter;
  /** Versioned settings behind `/settings/*`. */
  readonly config: ConfigSource;
  /** Versioned tool catalogue behind `/settings/catalogue`. */
  readonly catalogue: CatalogueStore;
  /** Harness build checks and tool approvals behind `/harnesses/:id/compat` and `/tools`. */
  readonly compat: HarnessCompat;
  /** Projects being served; the projects API adds to it and archives from it. */
  readonly projects: ProjectRegistry;
  /** Each project's memory repository: the memory API reads it and applies approvals and rejections. */
  readonly memory: ProjectMemory;
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
  /** Mints the short-lived tickets that let `EventSource` open a run's event stream. */
  readonly tickets: SseTicketIssuer;
  /** Starts the graceful shutdown (`POST /admin/shutdown`); returns at once. */
  readonly requestShutdown: () => void;
  readonly owner: string;
  /** Epoch ms when the server started, for `/health` uptime. */
  readonly startedAt: number;
  readonly now: () => number;
  readonly http: HttpTuning;
  /** Aborted at shutdown so open event streams end and the port can close. */
  readonly shutdown: AbortSignal;
}
