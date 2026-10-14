/**
 * What the route handlers are given.
 *
 * Why: routes hold no logic of their own beyond parsing a request and calling the engine or
 *   storage (apps are composition only, code.md rule 1). Handing them one dependency bag,
 *   built once by the assembly, keeps them testable with a fake engine and keeps them from
 *   reaching for globals such as the clock or the process.
 *
 * Exports: RouteDeps.
 * Depends on: @forge/core (StorageAdapter), @forge/engine (Engine), @forge/hooks (HookHandler),
 *   types/settings. Types only.
 */

import type { StorageAdapter } from '@forge/core';
import type { Engine } from '@forge/engine';
import type { HookHandler } from '@forge/hooks';
import type { HttpTuning } from '#/types/settings.types.js';

export interface RouteDeps {
  readonly engine: Engine;
  readonly storage: StorageAdapter;
  readonly hooks: HookHandler;
  readonly owner: string;
  /** Epoch ms when the server started, for `/health` uptime. */
  readonly startedAt: number;
  readonly now: () => number;
  readonly http: HttpTuning;
  /** Aborted at shutdown so open event streams end and the port can close. */
  readonly shutdown: AbortSignal;
}
