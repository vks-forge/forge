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
 *   hook route, the same receipts and the same G1 gate. A failure while assembling closes the
 *   database again, so a bad config never leaves a locked file behind.
 *
 * Exports: assembleServer().
 * Depends on: @forge/db, @forge/drivers (systemClock), @forge/engine, @forge/hooks,
 *   @forge/memory, @forge/secrets, @forge/tools, and the services/routes of this app.
 *   IO: opens SQLite, creates the data home, binds the port on `start()`.
 */

import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { openSqlite } from '@forge/db';
import { createReceiptLookup, systemClock } from '@forge/drivers';
import { createEngine, createIdSource, createOwnerId } from '@forge/engine';
import { createFileReportStore } from '@forge/gates';
import {
  createHookHandler,
  createLivenessRecorder,
  createRunSecretRegistry,
} from '@forge/hooks';
import { createFileMemorySource } from '@forge/memory';
import { createDpapiSecretStore } from '@forge/secrets';
import { admit } from '@forge/tools';
import { buildRoutes } from '#/routes/routes.js';
import { createDriverRegistry } from '#/services/driver-registry.js';
import { createGates } from '#/services/gates.js';
import { createHarnessCompat } from '#/services/harness-compat.js';
import { DEFAULT_HARNESS, createHarnessSource } from '#/services/harness-source.js';
import { assertLoopbackBind, closeServer, listen } from '#/services/http/listen.js';
import { createRouter } from '#/services/http/router.js';
import { createLazySecretStore } from '#/services/lazy-secrets.js';
import { createPrepareRun } from '#/services/prepare-run.js';
import { createProjectRegistry } from '#/services/project-registry.js';
import { shutdownServer } from '#/services/shutdown.js';
import { createTicker } from '#/services/ticker.js';
import { createToolPolicy } from '#/services/tool-policy.js';
import { composeTriggers } from '#/services/triggers.js';
import type { ExternalPorts, ForgeServer, ServerAddress } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';

/** Builds the server; nothing listens and no tick runs until `start()`. */
export async function assembleServer(
  settings: ServerSettings,
  ports: ExternalPorts,
): Promise<ForgeServer> {
  assertLoopbackBind(settings.host);
  const { layout } = settings;
  const log = ports.log ?? (() => undefined);
  const clock = ports.clock ?? systemClock;
  const now = (): number => clock.now();

  await mkdir(dirname(layout.data.dbPath), { recursive: true });
  const { storage, receipts, config, catalogue } = openSqlite(layout.data.dbPath);

  try {
    const owner = createOwnerId();
    const registry = createRunSecretRegistry();

    // The DPAPI store is only created when a GitHub key is first read or written, so a
    // server with local projects only (or off Windows) never touches it.
    const secrets =
      ports.secrets ??
      createLazySecretStore(() =>
        createDpapiSecretStore({ dir: layout.data.secretsDir }),
      );

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

    let address: ServerAddress | null = null;
    const prepareRun = createPrepareRun({
      runsDir: layout.data.runsDir,
      dbPath: layout.data.dbPath,
      mcpEntry: layout.mcpEntry,
      nodePath: process.execPath,
      registry,
      hookBaseUrl: () => {
        if (!address) {
          throw new InvalidInputError(
            'a run was prepared before the server was listening',
          );
        }

        return address.url;
      },
    });

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

    const compat = createHarnessCompat({
      storage,
      catalogue,
      port: ports.compat,
      supportKey: driver.id,
      now,
      log,
    });

    // Reads the installed build; a build seen for the first time is checked in the background.
    await compat.observe(DEFAULT_HARNESS);

    const policy = createToolPolicy({
      storage,
      catalogue,
      config,
      compat,
      dataHome: layout.data.home,
    });

    // A catalogue that does not load stops the server here, not at the first tool call.
    await policy.catalogueHash();

    const ticker = createTicker({
      tick: () => engine.tick(),
      // Read once at start: the timer period is the one dial that needs a restart.
      intervalMs: (await config.company()).config.engine.tick_interval_ms,
      log,
    });

    const engine = createEngine({
      storage,
      drivers,
      llm,
      memory: createFileMemorySource(layout.memoryDir, {
        onSkip: (path, reason) => log('warn', 'memory record skipped', { path, reason }),
      }),
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

    const hooks = createHookHandler({
      db: storage,
      receipts,
      admit,
      credentials: registry.credentials,
      admitContext: policy.admitContext,
      clock: () => new Date(now()),
      requireLiveness: true,
      onLiveness: createLivenessRecorder({
        storage,
        now: () => new Date(now()),
        onRegistered: ticker.requestTick,
      }),
      audit: (runId, entry) =>
        log('warn', 'hook request refused', {
          run: runId,
          code: entry.code,
          suppressed: entry.suppressed,
        }),
    });

    const { registry: triggers, poller } = composeTriggers({
      extra: ports.triggers,
      ingest: (event) => engine.ingest(event),
      pollMs: ports.triggerPollMs,
      log,
    });

    const streams = new AbortController();
    const router = createRouter(
      buildRoutes({
        engine,
        storage,
        config,
        catalogue,
        compat,
        projects,
        triggers,
        hooks,
        secrets,
        harnessTest: (setup, live) =>
          ports.harnessTest
            ? ports.harnessTest(setup, live, secrets)
            : Promise.resolve({
                auth_mode: setup.authMode,
                ok: false,
                live: 'skipped',
                error: 'harness testing is not available in this build',
              }),
        owner,
        startedAt: now(),
        now,
        http: settings.http,
        shutdown: streams.signal,
      }),
    );

    const http = createServer((req, res) => {
      void router.dispatch(req, res);
    });

    let stopping: Promise<void> | null = null;

    return {
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
        ticker.start();
        poller.start();
        log('info', 'server listening', { url: address.url, owner });

        return address;
      },
      stop() {
        stopping ??= shutdownServer({
          ticker,
          stopPolling: () => poller.stop(),
          engine,
          // A run keeps the driver that started it.
          cancelRun: async (runId) => {
            const run = await storage.transaction((tx) => tx.runs.get(runId));
            await (run ? drivers.get(run.harness) : null)?.cancel({ runId });
          },
          storage,
          endStreams: () => streams.abort(),
          closeHttp: () => closeServer(http),
          disposePorts: ports.dispose,
          graceMs: settings.shutdownGraceMs,
          log,
        });

        return stopping;
      },
    };
  } catch (error) {
    await storage.close().catch(() => undefined);
    throw error;
  }
}
