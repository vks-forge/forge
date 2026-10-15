/**
 * Assembles the Forge server: config, adapters, engine, HTTP, clock and shutdown.
 *
 * Why: this is the composition root (code.md rule 1). It is the only place that opens the
 *   database (and runs its migrations, which the server owns), builds the hook ingress and
 *   starts a socket. It holds no logic of its own: it picks adapters from config, hands them
 *   to the engine and the routes, and returns a small handle. Projects are not built here:
 *   the project registry serves every registered project (each with its own clone,
 *   worktrees, git host and gates) and the projects API adds more while the server runs.
 *   The Worker driver and the Director's model arrive as ports, so production passes the
 *   Claude adapters and the end-to-end test passes fakes through the same assembly, the same
 *   hook route, the same receipts and the same G1 gate. It also wires what lets runs survive a
 *   restart (d-0092): shutdown interrupts live runs instead of cancelling them, the first tick
 *   resumes them, and run secrets live in the SecretStore until the run is over and are swept
 *   at start and after every tick (d-0100). A failure while assembling closes the
 *   database again, so a bad config never leaves a locked file behind.
 *
 * Exports: assembleServer().
 * Depends on: @forge/db, @forge/drivers (systemClock), @forge/engine, @forge/hooks,
 *   @forge/secrets, @forge/tools, and the services/routes of this app.
 *   IO: opens SQLite, creates the data home, binds the port on `start()`.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { openSqlite } from '@forge/db';
import { createReceiptLookup, systemClock } from '@forge/drivers';
import { createEngine, createIdSource, createOwnerId } from '@forge/engine';
import { createFileReportStore } from '@forge/gates';
import { createDpapiSecretStore } from '@forge/secrets';
import { createAuth } from '#/services/auth/create-auth.js';
import { createDriverRegistry } from '#/services/driver-registry.js';
import { createGates } from '#/services/gates.js';
import { createHooks } from '#/services/hook-wiring.js';
import { harnessTestFor } from '#/services/harness-test-route.js';
import { composeHarnessGuard } from '#/services/harness-guard.js';
import { createHarnessSource } from '#/services/harness-source.js';
import { createApiServer } from '#/services/http/create-api-server.js';
import { assertLoopbackBind, closeServer, listen } from '#/services/http/listen.js';
import { createLazySecretStore } from '#/services/lazy-secrets.js';
import { composeProjectMemory } from '#/services/project-memory.js';
import { withKnownProjects } from '#/services/known-project-config.js';
import { createProjectRegistry } from '#/services/project-registry.js';
import { createRunWiring } from '#/services/run-wiring.js';
import { shutdownServer } from '#/services/shutdown.js';
import { createTicker } from '#/services/ticker.js';
import { composeTriggers } from '#/services/triggers.js';
import type {
  AssembleOptions,
  ExternalPorts,
  ForgeServer,
  ServerAddress,
} from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';

/** Builds the server; nothing listens and no tick runs until `start()`. */
export async function assembleServer(
  settings: ServerSettings,
  ports: ExternalPorts,
  options: AssembleOptions = {},
): Promise<ForgeServer> {
  assertLoopbackBind(settings.host);
  const { layout } = settings;
  const log = ports.log ?? (() => undefined);
  const clock = ports.clock ?? systemClock;
  const now = (): number => clock.now();

  await mkdir(dirname(layout.data.dbPath), { recursive: true });
  const sqlite = openSqlite(layout.data.dbPath);
  const { storage, receipts, catalogue } = sqlite;
  // Settings are only served for registered projects; an unknown slug is not given defaults.
  const config = withKnownProjects(sqlite.config, storage);

  try {
    // Before any socket: a server that cannot read or create its token must not start open.
    const auth = await createAuth({
      tokenPath: layout.data.installTokenPath,
      now,
      log,
      restrict: ports.restrictFile,
    });

    const owner = createOwnerId();

    // The DPAPI store is created on first use. Run secrets live in it for the life of each
    // run (d-0100), so it is first touched when the first run starts; a server with no
    // GitHub project and no run (or off Windows) never opens it.
    const secrets =
      ports.secrets ??
      createLazySecretStore(() =>
        createDpapiSecretStore({ dir: layout.data.secretsDir }),
      );

    // Both are built below; a run cannot start before the server listens.
    let buildCheck: (runId: string) => Promise<void> = async () => undefined;
    let address: ServerAddress | null = null;
    const { registry, retirement, prepareRun } = createRunWiring({
      layout,
      storage,
      receipts,
      secrets,
      now,
      log,
      address: () => address,
      // Refuses a run on a harness build with no loaded approvals and records the build.
      checkBuild: (runId) => buildCheck(runId),
    });

    const harness = createHarnessSource(storage);

    const projects = createProjectRegistry({
      storage,
      config,
      secrets,
      worktreesDir: layout.data.worktreesDir,
      gates: (worktrees) =>
        createGates({ storage, receipts, worktrees, registry, env: settings.env }),
      now,
      log,
    });

    await projects.load();

    const parts = await composeProjectMemory(
      layout.data.memoryDir,
      now,
      log,
      projects.slugs(),
    );

    const driver = ports.driver({
      prepareRun,
      receipts: createReceiptLookup(receipts),
      log,
      harness,
      secrets,
    });

    const llm =
      typeof ports.llm === 'function' ? ports.llm({ harness, secrets }) : ports.llm;

    const preflight = await driver.preflight();
    if (!preflight.ok) {
      log('warn', 'worker driver preflight reported issues', {
        issues: preflight.issues,
      });
    }

    // One harness is installed today; the registry is where the next one is added.
    const drivers = createDriverRegistry([driver]);

    const { compat, policy, checkBuild } = await composeHarnessGuard({
      storage,
      catalogue,
      config,
      port: ports.compat,
      supportKey: driver.id,
      dataHome: layout.data.home,
      now,
      log,
    });

    buildCheck = checkBuild;

    const ticker = createTicker({
      tick: async () => {
        await projects.refresh();
        const report = await engine.tick();
        await retirement.sweep();

        return report;
      },
      // Read once at start: the timer period is the one dial that needs a restart.
      intervalMs: (await config.company()).config.engine.tick_interval_ms,
      log,
    });

    const engine = createEngine({
      storage,
      drivers,
      llm,
      memory: parts.source,
      receipts,
      reports: createFileReportStore(layout.data.home),
      project: (slug, view) => projects.runtime(slug, view),
      clock,
      config,
      ids: ports.ids ?? createIdSource(),
      owner,
      catalogueHash: () => policy.catalogueHash(),
      onTickRequested: ticker.requestTick,
      log,
    });

    const { handler: hooks, drain } = createHooks({
      storage,
      receipts,
      registry,
      policy,
      now,
      requestTick: ticker.requestTick,
      log,
    });

    const { registry: triggers, poller } = composeTriggers({
      extra: ports.triggers,
      ingest: (event) => engine.ingest(event),
      pollMs: ports.triggerPollMs,
      log,
    });

    const streams = new AbortController();
    const http = createApiServer(
      {
        engine,
        storage,
        config,
        catalogue,
        compat,
        projects,
        memory: parts.memory,
        triggers,
        hooks,
        secrets,
        harnessTest: harnessTestFor(ports.harnessTest, secrets),
        tickets: auth.tickets,
        sessions: auth.sessions,
        requestShutdown: () =>
          options.onShutdownRequested ? options.onShutdownRequested() : void stopServer(),
        dataHome: layout.data,
        owner,
        startedAt: now(),
        now,
        http: settings.http,
        shutdown: streams.signal,
      },
      auth,
      { webRoot: ports.webRoot, port: () => address?.port, log },
    );

    let stopping: Promise<void> | null = null;

    const handle: ForgeServer = {
      owner,
      storage,
      receipts,
      engine,
      runSecrets: registry,
      projects,
      compat,
      catalogue,
      address: () => address,
      async start() {
        if (address) {
          return address;
        }

        const port = await listen(http, settings.host, settings.port);
        address = { host: settings.host, port, url: `http://${settings.host}:${port}` };
        // Before the first tick (it resumes runs): removes what a crash left, never a live run's.
        await retirement.sweep();
        ticker.start();
        poller.start();
        log('info', 'server listening', { url: address.url, owner });

        return address;
      },
      stop: () => stopServer(),
    };

    function stopServer(): Promise<void> {
      stopping ??= shutdownServer({
        ticker,
        stopPolling: () => poller.stop(),
        engine,
        // The engine marks the run interrupted and stops it on the driver that started it.
        interruptRun: (runId) => engine.interruptRun(runId),
        storage,
        endStreams: () => streams.abort(),
        closeHttp: () => closeServer(http),
        disposePorts: ports.dispose,
        drain,
        drainMs: async () => (await config.company()).config.engine.shutdown_drain_ms,
        graceMs: settings.shutdownGraceMs,
        log,
      });

      return stopping;
    }

    return handle;
  } catch (error) {
    await storage.close().catch(() => undefined);
    throw error;
  }
}
