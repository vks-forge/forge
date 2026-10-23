/**
 * A started HTTP rig over the real engine, tracked in-memory storage and the project events hub.
 *
 * Why: the card-flow routes only mean something end to end: the create route must reach the
 *   engine's door, the write must announce itself on the project stream, and the stream must
 *   take a project ticket and refuse a run one. The older card rig stubs the engine, which is
 *   right for read routes but would hide a broken link between the route, the engine, the
 *   tracked storage and the hub. This rig wires the real ones (the engine's other ports are
 *   inert: creating a card and editing its edges touch only storage, the clock and the tick
 *   request) and a ticket issuer on a movable clock.
 *
 * Exports: startFlowRig(), FlowRig.
 * Depends on: src/routes/routes, src/services/{project-events,tracked-storage,auth}, @forge/engine,
 *   @forge/db, helpers/http-rig. IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { Project, StorageAdapter } from '@forge/core';
import { createEngine } from '@forge/engine';
import type { Engine, EngineDeps } from '@forge/engine';
import { vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { createAuthGuard } from '#/services/auth/guard.js';
import { createSseTicketIssuer } from '#/services/auth/sse-tickets.js';
import { createProjectEvents } from '#/services/project-events.js';
import { trackProjectWrites } from '#/services/tracked-storage.js';
import type { ProjectEvents } from '#/types/project-events.types.js';
import type { RouteDeps } from '#/types/routes.types.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { TEST_INSTALL_TOKEN } from '#tests/helpers/install-token.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';

export interface FlowRig {
  readonly rig: HttpRig;
  readonly storage: StorageAdapter;
  readonly events: ProjectEvents;
  readonly engine: Engine;
  /** The fake clock the ticket issuer and the engine read; move it to expire tickets. */
  readonly clock: { now: number };
  /** Times the engine asked for a tick. */
  readonly tickRequests: { count: number };
  close(): Promise<void>;
}

const project = (slug: string, prefix: string): Project => ({
  id: slug,
  slug,
  prefix,
  status: 'ready',
  ecosystems: [],
  harness_defaults: {},
  tier_c_globs: [],
});

/** Starts the real card routes over projects `fixture` (FX) and `other` (OT). */
export async function startFlowRig(
  routeOverrides: Partial<RouteDeps> = {},
): Promise<FlowRig> {
  const clock = { now: Date.parse('2026-10-16T12:00:00.000Z') };
  const events = createProjectEvents();
  const storage = trackProjectWrites(createMemoryStorage(), events);
  await storage.transaction(async (tx) => {
    await tx.projects.upsert(project('fixture', 'FX'));
    await tx.projects.upsert(project('other', 'OT'));
  });

  const tickRequests = { count: 0 };
  const engine = createEngine({
    storage,
    clock: { now: () => clock.now },
    onTickRequested: () => {
      tickRequests.count += 1;
    },
    projectEvents: events,
  } as unknown as EngineDeps);

  const tickets = createSseTicketIssuer(() => clock.now);
  const rig = await startHttp(
    buildRoutes({
      ...stubHarnessDeps(),
      // The bare engine above has no settings or drivers to plan a dispatch with, so the routes see no wait lines.
      engine: { ...engine, explainWaits: async () => new Map() },
      storage,
      config: createMemoryConfigSource(),
      ...inertRouteExtras(),
      projectEvents: events,
      tickets,
      hooks: { handle: vi.fn() },
      owner: 'srv-test',
      startedAt: 0,
      now: () => clock.now,
      http: { ssePollMs: 5, sseHeartbeatMs: 1000, projectHeartbeatMs: 30 },
      shutdown: new AbortController().signal,
      ...routeOverrides,
    }),
    createAuthGuard(TEST_INSTALL_TOKEN, tickets),
  );

  return { rig, storage, events, engine, clock, tickRequests, close: () => rig.close() };
}
