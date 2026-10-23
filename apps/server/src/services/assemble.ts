/**
 * Assembles the Forge server: config, adapters, engine, HTTP, clock and shutdown.
 *
 * Why: this is the composition root (code.md rule 1). It is the only place that opens the
 *   database (and runs its migrations, which the server owns), builds the hook ingress and
 *   starts a socket. It holds no logic of its own: it picks adapters from config, hands them
 *   to the engine and the routes, and returns a small handle. Projects are not built here: the project registry serves
 *   every registered project (each with its own clone, worktrees, git host and gates) and the projects API adds more
 *   while the server runs. The Worker driver and the Director's model arrive as ports, so production passes the Claude
 *   adapters and the end-to-end test passes fakes through the same assembly, hook route, receipts and G1 gate. It also wires what lets runs survive a
 *   restart (d-0092): shutdown interrupts live runs instead of cancelling them, the first tick
 *   resumes them, and run secrets live in the SecretStore until the run is over and are swept
 *   at start and after every tick (d-0100). Planning reads the code via a git repo reader
 *   (d-0131) and the web through one research provider that follows the saved settings (d-0144). Agent routes get the drivers and the Director model. A failed assembly closes the DB.
 *
 * Exports: assembleServer().
 * Depends on: @forge/db, @forge/drivers (systemClock), @forge/engine, @forge/git, @forge/hooks, @forge/tools,
 *   services/data-wiring (secrets, optional debug trace, d-0163) and the other services. IO: opens SQLite,
 *   creates the data home, binds the port on `start()`.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { openSqlite } from '@forge/db';
import { createReceiptLookup, systemClock } from '@forge/drivers';
import { createEngine, createIdSource, createOwnerId } from '@forge/engine';
import { createFileReportStore } from '@forge/gates';
import { createGitRepoReader } from '@forge/git';
import { composeData } from '#/services/data-wiring.js';
import { createAuth } from '#/services/auth/create-auth.js';
import { createFolderPicker } from '#/services/folder-picker/index.js';
import { createFolderRevealer } from '#/services/folder-reveal.js';
import { createGates } from '#/services/gates.js';
import { createHooks } from '#/services/hook-wiring.js';
import { harnessTestFor } from '#/services/harness-test-route.js';
import { composeHarnessGuard } from '#/services/harness-guard.js';
import { createHarnessSource } from '#/services/harness-source.js';
import { createApiServer } from '#/services/http/create-api-server.js';
import { assertLoopbackBind, closeServer, listen } from '#/services/http/listen.js';
import { composeProjectMemory } from '#/services/project-memory.js';
import { createResearchWiring } from '#/services/research-wiring.js';
import { createProjectRegistry } from '#/services/project-registry.js';
import { createRunWiring } from '#/services/run-wiring.js';
import { stopOnce } from '#/services/shutdown.js';
import { composeWorker } from '#/services/worker-wiring.js';
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
  const { receipts, catalogue } = sqlite;
  // Secrets, the optional debug trace (d-0163), and storage and config wrapped for it.
  const { secrets, trace, projectEvents, storage, config } = composeData({
    settings,
    ports,
    storage: sqlite.storage,
    config: sqlite.config,
    clock,
    log,
  });

  try {
    // Before any socket: a server that cannot read or create its token must not start open.
    const auth = await createAuth({
      tokenPath: layout.data.installTokenPath,
      now,
      log,
      restrict: ports.restrictFile,
    });

    const owner = createOwnerId();
    // Both are built below; no run starts before the server listens.
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
      checkBuild: (runId) => buildCheck(runId), // refuses a build with no loaded approvals
    });

    const projects = createProjectRegistry({
      storage,
      config,
      secrets,
      worktreesDir: layout.data.worktreesDir,
      cacheDir: join(layout.data.home, 'cache'),
      gates: (worktrees) =>
        createGates({ storage, receipts, worktrees, registry, env: settings.env }),
      now,
      log,
    });

    await projects.load();

    const parts = await composeProjectMemory({
      storage,
      dataHome: layout.data,
      now,
      log,
      slugs: projects.slugs(),
      catalogue,
    });

    const { driver, llm, drivers } = await composeWorker(
      ports,
      {
        prepareRun,
        receipts: createReceiptLookup(receipts),
        log,
        harness: createHarnessSource(storage),
        secrets,
      },
      log,
      trace.enabled ? trace.sink : undefined,
    );

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

    const research = await createResearchWiring(config, ports.researchNet);
    const engine = createEngine({
      storage,
      drivers,
      llm,
      ...parts.forEngine,
      repoReader: createGitRepoReader(),
      receipts,
      reports: createFileReportStore(layout.data.home),
      project: (slug, view) => projects.runtime(slug, view),
      clock,
      config,
      ids: ports.ids ?? createIdSource(),
      owner,
      catalogueHash: () => policy.catalogueHash(),
      toolCatalogued: (tool) => policy.toolCatalogued(tool),
      onTickRequested: ticker.requestTick,
      projectEvents,
      research: research.provider,
      trace: trace.sink,
      log,
    });

    const { handler: hooks, drain } = createHooks({
      storage,
      receipts,
      registry,
      policy,
      now,
      requestTick: ticker.requestTick,
      raiseToolApproval: (request) => engine.raiseToolApproval(request),
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
        research,
        projects,
        ...parts.forRoutes,
        triggers,
        hooks,
        secrets,
        harnessTest: harnessTestFor(ports.harnessTest, secrets),
        agentPorts: { drivers, llm },
        projectEvents,
        tickets: auth.tickets,
        sessions: auth.sessions,
        prover: auth.prover,
        isDraining: drain.isDraining,
        folderPicker: createFolderPicker(),
        folderRevealer: createFolderRevealer(),
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
      {
        webRoot: ports.webRoot,
        port: () => address?.port,
        log,
        ...(trace.enabled ? { trace: trace.sink } : {}),
      },
    );

    const stopServer = stopOnce(
      {
        ticker,
        stopPolling: () => poller.stop(),
        engine,
        interruptRun: (runId) => engine.interruptRun(runId),
        storage,
        endStreams: () => streams.abort(),
        closeHttp: () => closeServer(http),
        disposePorts: ports.dispose,
        drain,
        drainMs: async () => (await config.company()).config.engine.shutdown_drain_ms,
        graceMs: settings.shutdownGraceMs,
        log,
      },
      () => trace.close(),
    );

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

    return handle;
  } catch (error) {
    await storage.close().catch(() => undefined);
    await trace.close();
    throw error;
  }
}
