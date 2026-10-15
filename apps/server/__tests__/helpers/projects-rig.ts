/**
 * An HTTP rig with the real projects and connections routes over in-memory storage.
 *
 * Why: the projects API tests need the real route table, the real project registry and a
 *   real git clone to register, but not a whole server (no engine, no harness, no database
 *   file). This builds exactly that, so each test file is about its endpoint.
 *
 * Exports: ProjectsRig, startProjectsRig().
 * Depends on: @forge/db, @forge/secrets, src/routes, src/services/project-registry,
 *   helpers/http-rig. IO: a loopback socket.
 */

import { dirname } from 'node:path';
import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { ConfigSource, StorageAdapter } from '@forge/core';
import type { Engine } from '@forge/engine';
import { createMemorySecretStore } from '@forge/secrets';
import { vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { createProjectRegistry } from '#/services/project-registry.js';
import type { ProjectRegistry } from '#/types/project-registry.types.js';
import type { RouteDeps } from '#/types/routes.types.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';

export interface ProjectsRig {
  readonly rig: HttpRig;
  readonly storage: StorageAdapter;
  readonly config: ConfigSource;
  readonly registry: ProjectRegistry;
  /** What the fake engine reports as skipped for invalid settings (slug to reason). */
  readonly unservable: Map<string, string>;
}

/** Worktrees of the registry's projects would go under `worktreesDir`; nothing is created there. */
export async function startProjectsRig(
  worktreesDir: string,
  memory: RouteDeps['memory'] = inertRouteExtras().memory,
): Promise<ProjectsRig> {
  const storage = createMemoryStorage();
  const unservable = new Map<string, string>();
  const config = createMemoryConfigSource();
  const secrets = createMemorySecretStore();
  const extras = inertRouteExtras();
  const registry = createProjectRegistry({
    storage,
    config,
    secrets,
    worktreesDir,
    gates: () => [],
    now: () => 0,
    log: () => undefined,
  });

  const rig = await startHttp(
    buildRoutes({
      engine: {
        liveRunIds: vi.fn(() => []),
        unservableProjects: () => unservable,
      } as unknown as Engine,
      storage,
      config,
      projects: registry,
      memory,
      ...stubHarnessDeps(),
      catalogue: extras.catalogue,
      compat: extras.compat,
      triggers: extras.triggers,
      tickets: extras.tickets,
      requestShutdown: extras.requestShutdown,
      secrets,
      dataHome: { home: dirname(worktreesDir), worktreesDir },
      hooks: { handle: vi.fn() },
      owner: 'srv-test',
      startedAt: 0,
      now: () => Date.parse('2026-10-14T00:00:00.000Z'),
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );

  return { rig, storage, config, registry, unservable };
}
