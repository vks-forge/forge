/**
 * Engine test rig: in-memory storage plus every port faked, one project seeded.
 *
 * Why: every scenario needs the same wiring (storage, scripted driver and model, fake
 *   worktrees, a controllable clock) and the same few moves (send a chat request, run a
 *   tick, let the run pump drain). Building them once keeps each scenario a short story of
 *   "intake, tick, run does X, tick, assert" and lets a second engine be created over the
 *   same storage to simulate a server restart (d-0054).
 *
 * Exports: Rig, makeConfig(), makeRig(), intake().
 * Depends on: @forge/core, @forge/db (in-memory storage, dev-only fake), src/tick/engine,
 *   helpers/*. No IO.
 */

import { ForgeConfig } from '@forge/core';
import type { IntakeEvent, Ticket } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import type { StorageAdapter } from '@forge/core';
import { createEngine } from '#/tick/engine.js';
import type { Engine, EngineDeps, Logger, TickReport } from '#/types/engine.types.js';
import type { ProjectRuntime } from '#/types/verify.types.js';
import {
  createFakeClock,
  createFakeMemory,
  createFakeReceipts,
  createFakeReports,
  createFakeWorktrees,
  createIds,
} from '#tests/helpers/fakes.js';
import { createScriptedDriver } from '#tests/helpers/scripted-driver.js';
import { createScriptedLLM } from '#tests/helpers/scripted-llm.js';

/** The shipped defaults (see .forge/config/forge.yaml), spelled out so tests can override one dial. */
export function makeConfig(over: { engine?: Record<string, unknown> } = {}): ForgeConfig {
  return ForgeConfig.parse({
    models: {
      director: { triage: 'opus', dispatch_prompt: 'opus', steer_reply: 'opus' },
      worker: { express: 'sonnet', standard: 'sonnet', full: 'sonnet' },
    },
    engine: {
      tick_interval_ms: 30_000,
      global_slots: 3,
      max_concurrent_by_state: { in_progress: 3, verifying: 1 },
      stall_ms: 300_000,
      rewake_cap: { max: 3, window_ms: 3_600_000 },
      step_retries: 1,
      step_budget_usd: 0.5,
      confidence_threshold: 0.7,
      interaction_timeout_ms: 14_400_000,
      run_budget: { max_turns: 40, max_usd: 5, turn_ms: 600_000 },
      retry: {
        rate_limit: { base_ms: 60_000, max_ms: 3_600_000, max_attempts: 5 },
        crash: { delay_ms: 10_000, max_attempts: 1 },
        stall: { delay_ms: 10_000, max_attempts: 2 },
        unknown: { delay_ms: 30_000, max_attempts: 1 },
      },
      ...over.engine,
    },
  });
}

export interface Rig {
  readonly storage: StorageAdapter;
  readonly driver: ReturnType<typeof createScriptedDriver>;
  readonly llm: ReturnType<typeof createScriptedLLM>;
  readonly worktrees: ReturnType<typeof createFakeWorktrees>;
  readonly memory: ReturnType<typeof createFakeMemory>;
  readonly receipts: ReturnType<typeof createFakeReceipts>;
  readonly reports: ReturnType<typeof createFakeReports>;
  /** What `deps.project` resolves for every slug; null (the default) leaves tickets in Verifying. */
  readonly runtime: { current: ProjectRuntime | null };
  readonly clock: ReturnType<typeof createFakeClock>;
  readonly deps: EngineDeps;
  readonly engine: Engine;
  readonly logs: { level: string; message: string }[];
  readonly tickRequests: { count: number };
  /** Sends a chat `new_request` and returns the created ticket id. */
  request(text: string, over?: Record<string, unknown>): Promise<string>;
  tick(): Promise<TickReport>;
  /** Lets the run pump drain pending driver events and results. */
  flush(): Promise<void>;
  ticket(id: string): Promise<Ticket>;
  /** A second engine over the same storage and fakes: a restarted server. */
  restart(owner: string): Engine;
  seedProject(over?: Record<string, unknown>): Promise<void>;
}

let dedupe = 0;

export function intake(over: Partial<IntakeEvent> = {}, now = Date.now()): IntakeEvent {
  return {
    source: 'chat',
    kind: 'new_request',
    dedupe_key: `msg-${++dedupe}`,
    actor: { type: 'user', id: 'u1' },
    project: 'forge',
    payload: { text: 'Fix the doctor check' },
    received_at: new Date(now).toISOString(),
    ...over,
  };
}

export interface RigOptions {
  engine?: Record<string, unknown>;
  storage?: StorageAdapter;
}

export async function makeRig(opts: RigOptions = {}): Promise<Rig> {
  const storage = opts.storage ?? createMemoryStorage();
  const driver = createScriptedDriver();
  const llm = createScriptedLLM();
  const worktrees = createFakeWorktrees();
  const memory = createFakeMemory();
  const receipts = createFakeReceipts();
  const reports = createFakeReports();
  const runtime: { current: ProjectRuntime | null } = { current: null };
  const clock = createFakeClock();
  const ids = createIds();
  const logs: { level: string; message: string }[] = [];
  const tickRequests = { count: 0 };
  const log: Logger = (level, message) => logs.push({ level, message });
  const deps: EngineDeps = {
    storage,
    driver: driver.driver,
    llm: llm.llm,
    worktrees,
    memory,
    receipts,
    reports,
    project: () => runtime.current,
    clock,
    config: makeConfig(opts.engine ? { engine: opts.engine } : {}),
    ids,
    owner: 'srv-a',
    baseRef: 'main',
    catalogueHash: 'c'.repeat(64),
    onTickRequested: () => void tickRequests.count++,
    log,
  };

  const engine = createEngine(deps);
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 8; i++) {
      await new Promise<void>((r) => setImmediate(r));
    }
  };

  const rig: Rig = {
    storage,
    driver,
    llm,
    worktrees,
    memory,
    receipts,
    reports,
    runtime,
    clock,
    deps,
    engine,
    logs,
    tickRequests,
    async seedProject(over = {}) {
      await storage.transaction((tx) =>
        tx.projects.upsert({
          id: 'forge',
          slug: 'forge',
          prefix: 'FG',
          harness_defaults: {},
          tier_c_globs: ['**/auth/**'],
          ...over,
        }),
      );
    },
    async request(text, over = {}) {
      const r = await engine.ingest(intake({ payload: { text, ...over } }, clock.now()));
      if (r.status !== 'ticket_created') {
        throw new Error(`not created: ${r.status}`);
      }

      return r.ticketId;
    },
    tick: () => engine.tick(),
    flush,
    async ticket(id) {
      const t = await storage.transaction((tx) => tx.tickets.get(id as Ticket['id']));
      if (!t) {
        throw new Error(`no ticket ${id}`);
      }

      return t;
    },
    restart: (owner) => createEngine({ ...deps, owner }),
  };

  await rig.seedProject();

  return rig;
}
