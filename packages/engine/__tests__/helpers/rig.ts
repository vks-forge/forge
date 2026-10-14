/**
 * Engine test rig: in-memory storage plus every port faked, one project seeded.
 *
 * Why: every scenario needs the same wiring (storage, scripted driver and model, fake
 *   worktrees, a controllable clock) and the same few moves (send a chat request, run a
 *   tick, let the run pump drain). Building them once keeps each scenario a short story of
 *   "intake, tick, run does X, tick, assert" and lets a second engine be created over the
 *   same storage to simulate a server restart (d-0054).
 *
 * Exports: Rig, makeRig(), intake(), tickToIdle().
 * Depends on: @forge/core, @forge/db (in-memory storage, dev-only fake), src/tick/engine,
 *   helpers/*. No IO.
 */

import type { ConfigSource, IntakeEvent, StorageAdapter, Ticket } from '@forge/core';
import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
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
  /** Settings the engine reads each tick; edit through `append` to change behaviour mid-test. */
  readonly config: ConfigSource;
  /** How many times the engine asked the config source, to pin one read per tick. */
  readonly configReads: { company: number; project: number };
  readonly deps: EngineDeps;
  readonly engine: Engine;
  readonly logs: { level: string; message: string }[];
  readonly tickRequests: { count: number };
  /** Sends a chat `new_request` and returns the created ticket id. */
  request(text: string, over?: Record<string, unknown>): Promise<string>;
  tick(): Promise<TickReport>;
  /** `tick()` for another engine over the same fakes (a restarted server). */
  tickOn(engine: Engine): Promise<TickReport>;
  /** Lets the run pump drain pending driver events and results. */
  flush(): Promise<void>;
  ticket(id: string): Promise<Ticket>;
  /** A second engine over the same storage and fakes: a restarted server. */
  restart(owner: string, over?: Partial<EngineDeps>): Engine;
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

/** Adds the lists of `b` to those of `a`; the tick that applies a gate job reports what the one that started it could not. */
function mergeReports(a: TickReport, b: TickReport): TickReport {
  return {
    ...a,
    crashed: [...a.crashed, ...b.crashed],
    settled: [...a.settled, ...b.settled],
    triaged: [...a.triaged, ...b.triaged],
    dispatched: [...a.dispatched, ...b.dispatched],
    steered: [...a.steered, ...b.steered],
    verified: [...a.verified, ...b.verified],
    parked: [...a.parked, ...b.parked],
    violations: [...a.violations, ...b.violations],
    rejectedSteps: [...a.rejectedSteps, ...b.rejectedSteps],
    errors: [...a.errors, ...b.errors],
  };
}

/**
 * One tick, plus the follow-up tick a finished gate job asks for. Gates run beside the tick
 * (verify-gates jobs), so a scenario that reads "tick: merged" needs both. Use `engine.tick()`
 * directly to look at the in-between state.
 */
export async function tickToIdle(
  engine: Engine,
  flush: () => Promise<void>,
  gateJobsStarted: () => number,
): Promise<TickReport> {
  const before = gateJobsStarted();
  const first = await engine.tick();
  if (gateJobsStarted() === before) {
    return first;
  }

  for (let i = 0; i < 20 && engine.gateJobsInFlight() > 0; i++) {
    await flush();
  }

  return mergeReports(first, await engine.tick());
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
  const source = createMemoryConfigSource(clock);
  const configReads = { company: 0, project: 0 };
  const config: ConfigSource = {
    company: () => {
      configReads.company++;

      return source.company();
    },
    project: (slug) => {
      configReads.project++;

      return source.project(slug);
    },
    history: (scope, project) => source.history(scope, project),
    append: (input) => source.append(input),
  };

  if (opts.engine) {
    await config.append({
      scope: 'company',
      doc: { engine: opts.engine },
      author: 'test',
      reason: 'rig engine override',
      expectedVersion: 0,
    });
  }

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
    config,
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

  const gateStarts = (): number =>
    logs.filter((l) => l.message.startsWith('gates started')).length;

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
    config,
    configReads,
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
    tick: () => tickToIdle(engine, flush, gateStarts),
    tickOn: (other) => tickToIdle(other, flush, gateStarts),
    flush,
    async ticket(id) {
      const t = await storage.transaction((tx) => tx.tickets.get(id as Ticket['id']));
      if (!t) {
        throw new Error(`no ticket ${id}`);
      }

      return t;
    },
    restart: (owner, over = {}) => createEngine({ ...deps, ...over, owner }),
  };

  await rig.seedProject();

  return rig;
}
