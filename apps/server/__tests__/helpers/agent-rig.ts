/**
 * Agent API rig: the real routes over in-memory settings, a fake driver and a scripted Director.
 *
 * Why: the agent routes are thin over a store, a readiness service, a tester and a drafter, and
 *   what matters is what a client sees: the status and error code of each refusal, the fresh
 *   list after each write, nothing saved by a draft or a test. This builds the production route
 *   table over in-memory config and storage, one registered project, a driver whose probe a
 *   test can script or hold open, and a Director whose `draft_agent` answer a test can set.
 *
 * Exports: AgentRig, startAgentRig(), agentBody(), WHO.
 * Depends on: @forge/db (memory adapters), @forge/core, helpers/{http-rig,route-extras,harness-deps,scripted-llm},
 *   src/routes/routes, src/services/driver-registry. IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type {
  AgentProbeRequest,
  AgentProbeResult,
  ConfigSource,
  StorageAdapter,
  WorkerDriver,
} from '@forge/core';
import type { Engine } from '@forge/engine';
import { vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { createDriverRegistry } from '#/services/driver-registry.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';
import { createScriptedDirector } from '#tests/helpers/scripted-llm.js';

export const WHO = { reason: 'because the owner said so' };

export interface AgentRig {
  readonly http: HttpRig;
  readonly config: ConfigSource;
  readonly storage: StorageAdapter;
  readonly probes: AgentProbeRequest[];
  /** Replaces what the fake driver's probe returns; a promise-returning function holds a test open. */
  probeWith(fn: (req: AgentProbeRequest) => Promise<AgentProbeResult>): void;
  readonly director: ReturnType<typeof createScriptedDirector>;
  close(): Promise<void>;
}

/** A valid agent body for the editor: a custom writer by default; override any field. */
export function agentBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Docs helper',
    description: 'Writes the docs for a ticket.',
    role: 'writer',
    instructions: 'Keep it short.',
    runs_on: {
      harness: 'project_default',
      model: { kind: 'harness_default' },
      fallbacks: [],
    },
    tools: ['read', 'edit'],
    write_scope: ['docs/**'],
    inputs: [],
    output: [],
    skills: [],
    memory: { tags: [], include_rejected: true },
    budget: {},
    ...over,
  };
}

export async function startAgentRig(
  opts: { ports?: boolean; draft?: unknown } = {},
): Promise<AgentRig> {
  const storage = createMemoryStorage();
  const config = createMemoryConfigSource();
  await storage.transaction((tx) =>
    tx.projects.upsert({
      id: 'demo',
      slug: 'demo',
      prefix: 'DM',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    }),
  );

  const probes: AgentProbeRequest[] = [];
  let probe: (req: AgentProbeRequest) => Promise<AgentProbeResult> = async () => ({
    ok: true,
    reply: 'I am a test. First rule: keep it short.',
    modelUsed: 'sonnet',
    durationMs: 12,
    costUsd: 0.01,
  });

  const driver = {
    id: 'claude-code',
    models: async () => [
      {
        id: 'sonnet',
        label: 'Sonnet',
        speed: 'balanced',
        cost: 'medium',
        recommended_for: ['writer'],
      },
    ],
    probe: (req: AgentProbeRequest) => {
      probes.push(req);

      return probe(req);
    },
  } as unknown as WorkerDriver;

  const director = createScriptedDirector(
    opts.draft === undefined ? {} : { draft_agent: opts.draft },
  );

  const http = await startHttp(
    buildRoutes({
      ...stubHarnessDeps(),
      engine: { liveRunIds: vi.fn(() => []) } as unknown as Engine,
      storage,
      config,
      ...inertRouteExtras(),
      ...(opts.ports === false
        ? {}
        : { agentPorts: { drivers: createDriverRegistry([driver]), llm: director.llm } }),
      hooks: { handle: vi.fn() },
      owner: 'srv-test',
      startedAt: 0,
      now: () => Date.parse('2026-10-17T12:00:00.000Z'),
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );

  return {
    http,
    config,
    storage,
    probes,
    probeWith(fn) {
      probe = fn;
    },
    director,
    close: () => http.close(),
  };
}
