/**
 * Engine test rig: in-memory storage plus every port faked, one project seeded.
 *
 * Why: every scenario needs the same wiring (storage, scripted driver and model, fake
 *   worktrees, a controllable clock) and the same few moves (send a chat request, run a
 *   tick, let the run pump drain). Building them once keeps each scenario a short story of
 *   "intake, tick, run does X, tick, assert" and lets a second engine be created over the
 *   same storage to simulate a server restart (d-0054).
 *
 * Exports: Rig, makeRig(), intake().
 * Depends on: @forge/core, @forge/db (in-memory storage, dev-only fake), src/tick/engine,
 *   helpers/*. No IO.
 */

import { ProjectConfig } from '@forge/core';
import type {
  ConfigSource,
  DriverRegistry,
  IntakeEvent,
  MemoryIndex,
  StorageAdapter,
  Ticket,
} from '@forge/core';
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
import { createFakeRepoReader } from '#tests/helpers/fake-repo-reader.js';
import type { FakeRepoReader } from '#tests/helpers/fake-repo-reader.js';
import { createFakeResearch } from '#tests/helpers/fake-research.js';
import { tickToIdle } from '#tests/helpers/tick-to-idle.js';
import type { FakeResearch } from '#tests/helpers/fake-research.js';
import { createScriptedDriver } from '#tests/helpers/scripted-driver.js';
import { createScriptedLLM } from '#tests/helpers/scripted-llm.js';

export interface Rig {
  readonly storage: StorageAdapter;
  readonly driver: ReturnType<typeof createScriptedDriver>;
  readonly llm: ReturnType<typeof createScriptedLLM>;
  readonly worktrees: ReturnType<typeof createFakeWorktrees>;
  readonly memory: ReturnType<typeof createFakeMemory>;
  /** The research provider of the engine, when the rig was made with `research: true`; otherwise research is off. */
  readonly research: FakeResearch | undefined;
  /** The project's tracked files at HEAD as the planning steps see them. */
  readonly repo: FakeRepoReader;
  readonly receipts: ReturnType<typeof createFakeReceipts>;
  readonly reports: ReturnType<typeof createFakeReports>;
  /** What `deps.project` resolves for a slug with no entry in `runtimes`; null makes the project unknown to the app. */
  readonly runtime: { current: ProjectRuntime | null };
  /** Per-project runtimes for tests with several projects; takes precedence over `runtime`. */
  readonly runtimes: Map<string, ProjectRuntime>;
  /** Harness ids the registry knows; all resolve to the scripted driver. Remove one to make it unknown. */
  readonly harnesses: Set<string>;
  readonly clock: ReturnType<typeof createFakeClock>;
  /** Settings the engine reads each tick; edit through `append` to change behaviour mid-test. */
  readonly config: ConfigSource;
  /** How many times the engine asked the config source, to pin one read per tick. */
  readonly configReads: { company: number; project: number };
  readonly deps: EngineDeps;
  readonly engine: Engine;
  readonly logs: { level: string; message: string }[];
  readonly tickRequests: { count: number };
  /** Sends a chat `new_request` on the PR fast path (a ticket at intake) and returns the created ticket id. */
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

export interface RigOptions {
  engine?: Record<string, unknown>;
  storage?: StorageAdapter;
  /** Give the engine a fake research provider (default: none, so research is off). */
  research?: boolean;
  /** Give the engine a memory index (default: none, so the Director pastes the whole slice). */
  memoryIndex?: MemoryIndex;
}

export async function makeRig(opts: RigOptions = {}): Promise<Rig> {
  const storage = opts.storage ?? createMemoryStorage();
  const driver = createScriptedDriver();
  const llm = createScriptedLLM();
  const worktrees = createFakeWorktrees();
  const memory = createFakeMemory();
  const repo = createFakeRepoReader();
  const research = opts.research === true ? createFakeResearch() : undefined;
  const receipts = createFakeReceipts();
  const reports = createFakeReports();
  const runtime: { current: ProjectRuntime | null } = {
    current: {
      config: ProjectConfig.parse({
        slug: 'forge',
        prefix: 'FG',
        profile: 'generic',
        default_harness: 'claude-code',
      }),
      gitHost: null,
      gates: [],
      worktrees,
      baseRef: 'main',
    },
  };

  const runtimes = new Map<string, ProjectRuntime>();
  const harnesses = new Set(['claude-code', 'scripted']);
  const drivers: DriverRegistry = {
    get: (id) => (harnesses.has(id) ? driver.driver : null),
    ids: () => [...harnesses].sort(),
  };

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
    drivers,
    llm: llm.llm,
    memory,
    repoReader: repo,
    receipts,
    reports,
    project: (slug) => runtimes.get(slug) ?? runtime.current,
    clock,
    config,
    ids,
    owner: 'srv-a',
    catalogueHash: async () => 'c'.repeat(64),
    onTickRequested: () => void tickRequests.count++,
    log,
    ...(research ? { research } : {}),
    ...(opts.memoryIndex ? { memoryIndex: opts.memoryIndex } : {}),
  };

  const engine = createEngine(deps);
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 8; i++) {
      await new Promise<void>((r) => setImmediate(r));
    }
  };

  const gateStarts = (): number =>
    logs.filter(
      (l) =>
        l.message.startsWith('gates started') ||
        l.message.startsWith('script job started'),
    ).length;

  const rig: Rig = {
    storage,
    driver,
    llm,
    worktrees,
    memory,
    research,
    repo,
    receipts,
    reports,
    runtime,
    runtimes,
    harnesses,
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
          status: 'ready',
          ecosystems: [],
          harness_defaults: {},
          tier_c_globs: [],
          ...over,
        }),
      );
    },
    async request(text, over = {}) {
      // The PR fast path is the one card type that files its ticket at intake (d-0141), so
      // scenarios about running work start there; planned cards make no ticket until approved.
      const r = await engine.ingest(
        intake({ payload: { text, card_type: 'pr_issue', ...over } }, clock.now()),
      );

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
